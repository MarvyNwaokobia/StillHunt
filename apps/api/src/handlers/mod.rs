use actix_web::{web, HttpResponse};

pub mod players;
pub mod battles;
pub mod missions;
pub mod items;
pub mod decay;
pub mod duels;
pub mod ws;
pub mod endless;
pub mod survival;
pub mod gauntlet;
pub mod seasons;
pub mod claims;
pub mod ledger;
pub mod debts;
pub mod gas;
pub mod admin;
pub mod consistency;
pub mod client_errors;

async fn health() -> HttpResponse {
    HttpResponse::Ok().finish()
}

// Deep readiness probe. Unlike `/health` above (which only proves the web process is
// accepting connections), this verifies the DATABASE is actually reachable — the thing
// every real request needs. Point external monitors (UptimeRobot) at this so a green
// check means "players can load", not just "the process is up". Deliberately NOT wired
// to the platform healthcheck: a transient DB blip returning 503 here should page a
// human, not make Railway restart a perfectly healthy process (a restart can't fix the
// DB anyway).
async fn ready(state: web::Data<crate::AppState>) -> HttpResponse {
    match sqlx::query("SELECT 1").execute(&state.db).await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({ "status": "ready", "db": "up" })),
        Err(e) => {
            tracing::warn!("readiness check failed: db unreachable: {}", e);
            HttpResponse::ServiceUnavailable()
                .json(serde_json::json!({ "status": "degraded", "db": "down" }))
        }
    }
}

// Friendly root — this is a backend API, not a website, so hitting `/` in a browser
// used to 404 and look "down". Return a small alive message + where the real routes are.
async fn root() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({
        "service": "stillhunt-api",
        "status": "ok",
        "message": "StillHunt API — OK. This is the backend for stillhunt.app; there is no web page here.",
        "health": "/health",
    }))
}

pub fn configure_routes(cfg: &mut web::ServiceConfig) {
    cfg
        .route("/", web::get().to(root))
            .route("/client-errors", web::post().to(client_errors::report))
        .route("/health", web::get().to(health))
        // DB-aware readiness — external monitors should watch THIS, not /health.
        .route("/health/ready", web::get().to(ready))
        // Read-only self-audit; the cron fails its job when this reports trouble.
        .route("/health/consistency", web::post().to(consistency::run_consistency_check))
        .route("/relay-address", web::get().to(ledger::get_relay_address))
        .route("/withdraw-fee", web::get().to(ledger::get_withdraw_fee))
        // Which reward pools this server actually loaded — see get_pools.
        .route("/pools", web::get().to(ledger::get_pools))
        .route("/ws/battle", web::get().to(ws::battle_ws))
        .service(
            web::scope("/players")
                .route("", web::get().to(players::list_players))
                .route("", web::post().to(players::create_player))
                .route("/search", web::get().to(players::search_players))
                .route("/by-username/{username}", web::get().to(players::get_player_by_username))
                .route("/{wallet}", web::get().to(players::get_player))
                .route("/{wallet}/daily-claim", web::post().to(players::daily_claim))
                .route("/{wallet}/daily-claim-status", web::get().to(players::daily_claim_status))
                .route("/{wallet}/decay-check", web::post().to(players::decay_check))
                .route("/{wallet}", web::patch().to(players::update_player))
                .route("/{wallet}/identity", web::post().to(players::set_magic_identity))
                .route("/{wallet}/inventory", web::get().to(players::get_inventory))
                .route("/{wallet}/earn-cap", web::get().to(players::get_earn_cap))
                .route("/{wallet}/inventory", web::post().to(players::add_inventory_item))
                .route("/{wallet}/username-available/{username}", web::get().to(players::check_username))
                .route("/{wallet}/referrals", web::get().to(players::get_referrals))
                .route("/{wallet}/achievements", web::get().to(players::get_achievements))
                .route("/{wallet}/achievements/check", web::post().to(players::check_achievements))
                .route("/{wallet}/inventory/{item_id}", web::patch().to(players::toggle_equip))
                .route("/{wallet}/battles", web::get().to(players::get_battles))
                .route("/{wallet}/freeze-decay", web::post().to(players::freeze_decay))
                .route("/{wallet}/ledger-summary", web::get().to(ledger::get_ledger_summary))
                // The Bank's claim counter. Avalanche only: Celo auto-pays G$ on
                // every win and has no accrued balance to claim.
                .route("/{wallet}/claimable", web::get().to(claims::get_claimable))
                .route("/{wallet}/claim", web::post().to(claims::claim))
                .route("/{wallet}/transfer", web::post().to(ledger::transfer_out))
                .route("/{wallet}/debt", web::get().to(debts::get_debt))
                .route("/{wallet}/settle-debt", web::post().to(debts::settle_debt))
                .route("/{wallet}/gas-topup", web::post().to(gas::gas_topup)),
        )
        .service(
            web::scope("/battles")
                .route("/bot/start", web::post().to(battles::start_bot_fight))
                .route("/bot/round", web::post().to(battles::bot_fight_round))
                .route("/fight/start", web::post().to(battles::start_live_fight))
                .route("/fight/complete", web::post().to(battles::complete_live_fight))
                .route("/pvp/complete", web::post().to(battles::complete_pvp_match))
                .route("/bounties/reconcile", web::post().to(battles::reconcile_first_clear_bounties))
                .route("/challenge", web::post().to(battles::challenge_player)),
        )
        .service(
            web::scope("/missions")
                .route("/active", web::get().to(missions::get_active_mission))
                .route("/deploy", web::post().to(missions::deploy_mission))
                .route("/{id}/collect", web::post().to(missions::collect_mission)),
        )
        .service(
            web::scope("/items")
                .route("", web::get().to(items::list_items))
                .route("/{id}/purchase", web::post().to(items::purchase_item))
                .route("/{id}/purchase-relay", web::post().to(items::purchase_item_relay)),
        )
        .service(
            web::scope("/duels")
                .route("", web::get().to(duels::list_duels))
                .route("", web::post().to(duels::create_duel))
                .route("/{id}/accept", web::post().to(duels::accept_duel))
                .route("/{id}/submit", web::post().to(duels::submit_duel_score))
                .route("/{id}/cancel", web::post().to(duels::cancel_duel)),
        )
        .service(
            web::scope("/decay")
                .route("/run", web::post().to(decay::run_decay_sweep)),
        )
        .service(
            web::scope("/endless")
                .route("/start", web::post().to(endless::start_endless))
                .route("/wave", web::post().to(endless::endless_wave))
                .route("/end", web::post().to(endless::end_endless))
                .route("/progress", web::get().to(endless::get_progress))
                .route("/board", web::get().to(endless::get_board))
                .route("/death", web::post().to(endless::record_death))
                .route("/score", web::post().to(endless::submit_score))
                .route("/leaderboard", web::get().to(endless::get_leaderboard)),
        )
        .service(
            web::scope("/survival")
                .route("/arm", web::post().to(survival::arm_session))
                .route("/rearm", web::post().to(survival::rearm)),
        )
        .service(
            web::scope("/gauntlet")
                .route("/start", web::post().to(gauntlet::start_run))
                .route("/submit", web::post().to(gauntlet::submit_run))
                .route("/leaderboard", web::get().to(gauntlet::leaderboard)),
        )
        .service(
            web::scope("/admin")
                .route("/login", web::post().to(admin::login))
                .route("/stats", web::get().to(admin::get_stats))
                .route("/onchain", web::get().to(admin::list_onchain))
                .route("/seasons", web::get().to(admin::list_seasons))
                .route("/seasons", web::post().to(admin::create_season))
                .route("/seasons/{id}/end", web::post().to(admin::end_season))
                .route("/seasons/{id}", web::delete().to(admin::delete_season))
                .route("/seasons/{id}", web::patch().to(admin::update_season))
                .route("/seasons/{id}/reset-progress", web::post().to(admin::reset_season_progress))
                .route("/seasons/{id}/fund", web::post().to(seasons::fund))
                .route("/seasons/{id}/payout-preview", web::get().to(seasons::payout_preview))
                .route("/seasons/{id}/payout", web::post().to(seasons::payout))
                .route("/referrals/retry", web::post().to(players::retry_referrals)),
        )
        .service(
            web::scope("/seasons")
                .route("/current", web::get().to(seasons::current)),
        );
}
