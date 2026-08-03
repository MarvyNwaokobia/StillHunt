use actix_web::{web, HttpRequest, HttpResponse};
use chrono::Utc;
use serde_json::json;
use uuid::Uuid;

use crate::AppState;
use crate::models::mission::CollectResult;

// ── GET /missions/active?wallet=:wallet ───────────────────────────────────────
#[derive(serde::Deserialize)]
pub struct WalletQuery { pub wallet: String }

pub async fn get_active_mission(
    state: web::Data<AppState>,
    query: web::Query<WalletQuery>,
) -> HttpResponse {
    let result = sqlx::query_as::<_, crate::models::mission::Mission>(
        "SELECT * FROM missions WHERE wallet_address = $1 AND collected = false
         ORDER BY deployed_at DESC LIMIT 1",
    )
    .bind(&query.wallet)
    .fetch_optional(&state.db)
    .await;

    match result {
        Ok(Some(m)) => HttpResponse::Ok().json(m),
        Ok(None)    => HttpResponse::NotFound().json(json!({"mission": null})),
        Err(_)      => HttpResponse::InternalServerError().finish(),
    }
}

// ── POST /missions/deploy ─────────────────────────────────────────────────────
#[derive(serde::Deserialize)]
pub struct DeployRequest { pub wallet_address: String }

pub async fn deploy_mission(
    state: web::Data<AppState>,
    body: web::Json<DeployRequest>,
) -> HttpResponse {
    let wallet = &body.wallet_address;
    let now    = Utc::now();
    let collect_by = now + chrono::Duration::minutes(30);

    let result = sqlx::query_as::<_, crate::models::mission::Mission>(
        "INSERT INTO missions (wallet_address, deployed_at, collect_by, collected, item_dropped, xp_awarded)
         VALUES ($1, $2, $3, false, null, 0)
         RETURNING *",
    )
    .bind(wallet)
    .bind(now)
    .bind(collect_by)
    .fetch_one(&state.db)
    .await;

    match result {
        Ok(m)  => HttpResponse::Ok().json(m),
        Err(e) => {
            tracing::error!("Deploy mission failed: {}", e);
            HttpResponse::InternalServerError().json(json!({"error": "Failed to deploy mission"}))
        }
    }
}

pub async fn collect_mission(
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
    req: HttpRequest,
) -> HttpResponse {
    let mission_id = path.into_inner();
    let wallet = match req.headers().get("x-wallet").and_then(|v| v.to_str().ok()) {
        Some(w) => w.to_string(),
        None => return HttpResponse::BadRequest().json(json!({"error": "Missing x-wallet header"})),
    };

    let mission = sqlx::query_as::<_, crate::models::mission::Mission>(
        "SELECT * FROM missions WHERE id = $1 AND wallet_address = $2",
    )
    .bind(mission_id)
    .bind(&wallet)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten();

    let Some(mission) = mission else {
        return HttpResponse::NotFound().json(json!({"error": "Mission not found"}));
    };

    if mission.collected {
        return HttpResponse::Conflict().json(json!({"error": "Mission already collected"}));
    }

    let ready_at = mission.deployed_at + chrono::Duration::minutes(30);
    if Utc::now() < ready_at {
        return HttpResponse::BadRequest().json(json!({"error": "Mission not complete yet"}));
    }

    // Roll loot table: 60% common weapon, 25% common shield, 10% rare weapon, 5% rare shield
    let item_dropped = roll_loot_drop(&state.db).await;
    let xp = crate::models::mission::CollectResult { item_dropped: item_dropped.clone(), xp: 50 };

    // Mark mission as collected
    let _ = sqlx::query(
        "UPDATE missions SET collected = true, item_dropped = $1, xp_awarded = 50 WHERE id = $2",
    )
    .bind(item_dropped.as_ref().map(|id| Uuid::parse_str(id).ok()).flatten())
    .bind(mission_id)
    .execute(&state.db)
    .await;

    // Credit the XP through the shared award path. This was a direct
    // `xp = LEAST(xp + 50, 999)` — a third hardcoded copy of the stale 999 ceiling —
    // which silently discarded the XP of anyone already past it and could never rank
    // anyone up. award_player owns the progressive curve, the rank climb and the
    // save-failure logging, so idle XP now behaves exactly like every other source.
    // An idle collect is not a fight: it must not touch the win/loss record
    // (count_result = false) and is not refereed combat, so it earns no rank-up
    // bonus eligibility (reward_eligible = false) — it still advances the rank itself.
    let now = Utc::now();
    let _ = crate::handlers::battles::award_player(
        &state, &wallet, true, 50, 1, false, false,
    ).await;

    // Add item to inventory if dropped
    if let Some(ref item_id) = item_dropped {
        if let Ok(iid) = Uuid::parse_str(item_id) {
            let _ = sqlx::query(
                "INSERT INTO inventory (wallet_address, item_id, equipped, acquired_at) VALUES ($1, $2, false, $3) ON CONFLICT DO NOTHING",
            )
            .bind(&wallet)
            .bind(iid)
            .bind(now)
            .execute(&state.db)
            .await;
        }
    }

    HttpResponse::Ok().json(xp)
}

async fn roll_loot_drop(db: &sqlx::PgPool) -> Option<String> {
    let roll: f64 = rand::random();
    let (category, rarity) = if roll < 0.60 {
        ("weapon", "common")
    } else if roll < 0.85 {
        ("shield", "common")
    } else if roll < 0.95 {
        ("weapon", "rare")
    } else {
        ("shield", "rare")
    };

    let result: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM items WHERE category = $1 AND rarity = $2 ORDER BY RANDOM() LIMIT 1",
    )
    .bind(category)
    .bind(rarity)
    .fetch_optional(db)
    .await
    .ok()
    .flatten();

    result.map(|(id,)| id.to_string())
}
