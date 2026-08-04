//! Per-player weekly TALLY ceiling.
//!
//! WHY THIS EXISTS. Endless waves repeat for ever, which is the only unbounded way
//! to earn in the game — operation bounties pay once per operation on first clear,
//! and rank bonuses pay once per rank. So one player with time can mint an
//! arbitrary share of a fixed 1,000,000,000 TALLY supply.
//!
//! WHAT THIS IS NOT. It is not a solvency tool, because there is nothing to make
//! insolvent: StillHunt has no reward pool. Play accrues a balance in the database
//! and that balance mints on claim, so a payout can never fail halfway through a
//! session for want of funds. This cap exists purely to pace inflation against the
//! supply ceiling.
//!
//! NOT A HARD WALL. Past the cap, earnings continue at a reduced rate rather than
//! stopping. A hard stop means a player who caps on Tuesday has no reason to open
//! the app until Monday, which costs exactly the daily-active number the cap is
//! meant to protect the economy for. At 25%, earning another 25,000 past the cap
//! takes 100,000 of raw rewards — a real brake without a dead end.

use chrono::{DateTime, TimeZone, Utc, Weekday};
use sqlx::PgPool;

/// EARNING PAUSE — the switch, currently OFF.
///
/// While ON, the two GRINDABLE surfaces accrue nothing: operation clears and
/// Endless waves. Rank bonuses and referrals are never covered by it, so
/// progression and recruiting keep paying either way. Play itself is untouched in
/// both states — XP, ranks, unlocks, leaderboards and scores all continue; only
/// the TALLY stops.
///
/// The default must match the INTENDED state rather than failing in one fixed
/// direction: an unset var silently resuming payouts costs supply, but an unset
/// var silently stopping everyone earning is just as wrong. Earning is meant to be
/// on, so the default is not paused.
///
/// To pause: set `EARNING_PAUSED=true` on the host — no deploy needed.
pub fn earning_paused() -> bool {
    paused_from(std::env::var("EARNING_PAUSED").ok().as_deref())
}

/// The pause decision as a pure function of the env value, so it is testable
/// without mutating process env — which is `unsafe` on this edition and races
/// other tests.
fn paused_from(value: Option<&str>) -> bool {
    match value {
        Some(v) => !matches!(v.trim().to_ascii_lowercase().as_str(), "false" | "0" | "no" | "off"),
        None => false, // unset means EARNING IS ON — see the note above
    }
}

/// Per-player TALLY ceiling for one week. `WEEKLY_EARN_CAP=0` disables capping.
pub fn weekly_cap() -> u64 {
    std::env::var("WEEKLY_EARN_CAP").ok().and_then(|v| v.parse().ok()).unwrap_or(50_000)
}

/// Share of a reward still accrued once the cap is reached. 0.0 = hard stop.
pub fn over_cap_rate() -> f64 {
    std::env::var("WEEKLY_EARN_OVER_CAP_RATE").ok().and_then(|v| v.parse().ok()).unwrap_or(0.25)
}

/// Monday 00:00 UTC of the current ISO week — the boundary the weekly total is
/// summed on.
pub fn week_start() -> DateTime<Utc> {
    let today = Utc::now().date_naive();
    let monday = today.week(Weekday::Mon).first_day();
    Utc.from_utc_datetime(&monday.and_hms_opt(0, 0, 0).expect("midnight is a valid time"))
}

/// Trim `proposed` to what a player who has already earned `earned` this week may
/// still receive. Pure, so the policy is testable without a database.
///
/// Below the cap the reward is paid in full; the portion that would cross the cap
/// is paid at `rate`. A reward straddling the boundary is SPLIT, so the size of an
/// individual payout never changes the total a player can reach — otherwise
/// chopping one big reward into ten small ones would beat taking it whole.
pub fn apply_cap(earned: u64, proposed: u64, cap: u64, rate: f64) -> u64 {
    if cap == 0 { return proposed; } // capping disabled
    let rate = rate.clamp(0.0, 1.0);
    let headroom = cap.saturating_sub(earned);
    if proposed <= headroom { return proposed; }
    let over = proposed - headroom;
    headroom + (over as f64 * rate).floor() as u64
}

/// TALLY this wallet has accrued from grindable sources this week.
///
/// Reads the accrual ledger rather than settled claims: an accrual row is written
/// the moment a wave is cleared, while a claim settles only when the player asks
/// for it. Summing claims would let a burst of fast waves all read a stale total
/// and every one of them clear the cap.
pub async fn earned_this_week(db: &PgPool, wallet: &str) -> u64 {
    let since = week_start();
    // No status filter: `earnings` has no such column, and an invalid query here
    // fails silently through the `.ok()` below — which is exactly how this cap
    // came to be measuring zero for everyone while looking configured. Every row
    // in the window counts, because the cap measures what was EARNED; spending it
    // afterwards does not restore headroom.
    let total: Option<i64> = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount), 0)::bigint FROM earnings
          WHERE wallet_address = $1 AND created_at >= $2",
    )
    .bind(wallet)
    .bind(since)
    .fetch_optional(db)
    .await
    .ok()
    .flatten();
    total.unwrap_or(0).max(0) as u64
}

/// Cap `proposed` against this wallet's weekly allowance and return what may
/// actually be accrued.
pub async fn cap_reward(state: &crate::AppState, wallet: &str, proposed: u64) -> u64 {
    if proposed == 0 { return 0; }

    let cap = weekly_cap();
    if cap == 0 { return proposed; }

    let earned = earned_this_week(&state.db, wallet).await;
    let allowed = apply_cap(earned, proposed, cap, over_cap_rate());
    if allowed < proposed {
        tracing::info!(
            "weekly cap: {} earned {} of {} this week — reward trimmed {} -> {}",
            wallet, earned, cap, proposed, allowed,
        );
    }
    allowed
}

/// What the player is shown: how much of this week's allowance is spent, and what
/// happens next. Diminishing returns a player cannot see read as a payout bug, so
/// this exists specifically to be rendered, not just to be queryable.
pub async fn status_for(db: &PgPool, wallet: &str) -> serde_json::Value {
    let cap = weekly_cap();
    let earned = earned_this_week(db, wallet).await;
    let resets = week_start() + chrono::Duration::days(7);
    serde_json::json!({
        "earned_this_week": earned,
        "cap": cap,
        "remaining": cap.saturating_sub(earned),
        "over_cap": cap > 0 && earned >= cap,
        "over_cap_rate": over_cap_rate(),
        "resets_at": resets.to_rfc3339(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Datelike, Timelike};

    const CAP: u64 = 50_000;
    const RATE: f64 = 0.25;

    #[test]
    fn under_the_cap_pays_in_full() {
        assert_eq!(apply_cap(0, 1_000, CAP, RATE), 1_000);
        assert_eq!(apply_cap(40_000, 5_000, CAP, RATE), 5_000);
    }

    #[test]
    fn exactly_reaching_the_cap_still_pays_in_full() {
        assert_eq!(apply_cap(45_000, 5_000, CAP, RATE), 5_000);
    }

    #[test]
    fn a_reward_straddling_the_cap_is_split() {
        // 2,000 of headroom left, then 8,000 over at 25% = 2,000.
        assert_eq!(apply_cap(48_000, 10_000, CAP, RATE), 4_000);
    }

    #[test]
    fn past_the_cap_pays_the_reduced_rate() {
        assert_eq!(apply_cap(50_000, 10_000, CAP, RATE), 2_500);
        assert_eq!(apply_cap(90_000, 4_000, CAP, RATE), 1_000);
    }

    #[test]
    fn splitting_a_reward_cannot_beat_taking_it_whole() {
        // The straddle rule exists so payout SIZE is not a lever. Ten 1,000s must
        // reach the same total as one 10,000 from the same starting point.
        let whole = apply_cap(48_000, 10_000, CAP, RATE);
        let mut earned = 48_000;
        let mut got = 0;
        for _ in 0..10 {
            got += apply_cap(earned, 1_000, CAP, RATE);
            earned += 1_000; // the accrual is recorded at full value
        }
        assert_eq!(whole, got);
    }

    #[test]
    fn zero_rate_is_a_hard_stop() {
        assert_eq!(apply_cap(50_000, 10_000, CAP, 0.0), 0);
        assert_eq!(apply_cap(48_000, 10_000, CAP, 0.0), 2_000);
    }

    #[test]
    fn zero_cap_disables_capping() {
        assert_eq!(apply_cap(999_999, 10_000, 0, RATE), 10_000);
    }

    #[test]
    fn a_rate_above_one_cannot_mint_extra() {
        assert_eq!(apply_cap(50_000, 10_000, CAP, 5.0), 10_000);
    }

    #[test]
    fn week_starts_on_a_monday_midnight() {
        let w = week_start();
        assert_eq!(w.weekday(), Weekday::Mon);
        assert_eq!((w.hour(), w.minute(), w.second()), (0, 0, 0));
        assert!(w <= Utc::now());
    }

    #[test]
    fn an_unset_pause_var_means_earning_is_on() {
        assert!(!paused_from(None));
    }

    #[test]
    fn only_an_explicit_no_resumes_earning() {
        for off in ["false", "FALSE", " false ", "0", "no", "off"] {
            assert!(!paused_from(Some(off)), "{off:?} should resume earning");
        }
        for on in ["true", "1", "yes", "", "paused", "banana"] {
            assert!(paused_from(Some(on)), "{on:?} should stay paused");
        }
    }
}
