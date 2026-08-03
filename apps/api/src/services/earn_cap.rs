//! Per-player weekly G$ ceiling, shared by every grindable earn surface.
//!
//! WHY THIS EXISTS. Endless pays 100 × wave, repeatable for ever, which is the only
//! unbounded way to earn in the game — Campaign bounties pay once per level on first
//! clear, and rank-up bonuses pay once per rank. So one player with time can take an
//! arbitrary share of a finite pool. Observed: a median week is 750 G$ and the record
//! is 60,600.
//!
//! WHAT COUNTS. Only *grindable* earnings: Endless waves, Campaign first clears, and
//! rank-up bonuses. Season prizes and duel payouts are deliberately exempt — a prize
//! is budgeted, competitive and bounded by us already, and counting a 50,000 G$
//! season prize against the same allowance would consume a player's whole week for
//! winning something we chose to give them.
//!
//! NOT A HARD WALL. Past the cap, earnings continue at a reduced rate rather than
//! stopping. A hard stop means a player who caps on Tuesday has no reason to open the
//! app until Monday, which costs exactly the daily-active number the cap is meant to
//! protect the pool for. At 25%, earning another 25,000 past the cap takes 100,000 of
//! raw rewards — a real brake without a dead end.
//!
//! THE CAP IS NOT A SOLVENCY TOOL. It bounds one player, not the pool: at 50,000 a
//! handful of players can still empty a 200,000 G$ pool in a week. Keeping the pool
//! funded is a separate job (see `pool_warn_g` in the endless handler).

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use chrono::{DateTime, Datelike, TimeZone, Utc, Weekday};
use sqlx::PgPool;

/// GAMEPLAY EARNING PAUSE — the switch, currently OFF.
///
/// While ON, the two GRINDABLE surfaces pay nothing: Campaign op clears and
/// Endless waves. Rank-up bonuses and referrals are never covered by it, so
/// progression and recruiting keep paying either way. Play itself is untouched
/// in both states — XP, ranks, unlocks, leaderboards and scores all continue;
/// only the G$ stops.
///
/// Ran 2026-07-30 to 2026-07-31 and is now lifted, so the default is NOT paused.
///
/// The default was PAUSED while the pause was live, on the reasoning that an
/// unset var silently resuming payouts is the failure that costs real money.
/// That logic inverts once earning is meant to be on: an unset var must not
/// silently STOP everyone earning either. Whichever way it points, the default
/// has to match the intended state rather than fail in one fixed direction.
///
/// To pause again: set `EARNING_PAUSED=true` on the host — no deploy needed —
/// or flip this default back.
///
/// NOTE ON OPS CLEARED DURING THE PAUSE: an op bounty is once-per-(wallet, op)
/// and `first_clear` is `level > pve_level`, so an op cleared while paused
/// advanced the unlock and can never re-qualify. Those clears are forfeited, not
/// deferred. They stay reconstructible from the `battles` table if a goodwill
/// backpay is ever wanted — that is why each skip was logged with wallet and
/// level rather than passed over in silence.
pub fn earning_paused() -> bool {
    paused_from(std::env::var("EARNING_PAUSED").ok().as_deref())
}

/// The pause decision as a pure function of the env value, so it can be tested without
/// mutating process env — which is `unsafe` on this edition and races other tests.
fn paused_from(value: Option<&str>) -> bool {
    match value {
        Some(v) => !matches!(v.trim().to_ascii_lowercase().as_str(), "false" | "0" | "no" | "off"),
        None => false, // unset means EARNING IS ON — see the note above
    }
}

/// Per-player G$ ceiling for one week. `WEEKLY_EARN_CAP_G=0` disables capping.
pub fn weekly_cap_g() -> u64 {
    std::env::var("WEEKLY_EARN_CAP_G").ok().and_then(|v| v.parse().ok()).unwrap_or(50_000)
}

/// Share of a reward still paid once the cap is reached. 0.0 = hard stop.
pub fn over_cap_rate() -> f64 {
    std::env::var("WEEKLY_EARN_OVER_CAP_RATE").ok().and_then(|v| v.parse().ok()).unwrap_or(0.25)
}

/// Monday 00:00 UTC of the current ISO week — the same boundary `current_week_key()`
/// labels, expressed as an instant so the three reward tables can be summed on it.
pub fn week_start() -> DateTime<Utc> {
    let today = Utc::now().date_naive();
    let monday = today.week(Weekday::Mon).first_day();
    Utc.from_utc_datetime(&monday.and_hms_opt(0, 0, 0).expect("midnight is a valid time"))
}

/// Trim `proposed` to what a player who has already earned `earned` this week may
/// still receive. Pure, so the policy is testable without a database.
///
/// Below the cap the reward is paid in full; the portion that would cross the cap is
/// paid at `rate`. A reward straddling the boundary is split, so the exact size of an
/// individual payout never changes the total a player can reach.
pub fn apply_cap(earned: u64, proposed: u64, cap: u64, rate: f64) -> u64 {
    if cap == 0 { return proposed; } // capping disabled
    let rate = rate.clamp(0.0, 1.0);
    let headroom = cap.saturating_sub(earned);
    if proposed <= headroom { return proposed; }
    let over = proposed - headroom;
    headroom + (over as f64 * rate).floor() as u64
}

/// G$ this wallet has already been granted from grindable sources this week.
///
/// Reads the reward tables rather than `g_ledger` on purpose: these rows are written
/// synchronously when the reward is claimed, while the ledger entry lands only after
/// the on-chain transfer settles. Summing the ledger would let a burst of fast waves
/// all read a stale total and every one of them clear the cap.
///
/// `failed` rows are excluded (nothing was delivered), `voided` too. Anything still
/// `pending` counts: it is money we have committed to send.
pub async fn earned_this_week(db: &PgPool, wallet: &str) -> u64 {
    let since = week_start();
    let total: Option<i64> = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount), 0)::bigint FROM (
             SELECT amount FROM endless_rewards
              WHERE wallet_address = $1 AND created_at >= $2 AND status <> 'failed'
             UNION ALL
             SELECT amount FROM first_clear_bounties
              WHERE wallet_address = $1 AND created_at >= $2 AND status NOT IN ('failed', 'voided')
             UNION ALL
             SELECT amount FROM rank_up_rewards
              WHERE wallet_address = $1 AND created_at >= $2 AND status NOT IN ('failed', 'voided')
         ) t",
    )
    .bind(wallet)
    .bind(since)
    .fetch_optional(db)
    .await
    .ok()
    .flatten();
    total.unwrap_or(0).max(0) as u64
}

// ── Pool floor ────────────────────────────────────────────────────────────────
//
// The weekly cap bounds ONE player. It does not bound the pool: at 50,000 a
// handful of capped players still empty a 200,000 G$ balance inside a week, and
// the failure mode is ugly — transfers start reverting mid-session, so players
// see rewards that silently never arrive rather than a smaller reward.
//
// So below a floor, grindable payouts taper. Prizes and duel payouts are
// untouched, same as the cap: they are budgeted, and a season that cannot pay
// its winners is worse than a slow drip of bounties.

/// Reward-pool balance under which grindable payouts taper. 0 disables.
fn pool_floor_g() -> u64 {
    std::env::var("REWARD_POOL_FLOOR_G").ok().and_then(|v| v.parse().ok()).unwrap_or(50_000)
}

/// Share of a reward still paid while the pool is under the floor.
fn pool_floor_rate() -> f64 {
    std::env::var("REWARD_POOL_FLOOR_RATE").ok().and_then(|v| v.parse().ok()).unwrap_or(0.25)
}

/// How long a pool-balance reading is reused. An RPC round trip per reward would
/// put a network call in the path of every wave cleared; the balance only has to
/// be fresh enough to catch the floor within a minute of crossing it.
const POOL_BALANCE_TTL: Duration = Duration::from_secs(60);

/// Cached per POOL ADDRESS, not once globally.
///
/// StillHunt runs two reward pools — the main one (campaign first clears, rank-ups,
/// referrals) and a dedicated Endless one — and they hold very different amounts.
/// A single cache slot would serve whichever was read first to both.
static POOL_BALANCE: OnceLock<Mutex<HashMap<ethers::types::Address, (Instant, u64)>>> =
    OnceLock::new();

/// Which pool a reward will actually be paid out of.
///
/// This exists because the floor used to measure the MAIN pool for every reward,
/// whatever paid it. An empty main pool therefore throttled Endless to 25% while the
/// Endless pool sat on 73,209 G$ — a healthy surface punished for a different one's
/// balance. Observed live: Endless waves paying a quarter of their face value with the
/// pool behind them fully funded.
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum RewardSource {
    /// Campaign first clears, rank-up bonuses, referrals.
    Main,
    /// Endless / Seasonal waves.
    Endless,
}

/// Whole G$ in the pool that will pay this reward, cached. `None` when there is no
/// chain configured or the read failed — callers treat that as "do not taper", because
/// refusing to pay on a failed balance read would turn an RPC blip into a silent
/// pay cut.
async fn pool_balance_g(
    chain: &crate::services::chain::ChainWriter,
    source: RewardSource,
) -> Option<u64> {
    // Endless falls back to the main pool when no dedicated one is configured, which is
    // exactly what the payout path does, so the floor follows the money either way.
    let addr = match source {
        RewardSource::Main => chain.reward_pool_address()?,
        RewardSource::Endless => chain.endless_pool_address()?,
    };
    let cell = POOL_BALANCE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(guard) = cell.lock() {
        if let Some((at, bal)) = guard.get(&addr) {
            if at.elapsed() < POOL_BALANCE_TTL { return Some(*bal); }
        }
    }
    let raw = chain.g_balance(addr).await.ok()?;
    let whole = (raw / ethers::types::U256::exp10(18)).as_u64();
    if let Ok(mut guard) = cell.lock() {
        guard.insert(addr, (Instant::now(), whole));
    }
    Some(whole)
}

/// Cap `proposed` against this wallet's weekly allowance AND against the pool, and
/// return the amount actually payable.
///
/// THE TWO BRAKES DO NOT COMPOUND. Each is measured against the FULL proposed reward
/// and the harsher of the two wins; they are not applied one after the other.
///
/// Chaining them was the old behaviour and it multiplied: a player over their weekly
/// allowance while the pool sat under its floor was trimmed to 25%, then that 25% was
/// trimmed to 25% again, paying 6.25%. Observed live — a wave promising 1,100 G$ paid 68,
/// and one promising 1,400 paid 87. Two brakes each meant to soften a payout combined
/// into one that erases it, and at that size the CELO gas to deliver the reward costs
/// more than the reward.
///
/// Neither brake is supposed to mean "pay almost nothing": the weekly cap exists so a
/// grinder cannot take the whole pool, the floor so a draining pool degrades gently
/// instead of reverting mid-session. Taking the minimum honours both — whichever
/// condition is worse still bites in full — without inventing a third, harsher rate
/// that nobody chose.
pub async fn cap_reward(
    state: &crate::AppState,
    wallet: &str,
    proposed: u64,
    source: RewardSource,
) -> u64 {
    if proposed == 0 { return 0; }

    // Brake 0: does this player's EDITION pay real money at all?
    //
    // Ahead of both other brakes because it is not a taper, it is a hard no. A
    // MiniPay player earns an in-game balance and spends real stablecoins in the
    // shop; they never bank withdrawable G$, and they passed no GoodDollar identity
    // check on the way in because there was nothing to gate.
    //
    // Returning 0 rather than gating each call site keeps this on the same path the
    // earning pause already uses, and every caller already handles a 0 correctly:
    // each guards its INSERT with `amount > 0`, so no payout row is written and no
    // once-per-slot claim is burnt. Play is untouched — XP, ranks, unlocks and
    // leaderboards all continue.
    //
    // Referrals do not pass through here (they are exempt from the weekly cap by
    // design) and are gated separately in handlers::players::credit_referral.
    if !crate::services::edition::wallet_earns(&state.db, wallet).await {
        tracing::info!(
            "non-earning edition: {} G$ skipped for {} (progression unaffected)",
            proposed, wallet,
        );
        return 0;
    }

    // Brake 1: this wallet's weekly allowance. Not a flat rate — a reward straddling
    // the boundary is split, so this is computed rather than derived from a percentage.
    let mut weekly_allowed = proposed;
    let cap = weekly_cap_g();
    if cap > 0 {
        let earned = earned_this_week(&state.db, wallet).await;
        weekly_allowed = apply_cap(earned, proposed, cap, over_cap_rate());
        if weekly_allowed < proposed {
            tracing::info!(
                "weekly cap: {} earned {} of {} this week — reward trimmed {} -> {}",
                wallet, earned, cap, proposed, weekly_allowed,
            );
        }
    }

    // Brake 2: the floor of THE POOL THIS REWARD COMES FROM, measured against the same
    // full reward. Reading the main pool for an Endless wave is the bug this replaces.
    let mut pool_tapering = false;
    let floor = pool_floor_g();
    if floor > 0 {
        if let Some(chain) = state.chain.as_ref() {
            if let Some(balance) = pool_balance_g(chain, source).await {
                if balance < floor {
                    pool_tapering = true;
                    tracing::warn!(
                        "REWARD POOL LOW: the {:?} pool holds {} G$, under the {} G$ floor — \
                         payouts from it tapered for {}. Top that pool up.",
                        source, balance, floor, wallet,
                    );
                }
            }
        }
    }

    payable(proposed, weekly_allowed, pool_tapering, pool_floor_rate())
}

/// The final payable amount from both brakes. Pure, so the no-compounding rule is
/// testable without a database or a chain.
///
/// `weekly_allowed` is what the weekly cap alone would pay. The pool taper is applied to
/// the FULL `proposed`, not to `weekly_allowed`, and the stricter of the two wins.
pub fn payable(proposed: u64, weekly_allowed: u64, pool_tapering: bool, floor_rate: f64) -> u64 {
    let pool_allowed = if pool_tapering {
        (proposed as f64 * floor_rate.clamp(0.0, 1.0)).floor() as u64
    } else {
        proposed
    };
    weekly_allowed.min(pool_allowed)
}

/// What the player is shown: how much of this week's allowance is spent, and what
/// happens next. Diminishing returns the player cannot see read as a payout bug,
/// so this exists specifically to be rendered, not just to be queryable.
pub async fn status_for(db: &PgPool, wallet: &str) -> serde_json::Value {
    let cap = weekly_cap_g();
    let earned = earned_this_week(db, wallet).await;
    let resets = week_start() + chrono::Duration::days(7);
    serde_json::json!({
        "earned_this_week_g": earned,
        "cap_g": cap,
        "remaining_g": cap.saturating_sub(earned),
        "over_cap": cap > 0 && earned >= cap,
        // Percentage of full rate earned past the cap, for the explanatory line.
        "over_cap_rate": over_cap_rate(),
        "resets_at": resets.to_rfc3339(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Timelike;

    const CAP: u64 = 50_000;
    const RATE: f64 = 0.25;

    #[test]
    fn the_two_brakes_never_compound() {
        // A player over their weekly cap, with the pool under its floor. Each brake
        // alone pays 25%; chained they paid 6.25%, which is what produced a wave
        // promising 1,100 G$ paying 68 in production.
        let over_cap = apply_cap(50_000, 1_100, CAP, RATE); // 275 = 25%
        assert_eq!(over_cap, 275);
        assert_eq!(payable(1_100, over_cap, true, RATE), 275, "the harsher brake, applied once");
        assert_ne!(payable(1_100, over_cap, true, RATE), 68, "must not multiply to 6.25%");
    }

    #[test]
    fn each_brake_still_bites_on_its_own() {
        // Only the pool is low: full reward tapered to 25%.
        assert_eq!(payable(1_000, 1_000, true, RATE), 250);
        // Only the wallet is over its cap: the cap's figure stands.
        assert_eq!(payable(1_000, 250, false, RATE), 250);
        // Neither: paid in full.
        assert_eq!(payable(1_000, 1_000, false, RATE), 1_000);
    }

    #[test]
    fn a_straddling_reward_survives_a_low_pool_correctly() {
        // 2,000 of headroom then 8,000 over at 25% = 4,000 from the cap. The pool taper
        // on the FULL 10,000 is 2,500, which is stricter, so 2,500 is paid — not
        // 4,000 × 25% = 1,000.
        let straddled = apply_cap(48_000, 10_000, CAP, RATE);
        assert_eq!(straddled, 4_000);
        assert_eq!(payable(10_000, straddled, true, RATE), 2_500);
    }

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
            let paid = apply_cap(earned, 1_000, CAP, RATE);
            got += paid;
            earned += 1_000; // the grant is recorded at full value
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
        // The default tracks the INTENDED state, and the pause is lifted. While it was
        // running this asserted the opposite, for the symmetric reason: an unset var
        // must never silently flip the economy in either direction, so the assertion
        // moves with the decision rather than staying pinned one way.
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
