use actix_web::{web, HttpRequest, HttpResponse};
use chrono::{DateTime, Datelike, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::FromRow;
use uuid::Uuid;

use crate::AppState;
use crate::utils::{is_valid_wallet, normalize_wallet};

// The Gauntlet unlocks once the campaign is complete (cleared op 15 → pve_level 15).
const GAUNTLET_UNLOCK_LEVEL: i32 = 15;
// Anti-cheat "level 2" bounds. The core check is time: each fully-survived wave
// takes real seconds to fight through, so the server rejects a wave count that the
// elapsed run time (measured server-side from the issued token) can't support.
const MIN_WAVE_SECS: f64 = 4.0;
const MAX_WAVES: i32 = 300;
const MAX_KILLS_PER_WAVE: i32 = 20;
const MAX_RUN_SECS: f64 = 6.0 * 3600.0;

/// Current ISO year-week, e.g. "2026-W28" — the seasonal partition key (matches endless).
fn current_week_key() -> String {
    let iso = Utc::now().iso_week();
    format!("{}-W{:02}", iso.year(), iso.week())
}

/// Pure validation of a submitted run against its server-measured elapsed time.
/// Extracted so the anti-cheat rules are unit-testable in isolation.
fn validate_run(waves: i32, kills: i32, elapsed_secs: f64) -> Result<(), &'static str> {
    if waves < 0 || waves > MAX_WAVES {
        return Err("wave count out of range");
    }
    // A partial (the wave you died on) may add kills beyond the cleared waves, so
    // allow (waves + 1) worth of kills.
    if kills < 0 || kills > waves.saturating_add(1).saturating_mul(MAX_KILLS_PER_WAVE) {
        return Err("kill count implausible");
    }
    if elapsed_secs > MAX_RUN_SECS {
        return Err("run too long — token stale");
    }
    // The anti-cheat anchor: you cannot have cleared N waves faster than N waves
    // physically take. (+1s slack for rounding / a fast final frame.)
    if elapsed_secs + 1.0 < f64::from(waves) * MIN_WAVE_SECS {
        return Err("run too fast for wave count");
    }
    Ok(())
}

// ── POST /gauntlet/start ───────────────────────────────────────────────────────
// Issues a single-use run token and records the real start time. Gated on campaign
// completion. The client must hand this token back on submit.
#[derive(Deserialize)]
pub struct StartRequest {
    pub wallet: String,
    /// A SEASONAL CAMPAIGN run rather than a practice Gauntlet run. Seasonal is open
    /// to every player (no campaign gate — new players are exactly who a season is
    /// meant to pull in), but it requires a season to actually be live right now.
    #[serde(default)]
    pub seasonal: bool,
}

pub async fn start_run(state: web::Data<AppState>, req: HttpRequest, body: web::Json<StartRequest>) -> HttpResponse {
    let ip = req.connection_info().realip_remote_addr().unwrap_or("unknown").to_string();
    if !state.battle_limiter.check(&ip) {
        return HttpResponse::TooManyRequests().json(json!({"error": "Too many runs. Slow down."}));
    }
    if !is_valid_wallet(&body.wallet) {
        return HttpResponse::BadRequest().json(json!({"error": "Invalid wallet address"}));
    }
    let wallet = normalize_wallet(&body.wallet);

    // Seasonal is open to everyone, so it skips the campaign gate — but it only runs
    // while a season is actually live, and the run is stamped with that season's id so
    // it can never drift onto another season's board.
    let mut season_id: Option<Uuid> = None;
    let mut season_seed: Option<i64> = None;
    if body.seasonal {
        let live: Option<(Uuid, i64)> = sqlx::query_as(
            "SELECT id, seed FROM seasons
             WHERE starts_at <= now() AND (ends_at IS NULL OR ends_at >= now())
             ORDER BY starts_at DESC LIMIT 1",
        )
        .fetch_optional(&state.db).await.ok().flatten();
        let Some((id, seed)) = live else {
            return HttpResponse::Forbidden().json(json!({
                "error": "No season is running right now",
                "locked": true, "reason": "no_active_season",
            }));
        };
        season_id = Some(id);
        season_seed = Some(seed);
    } else {
        // Unlock gate — the Gauntlet is a prestige mode earned by finishing the campaign.
        let pve_level: Option<i32> = sqlx::query_scalar("SELECT pve_level FROM players WHERE wallet_address = $1")
            .bind(&wallet)
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten();
        let Some(level) = pve_level else {
            return HttpResponse::NotFound().json(json!({"error": "Player not found"}));
        };
        if level < GAUNTLET_UNLOCK_LEVEL {
            return HttpResponse::Forbidden().json(json!({
                "error": "Finish the campaign to unlock the Gauntlet",
                "locked": true, "need_level": GAUNTLET_UNLOCK_LEVEL, "have_level": level,
            }));
        }
    }

    let token = Uuid::new_v4().to_string();
    let now = Utc::now();
    let res = sqlx::query(
        "INSERT INTO survival_runs (wallet_address, run_token, started_at, status, season_id)
         VALUES ($1, $2, $3, 'open', $4)",
    )
    .bind(&wallet).bind(&token).bind(now).bind(season_id)
    .execute(&state.db).await;

    match res {
        Ok(_) => HttpResponse::Ok().json(json!({
            "run_token": token,
            "started_at": now.to_rfc3339(),
            // The shared layout seed: everyone in a season walks the same compound.
            "seed": season_seed,
            "season_id": season_id,
        })),
        Err(e) => {
            tracing::error!("gauntlet start insert failed for {}: {}", wallet, e);
            HttpResponse::InternalServerError().json(json!({"error": "Could not start run"}))
        }
    }
}

// ── POST /gauntlet/submit ──────────────────────────────────────────────────────
// Closes a run token with the reported waves/kills. The server measures elapsed time
// from its own recorded start and validates it against the claim before recording.
#[derive(Deserialize)]
pub struct SubmitRequest {
    pub wallet:    String,
    pub run_token: String,
    #[serde(default)]
    pub waves:     i32,
    #[serde(default)]
    pub kills:     i32,
}

pub async fn submit_run(state: web::Data<AppState>, req: HttpRequest, body: web::Json<SubmitRequest>) -> HttpResponse {
    let ip = req.connection_info().realip_remote_addr().unwrap_or("unknown").to_string();
    if !state.battle_limiter.check(&ip) {
        return HttpResponse::TooManyRequests().json(json!({"error": "Too many submissions. Slow down."}));
    }
    if !is_valid_wallet(&body.wallet) {
        return HttpResponse::BadRequest().json(json!({"error": "Invalid wallet address"}));
    }
    let wallet = normalize_wallet(&body.wallet);

    // Find the OPEN run for this (wallet, token). A missing/closed token → nothing to do.
    let started_at: Option<DateTime<Utc>> = sqlx::query_scalar(
        "SELECT started_at FROM survival_runs WHERE wallet_address = $1 AND run_token = $2 AND status = 'open'",
    )
    .bind(&wallet).bind(&body.run_token)
    .fetch_optional(&state.db).await.ok().flatten();

    let Some(started_at) = started_at else {
        return HttpResponse::Conflict().json(json!({"error": "No open run for this token"}));
    };

    let elapsed = (Utc::now() - started_at).num_milliseconds() as f64 / 1000.0;

    if let Err(reason) = validate_run(body.waves, body.kills, elapsed) {
        // Void the token so it can't be retried into a valid window.
        let _ = sqlx::query("UPDATE survival_runs SET status = 'void', duration_secs = $1 WHERE wallet_address = $2 AND run_token = $3 AND status = 'open'")
            .bind(elapsed as i32).bind(&wallet).bind(&body.run_token).execute(&state.db).await;
        tracing::warn!("gauntlet run rejected for {} ({}w {}k {:.0}s): {}", wallet, body.waves, body.kills, elapsed, reason);
        return HttpResponse::BadRequest().json(json!({"error": format!("Run rejected: {}", reason), "rejected": true}));
    }

    let week = current_week_key();
    // Guard the transition on status='open' so a double-submit can't record twice.
    let updated = sqlx::query(
        "UPDATE survival_runs
         SET waves = $1, kills = $2, duration_secs = $3, status = 'submitted', week_key = $4, submitted_at = now()
         WHERE wallet_address = $5 AND run_token = $6 AND status = 'open'",
    )
    .bind(body.waves).bind(body.kills).bind(elapsed as i32).bind(&week).bind(&wallet).bind(&body.run_token)
    .execute(&state.db).await
    .map(|r| r.rows_affected() == 1)
    .unwrap_or(false);

    if !updated {
        return HttpResponse::Conflict().json(json!({"error": "Run already submitted"}));
    }

    // Their best this season, for the result screen.
    let best: i32 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(waves), 0) FROM survival_runs WHERE wallet_address = $1 AND status = 'submitted' AND week_key = $2",
    )
    .bind(&wallet).bind(&week)
    .fetch_one(&state.db).await.unwrap_or(0);

    tracing::info!("gauntlet run: {} {}w {}k {:.0}s (season best {})", wallet, body.waves, body.kills, elapsed, best);
    HttpResponse::Ok().json(json!({ "ok": true, "waves": body.waves, "season_best": best, "week": week }))
}

// ── GET /gauntlet/leaderboard ──────────────────────────────────────────────────
#[derive(Serialize, FromRow)]
pub struct GauntletRow {
    pub wallet_address: String,
    pub username: Option<String>,
    pub best: i32,
}

#[derive(Deserialize)]
pub struct BoardQuery {
    pub scope: Option<String>, // "weekly" → current season; else all-time
    pub limit: Option<i64>,
}

pub async fn leaderboard(state: web::Data<AppState>, query: web::Query<BoardQuery>) -> HttpResponse {
    let weekly = query.scope.as_deref() == Some("weekly");
    let limit = query.limit.unwrap_or(25).clamp(1, 100);

    let rows = if weekly {
        sqlx::query_as::<_, GauntletRow>(
            "SELECT r.wallet_address, p.username, COALESCE(MAX(r.waves), 0) AS best
             FROM survival_runs r LEFT JOIN players p ON p.wallet_address = r.wallet_address
             WHERE r.status = 'submitted' AND r.week_key = $1
             GROUP BY r.wallet_address, p.username
             ORDER BY best DESC LIMIT $2",
        )
        .bind(current_week_key()).bind(limit)
        .fetch_all(&state.db).await
    } else {
        sqlx::query_as::<_, GauntletRow>(
            "SELECT r.wallet_address, p.username, COALESCE(MAX(r.waves), 0) AS best
             FROM survival_runs r LEFT JOIN players p ON p.wallet_address = r.wallet_address
             WHERE r.status = 'submitted'
             GROUP BY r.wallet_address, p.username
             ORDER BY best DESC LIMIT $1",
        )
        .bind(limit)
        .fetch_all(&state.db).await
    };

    match rows {
        Ok(r) => HttpResponse::Ok().json(json!({ "scope": if weekly { "weekly" } else { "all" }, "week": current_week_key(), "entries": r })),
        Err(e) => {
            tracing::error!("gauntlet leaderboard query failed: {}", e);
            HttpResponse::InternalServerError().json(json!({"error": "Failed to load leaderboard"}))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_impossibly_fast_runs() {
        // 30 cleared waves need >= 120s; 10s can't support it.
        assert_eq!(validate_run(30, 60, 10.0), Err("run too fast for wave count"));
    }

    #[test]
    fn accepts_a_plausible_run() {
        // 30 waves in 200s (> 120s floor), sane kills.
        assert!(validate_run(30, 120, 200.0).is_ok());
    }

    #[test]
    fn a_quick_death_on_wave_one_is_valid() {
        // Held 0 full waves, killed a few, died in 8s — allowed (no time floor at 0).
        assert!(validate_run(0, 5, 8.0).is_ok());
    }

    #[test]
    fn rejects_out_of_range_and_implausible_kills() {
        assert_eq!(validate_run(-1, 0, 10.0), Err("wave count out of range"));
        assert_eq!(validate_run(MAX_WAVES + 1, 0, 999999.0), Err("wave count out of range"));
        // 5 waves → at most (5+1)*20 = 120 kills; 200 is implausible.
        assert_eq!(validate_run(5, 200, 100.0), Err("kill count implausible"));
    }

    #[test]
    fn rejects_a_stale_token() {
        assert_eq!(validate_run(10, 20, MAX_RUN_SECS + 1.0), Err("run too long — token stale"));
    }
}
