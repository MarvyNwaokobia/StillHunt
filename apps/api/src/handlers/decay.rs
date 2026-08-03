use actix_web::{web, HttpRequest, HttpResponse};
use chrono::Utc;
use serde_json::json;

use crate::handlers::battles::RANK_LADDER;
use crate::AppState;

/// Idle time before a player is warned.
const WARN_AFTER_HOURS: i64 = 48;
/// Idle time before the first rank is lost (the grace period).
const DECAY_AFTER_HOURS: i64 = 72;
/// A further rank is lost for every this many hours of CONTINUED absence. Rank is the
/// visible cost of walking away: keep going and you keep sliding, all the way to Iron.
const DECAY_STEP_HOURS: i64 = 72;

/// Build the ladder as a SQL array literal from the one Rust const that defines rank
/// order. Written out by hand, this list has now been wrong in three separate places
/// (the leaderboard sort, `next_rank`, and this sweep, which silently skipped Emerald
/// so the second-highest rank could never decay at all). Static strings only, so
/// nothing user-supplied reaches the query.
fn ladder_sql() -> String {
    let items = RANK_LADDER
        .iter()
        .map(|r| format!("'{}'", r))
        .collect::<Vec<_>>()
        .join(",");
    format!("ARRAY[{}]::text[]", items)
}

/// Cron-triggered decay sweep: warn the idle, and step the long-idle down the ladder.
///
/// Safe to run as often as you like. Every step is gated on `last_decay_at`, so a
/// duplicate or manual run cannot double-demote anyone.
pub async fn run_decay_sweep(state: web::Data<AppState>, req: HttpRequest) -> HttpResponse {
    // Require a shared secret so this endpoint can't be triggered by anyone
    let expected = std::env::var("DECAY_CRON_SECRET").unwrap_or_default();
    let provided = req
        .headers()
        .get("x-cron-secret")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    // Deny if secret is unset (empty) OR if header doesn't match
    if expected.is_empty() || provided != expected {
        return HttpResponse::Unauthorized().finish();
    }

    let now = Utc::now();
    let warn_threshold = now - chrono::Duration::hours(WARN_AFTER_HOURS);
    let decay_threshold = now - chrono::Duration::hours(DECAY_AFTER_HOURS);
    let step_threshold = now - chrono::Duration::hours(DECAY_STEP_HOURS);

    // Set warning status
    let warn_result = sqlx::query(
        "UPDATE players
         SET decay_status = 'warning'
         WHERE last_active < $1
           AND last_active >= $2
           AND (decay_frozen_until IS NULL OR decay_frozen_until < NOW())
           AND decay_status = 'none'",
    )
    .bind(warn_threshold)
    .bind(decay_threshold)
    .execute(&state.db)
    .await;

    // Step one rank down. Three things this fixes versus the old sweep:
    //
    //  • It REPEATS. The old WHERE said `decay_status != 'active'`, but the demotion
    //    itself set that status, so everyone dropped exactly one rank and was then
    //    immune forever. The gate is now `last_decay_at`, so absence keeps costing.
    //  • It walks the REAL ladder. The old hand-written CASE listed only the original
    //    five ranks, so Emerald (second-highest) and Bronze both fell through its ELSE
    //    and never decayed. array_position over RANK_LADDER cannot miss a tier.
    //  • It unwinds PRESTIGE first. Past Diamond the rank name stops changing, so a
    //    Diamond III would otherwise drop straight to Emerald and skip three levels of
    //    earned progress. Prestige is spent one level at a time before rank moves.
    //
    // XP resets on a demotion: you lost the tier, you refill its bar. Without this a
    // player carrying a nearly-full bar would bounce straight back on their first
    // fight, which would make the whole mechanic decorative.
    //
    // Every CASE below reads the row's OLD values, so `prestige_level > 0` consistently
    // means "had prestige before this step".
    let ladder = ladder_sql();
    let decay_sql = format!(
        "UPDATE players
         SET decay_status  = 'active',
             last_decay_at = $1,
             prestige_level = CASE WHEN prestige_level > 0 THEN prestige_level - 1
                                   ELSE 0 END,
             rank = CASE WHEN prestige_level > 0 THEN rank
                         ELSE COALESCE(
                                {ladder}[array_position({ladder}, rank) - 1],
                                rank)
                    END,
             xp = CASE WHEN prestige_level > 0 THEN xp ELSE 0 END
         WHERE last_active < $2
           AND (decay_frozen_until IS NULL OR decay_frozen_until < NOW())
           AND (last_decay_at IS NULL OR last_decay_at < $3)
           -- Nothing left to take: already at the floor with no prestige banked.
           AND NOT (rank = $4 AND prestige_level = 0)",
        ladder = ladder
    );
    let decay_result = sqlx::query(&decay_sql)
        .bind(now)
        .bind(decay_threshold)
        .bind(step_threshold)
        .bind(RANK_LADDER[0])
        .execute(&state.db)
        .await;

    let warned = warn_result.map(|r| r.rows_affected()).unwrap_or(0);
    let decayed = decay_result.as_ref().map(|r| r.rows_affected()).unwrap_or(0);
    if let Err(e) = &decay_result {
        tracing::error!("DECAY STEP FAILED: no ranks were adjusted this sweep: {}", e);
    }

    tracing::info!("Decay sweep: {} warned, {} rank-downgraded", warned, decayed);

    HttpResponse::Ok().json(json!({
        "warned": warned,
        "decayed": decayed,
        "ran_at": now.to_rfc3339(),
        "step_hours": DECAY_STEP_HOURS,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_decay_ladder_covers_every_rank() {
        let sql = ladder_sql();
        // Every tier must appear. The old hand-written CASE was missing Emerald, so the
        // second-highest rank could never decay, and missing Bronze, so Bronze never
        // reached Iron. Deriving from RANK_LADDER makes an omission impossible, and this
        // asserts that derivation actually happened.
        for rank in RANK_LADDER {
            assert!(sql.contains(&format!("'{}'", rank)), "{} missing from decay ladder", rank);
        }
        assert!(sql.starts_with("ARRAY[") && sql.ends_with("]::text[]"));
        // Ladder order is preserved, since array_position depends on it.
        let iron = sql.find("'Iron'").unwrap();
        let silver = sql.find("'Silver'").unwrap();
        let diamond = sql.find("'Diamond'").unwrap();
        assert!(iron < silver && silver < diamond);
    }

    #[test]
    fn the_floor_guard_matches_the_bottom_of_the_ladder() {
        // The sweep skips rows already at the floor by comparing against RANK_LADDER[0].
        // If the ladder ever gained a tier BELOW Iron, that guard has to follow it, and
        // it will, because it is the same array.
        assert_eq!(RANK_LADDER[0], "Iron");
    }

    #[test]
    fn decay_timings_are_ordered_and_repeating() {
        // Warn before taking anything, and never take a rank inside the grace period.
        assert!(WARN_AFTER_HOURS < DECAY_AFTER_HOURS);
        // A repeating step is the whole point: absence must keep costing rather than
        // charging once and then leaving a lapsed player parked at the top of the board.
        assert!(DECAY_STEP_HOURS > 0);
    }
}
