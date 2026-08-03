use actix_web::{web, HttpRequest, HttpResponse};
use chrono::{DateTime, Utc};
use ethers::types::{Address, Signature};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::utils::{is_valid_wallet, normalize_wallet};
use crate::AppState;

/// Admin session claims — deliberately a distinct JWT (separate secret,
/// `role: "admin"`) from the player Supabase-RLS tokens `auth.rs` issues, so
/// the two can never be confused for one another.
#[derive(Serialize, Deserialize)]
struct AdminClaims {
    sub: String,
    role: String,
    exp: u64,
    iat: u64,
}

fn admin_allowlist() -> Vec<String> {
    std::env::var("ADMIN_WALLETS")
        .unwrap_or_default()
        .split(',')
        .map(|s| normalize_wallet(s.trim()))
        .filter(|s| !s.is_empty())
        .collect()
}

pub(crate) fn verify_admin_token(req: &HttpRequest) -> Result<String, HttpResponse> {
    let jwt_secret = std::env::var("ADMIN_JWT_SECRET").map_err(|_| {
        HttpResponse::ServiceUnavailable().json(json!({"error": "Admin auth not configured"}))
    })?;

    let token = req
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or_else(|| HttpResponse::Unauthorized().json(json!({"error": "Missing or malformed Authorization header"})))?;

    let data = decode::<AdminClaims>(
        token,
        &DecodingKey::from_secret(jwt_secret.as_bytes()),
        &Validation::new(Algorithm::HS256),
    )
    .map_err(|_| HttpResponse::Unauthorized().json(json!({"error": "Invalid or expired admin session"})))?;

    if data.claims.role != "admin" {
        return Err(HttpResponse::Unauthorized().json(json!({"error": "Not an admin session"})));
    }
    Ok(data.claims.sub)
}

// ── POST /admin/login ──────────────────────────────────────────────────────────
// Verifies a wallet signature over a message embedding a fresh timestamp
// (prevents replaying an old signature), checks the wallet is in the
// ADMIN_WALLETS allowlist, and issues a short-lived admin JWT.
#[derive(Deserialize)]
pub struct AdminLoginRequest {
    pub wallet: String,
    pub message: String,
    pub signature: String,
}

pub async fn login(body: web::Json<AdminLoginRequest>) -> HttpResponse {
    let jwt_secret = match std::env::var("ADMIN_JWT_SECRET") {
        Ok(s) => s,
        Err(_) => {
            return HttpResponse::ServiceUnavailable()
                .json(json!({"error": "Admin auth not configured (ADMIN_JWT_SECRET missing)"}))
        }
    };

    if !is_valid_wallet(&body.wallet) {
        return HttpResponse::BadRequest().json(json!({"error": "Invalid wallet address"}));
    }
    let wallet_norm = normalize_wallet(&body.wallet);
    if !admin_allowlist().contains(&wallet_norm) {
        return HttpResponse::Unauthorized().json(json!({"error": "Not an admin wallet"}));
    }
    if body.signature.len() < 130 {
        return HttpResponse::BadRequest().json(json!({"error": "Invalid signature"}));
    }
    if body.message.len() > 256 {
        return HttpResponse::BadRequest().json(json!({"error": "Message too long"}));
    }

    let Some(ts) = body
        .message
        .lines()
        .find_map(|l| l.strip_prefix("timestamp:"))
        .and_then(|s| s.trim().parse::<i64>().ok())
    else {
        return HttpResponse::BadRequest().json(json!({"error": "Malformed login message"}));
    };
    if (Utc::now().timestamp() - ts).abs() > 300 {
        return HttpResponse::Unauthorized().json(json!({"error": "Login message expired — try again"}));
    }

    let wallet_addr: Address = match body.wallet.parse() {
        Ok(a) => a,
        Err(_) => return HttpResponse::BadRequest().json(json!({"error": "Invalid wallet address"})),
    };
    let sig: Signature = match body.signature.parse() {
        Ok(s) => s,
        Err(_) => return HttpResponse::BadRequest().json(json!({"error": "Malformed signature"})),
    };
    if sig.verify(body.message.as_bytes(), wallet_addr).is_err() {
        return HttpResponse::Unauthorized().json(json!({"error": "Signature does not match wallet"}));
    }

    let now = Utc::now().timestamp() as u64;
    let expires_in: u64 = 60 * 60; // 1 hour
    let claims = AdminClaims { sub: wallet_norm.clone(), role: "admin".into(), exp: now + expires_in, iat: now };

    let token = match encode(&Header::default(), &claims, &EncodingKey::from_secret(jwt_secret.as_bytes())) {
        Ok(t) => t,
        Err(e) => {
            tracing::error!("Admin JWT encode failed: {}", e);
            return HttpResponse::InternalServerError().json(json!({"error": "Failed to issue token"}));
        }
    };

    HttpResponse::Ok().json(json!({ "token": token, "wallet": wallet_norm, "expires_at": now + expires_in }))
}

// ── GET /admin/stats?season_id= ────────────────────────────────────────────────
#[derive(Deserialize)]
pub struct StatsQuery {
    pub season_id: Option<Uuid>,
}

#[derive(Serialize)]
pub struct AdminStats {
    pub season_name: Option<String>,
    pub starts_at: DateTime<Utc>,
    pub ends_at: Option<DateTime<Utc>>,
    pub new_players: i64,
    pub active_players: i64,
    pub total_battles: i64,
    #[serde(with = "rust_decimal::serde::float")]
    pub total_g_awarded: Decimal,
    #[serde(with = "rust_decimal::serde::float")]
    pub total_g_volume: Decimal,
    /// Total G$ players have withdrawn/transferred OUT to external wallets
    /// (g_ledger 'transfer_out' rows, stored positive) within the window.
    #[serde(with = "rust_decimal::serde::float")]
    pub total_g_transferred_out: Decimal,
}

pub async fn get_stats(
    req: HttpRequest,
    state: web::Data<AppState>,
    query: web::Query<StatsQuery>,
) -> HttpResponse {
    if let Err(resp) = verify_admin_token(&req) {
        return resp;
    }

    let (season_name, starts_at, ends_at): (Option<String>, DateTime<Utc>, Option<DateTime<Utc>>) =
        if let Some(id) = query.season_id {
            let row: Option<(String, DateTime<Utc>, Option<DateTime<Utc>>)> = sqlx::query_as(
                "SELECT name, starts_at, ends_at FROM seasons WHERE id = $1",
            )
            .bind(id)
            .fetch_optional(&state.db)
            .await
            .unwrap_or(None);

            match row {
                Some((name, s, e)) => (Some(name), s, e),
                None => return HttpResponse::NotFound().json(json!({"error": "Season not found"})),
            }
        } else {
            (None, DateTime::<Utc>::from_timestamp(0, 0).unwrap(), None)
        };

    let window_end = ends_at.unwrap_or_else(Utc::now);

    let new_players: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM players WHERE created_at >= $1 AND created_at < $2",
    )
    .bind(starts_at).bind(window_end)
    .fetch_one(&state.db).await.unwrap_or((0,));

    let active_players: (i64,) = sqlx::query_as(
        "SELECT COUNT(DISTINCT wallet) FROM (
            SELECT challenger_wallet AS wallet FROM battles WHERE created_at >= $1 AND created_at < $2
            UNION
            SELECT opponent_wallet AS wallet FROM battles WHERE created_at >= $1 AND created_at < $2
            UNION
            SELECT wallet_address AS wallet FROM g_ledger WHERE created_at >= $1 AND created_at < $2
        ) t",
    )
    .bind(starts_at).bind(window_end)
    .fetch_one(&state.db).await.unwrap_or((0,));

    let total_battles: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM battles WHERE created_at >= $1 AND created_at < $2",
    )
    .bind(starts_at).bind(window_end)
    .fetch_one(&state.db).await.unwrap_or((0,));

    // UBI is EXCLUDED. A UBI claim is GoodDollar's money passing through a
    // player's wallet — StillHunt neither funds it nor pays it, so counting it here
    // overstated what the game has actually awarded.
    let total_g_awarded: (Decimal,) = sqlx::query_as(
        "SELECT COALESCE(SUM(amount), 0) FROM g_ledger
         WHERE category = 'battle_reward' AND created_at >= $1 AND created_at < $2",
    )
    .bind(starts_at).bind(window_end)
    .fetch_one(&state.db).await.unwrap_or((Decimal::ZERO,));

    // Throughput: rewards paid + marketplace spend + withdrawals. UBI is excluded
    // for the same reason as above — it is not volume StillHunt moved. This now
    // matches the Dune "G$ Volume Moved" query leg for leg, so the admin page and
    // the public dashboard can be compared directly.
    let total_g_volume: (Decimal,) = sqlx::query_as(
        "SELECT COALESCE(SUM(amount), 0) FROM g_ledger
         WHERE category <> 'ubi_claim' AND created_at >= $1 AND created_at < $2",
    )
    .bind(starts_at).bind(window_end)
    .fetch_one(&state.db).await.unwrap_or((Decimal::ZERO,));

    let total_g_transferred_out: (Decimal,) = sqlx::query_as(
        "SELECT COALESCE(SUM(amount), 0) FROM g_ledger
         WHERE category = 'transfer_out' AND created_at >= $1 AND created_at < $2",
    )
    .bind(starts_at).bind(window_end)
    .fetch_one(&state.db).await.unwrap_or((Decimal::ZERO,));

    HttpResponse::Ok().json(AdminStats {
        season_name,
        starts_at,
        ends_at,
        new_players: new_players.0,
        active_players: active_players.0,
        total_battles: total_battles.0,
        total_g_awarded: total_g_awarded.0,
        total_g_volume: total_g_volume.0,
        total_g_transferred_out: total_g_transferred_out.0,
    })
}

// ── GET /admin/onchain — recent on-chain activity (Celoscan-linkable) ─────────
#[derive(Serialize, sqlx::FromRow)]
pub struct OnchainRow {
    pub kind: String,       // 'mission_record' | 'marketplace_purchase' | 'battle_reward' | 'transfer_out' | ...
    pub wallet: String,
    pub detail: Option<String>, // level for records, amount for ledger
    pub tx_hash: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Deserialize)]
pub struct OnchainQuery {
    /// Row cap. The UI list uses the default 100; the CSV export asks for the full
    /// history with a large limit. Clamped to [1, 10000] so a bad value can't run away.
    pub limit: Option<i64>,
}

/// Merges on-chain game records (battles.game_record_tx) with on-chain G$ moves
/// (g_ledger.tx_hash), newest first — only genuine 0x tx hashes. The admin UI
/// links each to Celoscan.
pub async fn list_onchain(
    req: HttpRequest,
    state: web::Data<AppState>,
    query: web::Query<OnchainQuery>,
) -> HttpResponse {
    if let Err(resp) = verify_admin_token(&req) {
        return resp;
    }
    let limit = query.limit.unwrap_or(100).clamp(1, 10_000);
    let rows = sqlx::query_as::<_, OnchainRow>(
        "SELECT 'mission_record' AS kind, winner_wallet AS wallet,
                (rounds_data->>'level') AS detail, game_record_tx AS tx_hash, created_at
           FROM battles
          WHERE game_record_tx LIKE '0x%'
        UNION ALL
         SELECT category AS kind, wallet_address AS wallet,
                amount::text AS detail, tx_hash, created_at
           FROM g_ledger
          WHERE tx_hash LIKE '0x%'
         ORDER BY created_at DESC
         LIMIT $1",
    )
    .bind(limit)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(r) => HttpResponse::Ok().json(r),
        Err(e) => {
            tracing::error!("Failed to fetch on-chain activity: {}", e);
            HttpResponse::InternalServerError().json(json!({"error": "Database error"}))
        }
    }
}

// ── Seasons: GET/POST /admin/seasons, POST /admin/seasons/:id/end ─────────────
#[derive(Serialize, sqlx::FromRow)]
pub struct SeasonRow {
    pub id: Uuid,
    pub name: String,
    pub starts_at: DateTime<Utc>,
    pub ends_at: Option<DateTime<Utc>>,
}

pub async fn list_seasons(req: HttpRequest, state: web::Data<AppState>) -> HttpResponse {
    if let Err(resp) = verify_admin_token(&req) {
        return resp;
    }
    let rows = sqlx::query_as::<_, SeasonRow>(
        "SELECT id, name, starts_at, ends_at FROM seasons ORDER BY starts_at DESC",
    )
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rows) => HttpResponse::Ok().json(rows),
        Err(e) => {
            tracing::error!("Failed to list seasons: {}", e);
            HttpResponse::InternalServerError().json(json!({"error": "Database error"}))
        }
    }
}

#[derive(Deserialize)]
pub struct CreateSeasonRequest {
    pub name: String,
    /// When the season OPENS. Omit to start immediately. A season can be scheduled
    /// ahead of time and stays locked until this moment, which is how Season 1 is
    /// announced before it is playable.
    #[serde(default)]
    pub starts_at: Option<DateTime<Utc>>,
    /// When it CLOSES. Omit for an open-ended season closed by hand later.
    #[serde(default)]
    pub ends_at: Option<DateTime<Utc>>,
    /// Shared layout seed. Omit and one is generated. Every player in the season
    /// walks the same generated compound, so the board compares like with like.
    #[serde(default)]
    pub seed: Option<i64>,
    /// The G$ prize pool. Can also be set later with /admin/seasons/:id/fund.
    #[serde(default)]
    pub prize_pool_g: Option<i64>,
}

pub async fn create_season(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<CreateSeasonRequest>,
) -> HttpResponse {
    if let Err(resp) = verify_admin_token(&req) {
        return resp;
    }
    if body.name.trim().is_empty() {
        return HttpResponse::BadRequest().json(json!({"error": "Season name required"}));
    }

    if let (Some(s), Some(e)) = (body.starts_at, body.ends_at) {
        if e <= s {
            return HttpResponse::BadRequest().json(json!({"error": "Season must end after it starts"}));
        }
    }

    // Only one season is ever open-ended at a time — close whatever's still running
    // without a scheduled end. A season that already carries an ends_at is a booked
    // window and is left alone, so scheduling next season never truncates this one.
    let _ = sqlx::query("UPDATE seasons SET ends_at = now() WHERE ends_at IS NULL")
        .execute(&state.db)
        .await;

    // A seed nobody can predict before the season opens, so no one can practise the
    // exact layout in advance.
    let seed = body.seed.unwrap_or_else(|| (Uuid::new_v4().as_u128() as i64).abs());

    let row = sqlx::query_as::<_, SeasonRow>(
        "INSERT INTO seasons (name, starts_at, ends_at, seed, prize_pool_g)
         VALUES ($1, COALESCE($2, now()), $3, $4, COALESCE($5, 0))
         RETURNING id, name, starts_at, ends_at",
    )
    .bind(body.name.trim())
    .bind(body.starts_at)
    .bind(body.ends_at)
    .bind(seed)
    .bind(body.prize_pool_g)
    .fetch_one(&state.db)
    .await;

    match row {
        Ok(season) => HttpResponse::Ok().json(season),
        Err(e) => {
            tracing::error!("Failed to create season: {}", e);
            HttpResponse::InternalServerError().json(json!({"error": "Database error"}))
        }
    }
}

pub async fn end_season(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> HttpResponse {
    if let Err(resp) = verify_admin_token(&req) {
        return resp;
    }
    let row = sqlx::query_as::<_, SeasonRow>(
        "UPDATE seasons SET ends_at = now() WHERE id = $1 AND ends_at IS NULL
         RETURNING id, name, starts_at, ends_at",
    )
    .bind(path.into_inner())
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some(season)) => HttpResponse::Ok().json(season),
        Ok(None) => HttpResponse::NotFound().json(json!({"error": "Season not found or already ended"})),
        Err(e) => {
            tracing::error!("Failed to end season: {}", e);
            HttpResponse::InternalServerError().json(json!({"error": "Database error"}))
        }
    }
}

// ── DELETE /admin/seasons/:id ─────────────────────────────────────────────────
// Removes a season outright. Guarded: a season that has already PAID anything can
// never be deleted, because the payout ledger is the record of real money leaving
// the pool and must stay auditable. Anything else (a duplicate created by mistake,
// a mis-scheduled window) is fair game, and its progress rows go with it.
pub async fn delete_season(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> HttpResponse {
    if let Err(resp) = verify_admin_token(&req) {
        return resp;
    }
    let id = path.into_inner();

    let paid: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM season_payouts WHERE season_id = $1 AND status = 'paid'",
    )
    .bind(id).fetch_one(&state.db).await.unwrap_or(0);
    if paid > 0 {
        return HttpResponse::Conflict().json(json!({
            "error": format!("This season has already paid {} winner(s) — it can't be deleted", paid),
        }));
    }

    // Clear what references it first: progress rows, any unpaid payout rows, and the
    // season stamp on survival runs (which is a real FK and would block the delete).
    let mut tx = match state.db.begin().await {
        Ok(t) => t,
        Err(e) => {
            tracing::error!("delete season: begin failed: {}", e);
            return HttpResponse::InternalServerError().json(json!({"error": "Database error"}));
        }
    };
    let _ = sqlx::query("DELETE FROM endless_progress WHERE season_id = $1").bind(id).execute(&mut *tx).await;
    let _ = sqlx::query("DELETE FROM season_payouts WHERE season_id = $1").bind(id).execute(&mut *tx).await;
    let _ = sqlx::query("UPDATE survival_runs SET season_id = NULL WHERE season_id = $1").bind(id).execute(&mut *tx).await;
    let deleted = sqlx::query("DELETE FROM seasons WHERE id = $1").bind(id).execute(&mut *tx).await;

    match deleted {
        Ok(r) if r.rows_affected() == 1 => {
            if let Err(e) = tx.commit().await {
                tracing::error!("delete season commit failed: {}", e);
                return HttpResponse::InternalServerError().json(json!({"error": "Database error"}));
            }
            tracing::info!("season {} deleted by admin", id);
            HttpResponse::Ok().json(json!({"ok": true}))
        }
        Ok(_) => HttpResponse::NotFound().json(json!({"error": "Season not found"})),
        Err(e) => {
            tracing::error!("delete season failed: {}", e);
            HttpResponse::InternalServerError().json(json!({"error": "Database error"}))
        }
    }
}

// ── PATCH /admin/seasons/:id ──────────────────────────────────────────────────
// Re-schedule a season's window. This is what lets a season be opened EARLY for a
// test run and then set back to its real start time.
#[derive(serde::Deserialize)]
pub struct UpdateSeasonRequest {
    #[serde(default)]
    pub starts_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub ends_at: Option<DateTime<Utc>>,
}

pub async fn update_season(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
    body: web::Json<UpdateSeasonRequest>,
) -> HttpResponse {
    if let Err(resp) = verify_admin_token(&req) {
        return resp;
    }
    if let (Some(s), Some(e)) = (body.starts_at, body.ends_at) {
        if e <= s {
            return HttpResponse::BadRequest().json(json!({"error": "A season must end after it starts"}));
        }
    }
    let row = sqlx::query_as::<_, SeasonRow>(
        "UPDATE seasons
            SET starts_at = COALESCE($2, starts_at),
                ends_at   = COALESCE($3, ends_at)
          WHERE id = $1
      RETURNING id, name, starts_at, ends_at",
    )
    .bind(path.into_inner()).bind(body.starts_at).bind(body.ends_at)
    .fetch_optional(&state.db).await;

    match row {
        Ok(Some(s)) => HttpResponse::Ok().json(s),
        Ok(None) => HttpResponse::NotFound().json(json!({"error": "Season not found"})),
        Err(e) => {
            tracing::error!("update season failed: {}", e);
            HttpResponse::InternalServerError().json(json!({"error": "Database error"}))
        }
    }
}

// ── POST /admin/seasons/:id/reset-progress ────────────────────────────────────
// Wipes every player's progress in a season, putting everyone back to wave 1.
//
// This is what makes testing a season BEFORE it opens safe. Progress persists, so a
// test run would otherwise leave the tester several waves up when the season goes
// live — a head start nobody else gets. Run this after testing and the field is level.
pub async fn reset_season_progress(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> HttpResponse {
    if let Err(resp) = verify_admin_token(&req) {
        return resp;
    }
    let id = path.into_inner();
    let paid: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM season_payouts WHERE season_id = $1 AND status = 'paid'",
    )
    .bind(id).fetch_one(&state.db).await.unwrap_or(0);
    if paid > 0 {
        return HttpResponse::Conflict().json(json!({
            "error": "This season has already paid out — resetting it now would rewrite settled results",
        }));
    }
    let res = sqlx::query("DELETE FROM endless_progress WHERE season_id = $1")
        .bind(id).execute(&state.db).await;
    match res {
        Ok(r) => {
            tracing::info!("season {} progress reset by admin ({} rows)", id, r.rows_affected());
            HttpResponse::Ok().json(json!({"ok": true, "cleared": r.rows_affected()}))
        }
        Err(e) => {
            tracing::error!("reset season progress failed: {}", e);
            HttpResponse::InternalServerError().json(json!({"error": "Database error"}))
        }
    }
}
