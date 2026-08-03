use actix_cors::Cors;
use actix_web::{middleware::Logger, web, App, HttpServer};
use dashmap::DashMap;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use std::str::FromStr;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use uuid::Uuid;

mod handlers;
mod migrate;
mod models;
mod services;
mod utils;

pub struct AppState {
    pub db:                sqlx::PgPool,
    pub rewards:           Option<services::rewards::RewardService>,
    pub chain:             Option<services::chain::ChainWriter>,
    /// The Avalanche C-Chain relay. `None` until the contracts are deployed and
    /// AVALANCHE_PRIVATE_KEY + AVALANCHE_GAME_RECORD_CONTRACT are set, which is
    /// harmless: nothing is written there and the Celo game is unaffected.
    pub avalanche:         Option<services::avalanche::AvalancheWriter>,
    pub battle_limiter:    services::rate_limiter::RateLimiter,
    pub game_server:       services::game_server::GameServerHandle,
    pub bot_fight_sessions: std::sync::Arc<DashMap<Uuid, services::battle::BotFightSession>>,
    pub live_fight_sessions: std::sync::Arc<DashMap<Uuid, services::battle::LiveFightSession>>,
    pub endless_sessions: std::sync::Arc<DashMap<Uuid, services::battle::EndlessSession>>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let connect_opts = PgConnectOptions::from_str(&database_url)
        .expect("Invalid DATABASE_URL")
        .statement_cache_capacity(0); // required for PgBouncer transaction-mode pooler
    let db = PgPoolOptions::new()
        .max_connections(20)
        .connect_with(connect_opts)
        .await?;

    // Apply any pending schema migrations BEFORE serving. Railway auto-deploys from main,
    // so this is what keeps a schema-dependent deploy from shipping ahead of its migration.
    // A failure aborts boot on purpose (better than serving on a half-migrated schema).
    migrate::run(&db).await?;

    let rewards = services::rewards::RewardService::from_env()
        .map_err(|e| tracing::warn!("Reward service disabled: {}", e))
        .ok();

    let chain = services::chain::ChainWriter::from_env();
    if chain.is_none() {
        tracing::info!("ChainWriter disabled (GAME_RECORD_CONTRACT not set)");
    }

    let avalanche = services::avalanche::AvalancheWriter::from_env();
    match &avalanche {
        None => tracing::info!(
            "Avalanche relay disabled (AVALANCHE_PRIVATE_KEY / AVALANCHE_GAME_RECORD_CONTRACT not set)"
        ),
        Some(av) => {
            // Read the balance once at boot and say so plainly. The relay running dry
            // is this project's most repeated production failure, and the version of
            // it that costs the most time is the silent one — writes simply stop and
            // nobody knows why. One loud line at startup is cheap insurance.
            let av = av.clone();
            tokio::spawn(async move {
                match av.relay_gas_balance().await {
                    Some(bal) if av.relay_can_pay().await => tracing::info!(
                        "Avalanche relay {:?} funded: {} wei AVAX", av.relay_address(), bal
                    ),
                    Some(bal) => tracing::error!(
                        "Avalanche relay {:?} is LOW ({} wei AVAX) — writes will start failing. Top it up.",
                        av.relay_address(), bal
                    ),
                    None => tracing::warn!("Avalanche relay balance unreadable at boot (RPC issue?)"),
                }
            });
        }
    }

    // Start event listener as a background task
    if let Some(listener) = services::event_listener::EventListener::from_env(db.clone()) {
        listener.spawn();
    } else {
        tracing::info!("Event listener disabled (MARKETPLACE_CONTRACT not set)");
    }

    // Rate limiter — shared across all workers via AppState (DashMap is Send + Sync)
    // battle_limiter: 10 requests / 60s per IP
    let battle_limiter = services::rate_limiter::RateLimiter::new(10, 60);
    let game_server    = services::game_server::GameServerHandle::spawn(db.clone());

    // In-progress bot fights — keyed by session id, shared across all workers
    // (an Arc, not a per-worker instance, so /round requests reach the
    // session created by /start regardless of which worker handles them).
    let bot_fight_sessions: std::sync::Arc<DashMap<Uuid, services::battle::BotFightSession>> =
        std::sync::Arc::new(DashMap::new());
    // In-progress live fights — server-issued tokens for the real-time earn loop.
    let live_fight_sessions: std::sync::Arc<DashMap<Uuid, services::battle::LiveFightSession>> =
        std::sync::Arc::new(DashMap::new());
    let endless_sessions: std::sync::Arc<DashMap<Uuid, services::battle::EndlessSession>> =
        std::sync::Arc::new(DashMap::new());

    // FRONTEND_ORIGIN: comma-separated list of allowed origins.
    // Defaults to production URL so deploys work without manual env var setup.
    // Always allows localhost for local dev.
    let raw_origins = std::env::var("FRONTEND_ORIGIN")
        .unwrap_or_else(|_| "https://stillhunt.app,https://stillhunt.vercel.app".into());
    let allowed_origins: Vec<String> = raw_origins
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    let bind_addr = std::env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".into());
    tracing::info!("Starting StillHunt API on {}", bind_addr);
    tracing::info!("CORS allowed origins: {:?}", allowed_origins);

    HttpServer::new(move || {
        let origins = allowed_origins.clone();
        let cors = Cors::default()
            .allowed_origin_fn(move |origin, _req_head| {
                let s = origin.to_str().unwrap_or("");
                s.starts_with("http://localhost:")
                    || s.starts_with("https://localhost:")
                    || origins.iter().any(|o| s == o.as_str())
            })
            .allow_any_method()
            .allow_any_header()
            .max_age(3600);

        App::new()
            .app_data(web::Data::new(AppState {
                db:             db.clone(),
                rewards:        rewards.clone(),
                chain:          chain.clone(),
                avalanche:      avalanche.clone(),
                battle_limiter: services::rate_limiter::RateLimiter::new(10, 60),
                game_server:    game_server.clone(),
                bot_fight_sessions: bot_fight_sessions.clone(),
                live_fight_sessions: live_fight_sessions.clone(),
                endless_sessions: endless_sessions.clone(),
            }))
            .wrap(Logger::default())
            .wrap(cors)
            .configure(handlers::configure_routes)
    })
    .bind(&bind_addr)?
    .run()
    .await?;

    Ok(())
}
