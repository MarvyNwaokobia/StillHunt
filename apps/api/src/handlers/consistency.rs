//! Self-audit: does the database still agree with itself?
//!
//! Every reward bug this codebase has shipped shared one property: it was INVISIBLE.
//! A stale `xp <= 999` CHECK constraint aborted the one write that persists rank
//! progress while every sibling write in the same request succeeded, so battles kept
//! recording, bounties kept paying and the campaign kept unlocking while one player's
//! rank sat frozen for 18 hours. Nobody found out until a human played and noticed.
//!
//! This endpoint runs the queries that WOULD have caught it, in seconds, and reports
//! anything that disagrees. The cron calls it on a schedule and fails its job when the
//! report is non-empty, which is what turns "a player eventually complains" into "an
//! email arrives". It only ever READS; it never repairs. Repair is a decision, and a
//! silent auto-repair would just be a new way to hide the same class of bug.

use actix_web::{web, HttpRequest, HttpResponse};
use serde::Serialize;
use serde_json::json;

use crate::AppState;

#[derive(Serialize, sqlx::FromRow)]
struct FrozenPlayer {
    wallet_address: String,
    rank: String,
    xp: i32,
    wins: i32,
    /// Wins we can prove from the battle ledger. Divergence from `wins` means the
    /// player row stopped being written while fights kept landing.
    ledger_wins: i64,
    minutes_behind: f64,
}

#[derive(Serialize, sqlx::FromRow)]
struct StuckPayout {
    kind: String,
    wallet_address: String,
    reference: String,
    amount: i64,
    status: String,
    minutes_old: f64,
}

/// How long a payout may sit unsettled before it counts as stuck. The reconcile sweep
/// is the only thing that retries these, and GitHub's scheduler drifts, so this is set
/// well past the nominal 15-minute cadence to report real neglect rather than normal lag.
const STUCK_PAYOUT_MINUTES: f64 = 90.0;

/// `POST /health/consistency` — read-only self-audit. Shares the decay cron's secret.
pub async fn run_consistency_check(state: web::Data<AppState>, req: HttpRequest) -> HttpResponse {
    let expected = std::env::var("DECAY_CRON_SECRET").unwrap_or_default();
    let provided = req
        .headers()
        .get("x-cron-secret")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if expected.is_empty() || provided != expected {
        return HttpResponse::Unauthorized().finish();
    }

    // 1. FROZEN PLAYER ROWS. Battles are recorded by a different statement than the one
    //    that persists xp/wins/rank, so when that save fails the two drift apart. Both
    //    sides of every battle are counted, since PvP awards the opponent too.
    //
    //    The win comparison only considers rows that were MEANT to count. Not every
    //    battle row is a W/L result: Endless persists a row per wave and per death
    //    through the same helper, with count_result = false, because waves award XP
    //    and rank but must not each land on the profile as a win. Comparing raw row
    //    counts therefore reported the only two Endless players in the game as
    //    corrupt, on every 15-minute tick, forever — their tallies were right and the
    //    check was wrong. `counts_result` (see add_battle_mode.sql) records that
    //    intent per row.
    //
    //    Rows predating that column are NULL and genuinely ambiguous — an Endless
    //    wave and a Campaign op are otherwise identical — so a player holding any
    //    such row is excluded from the comparison rather than judged on a guess.
    //    Those players are still covered by the staleness clause, which is the
    //    signal that actually catches a frozen row: battles landing while the
    //    player's own record stops being written.
    let frozen = sqlx::query_as::<_, FrozenPlayer>(
        "WITH per_player AS (
             SELECT challenger_wallet AS w, created_at,
                    (winner_wallet = challenger_wallet) AS won, counts_result
             FROM battles
             UNION ALL
             SELECT opponent_wallet, created_at, (winner_wallet = opponent_wallet), counts_result
             FROM battles WHERE opponent_wallet <> 'bot'
         ), agg AS (
             SELECT w, max(created_at) AS last_battle,
                    count(*) FILTER (WHERE won AND counts_result) AS ledger_wins,
                    bool_or(counts_result IS NULL) AS has_unlabelled
             FROM per_player GROUP BY w
         )
         SELECT p.wallet_address, p.rank, p.xp, p.wins,
                a.ledger_wins,
                (EXTRACT(EPOCH FROM (a.last_battle - p.last_active)) / 60)::float8 AS minutes_behind
         FROM players p
         JOIN agg a ON a.w = p.wallet_address
         WHERE a.last_battle > p.last_active + interval '2 minutes'
            OR (NOT a.has_unlabelled AND p.wins <> a.ledger_wins)
         ORDER BY a.last_battle DESC
         LIMIT 50",
    )
    .fetch_all(&state.db)
    .await;

    // 2. MONEY OWED BUT NOT SETTLED. A payout row is written before its on-chain
    //    transfer confirms; the reconcile sweep is the only retry. Anything still
    //    unsettled well past that cadence means the retry is not running.
    //
    //    'voided' counts as SETTLED, not owed. It is a terminal state applied by
    //    hand in SQL to cancel a payout (no code path writes it), so a voided row
    //    never becomes 'paid' and a `status <> 'paid'` filter matches it forever.
    //    That is not a hypothetical: 23 voided op_play rows kept this check red on
    //    every 15-minute tick indefinitely, which is exactly how an alarm that
    //    cries wolf gets ignored — and this one is the only thing watching real
    //    money. Terminal states belong on this list; retryable ones ('pending',
    //    'failed') must not be, or genuine neglect goes unreported.
    let stuck = sqlx::query_as::<_, StuckPayout>(
        "SELECT 'first_clear' AS kind, wallet_address, level::text AS reference,
                amount, status,
                (EXTRACT(EPOCH FROM (now() - created_at)) / 60)::float8 AS minutes_old
         FROM first_clear_bounties
         WHERE status NOT IN ('paid', 'voided') AND created_at < now() - ($1 || ' minutes')::interval
         UNION ALL
         SELECT 'rank_up', wallet_address, rank, amount, status,
                (EXTRACT(EPOCH FROM (now() - created_at)) / 60)::float8
         FROM rank_up_rewards
         WHERE status NOT IN ('paid', 'voided') AND created_at < now() - ($1 || ' minutes')::interval
         UNION ALL
         SELECT 'op_play', wallet_address, level::text, amount, status,
                (EXTRACT(EPOCH FROM (now() - created_at)) / 60)::float8
         FROM op_play_bounties
         WHERE status NOT IN ('paid', 'voided') AND created_at < now() - ($1 || ' minutes')::interval
         ORDER BY minutes_old DESC
         LIMIT 50",
    )
    .bind(STUCK_PAYOUT_MINUTES.to_string())
    .fetch_all(&state.db)
    .await;

    // A query that itself errors is a finding, not a reason to report all-clear.
    let (frozen, frozen_err) = match frozen {
        Ok(rows) => (rows, None),
        Err(e) => (vec![], Some(e.to_string())),
    };
    let (stuck, stuck_err) = match stuck {
        Ok(rows) => (rows, None),
        Err(e) => (vec![], Some(e.to_string())),
    };

    // 3. CAN THE RELAY STILL PAY GAS?
    //
    // A funded G$ pool proves nothing: G$ cannot pay Celo gas, so the relay needs
    // its own CELO. When it runs dry EVERY on-chain action fails at once — payouts,
    // purchases, transfers, referrals — and each one fails with its own unrelated-
    // looking error, which is exactly how an empty tank cost us a day of chasing
    // signature bugs. At ~345k gas a transaction and Celo's current base fee, a
    // few hours of ordinary play drains it, so this is a routine condition and
    // belongs in the health check rather than in someone's memory.
    let (relay_gas_celo, relay_can_pay) = match state.chain.as_ref() {
        Some(chain) => {
            let bal = chain.relay_gas_balance().await;
            let celo = bal.map(|b| b.as_u128() as f64 / 1e18);
            (celo, chain.relay_can_pay().await)
        }
        None => (None, true), // no chain configured — nothing to be out of gas for
    };

    let healthy = frozen.is_empty()
        && stuck.is_empty()
        && frozen_err.is_none()
        && stuck_err.is_none()
        && relay_can_pay;

    if !healthy {
        tracing::error!(
            "CONSISTENCY CHECK FAILED: {} frozen player row(s), {} stuck payout(s){}{}{}",
            frozen.len(),
            stuck.len(),
            frozen_err.as_ref().map(|e| format!(" | frozen query error: {}", e)).unwrap_or_default(),
            stuck_err.as_ref().map(|e| format!(" | payout query error: {}", e)).unwrap_or_default(),
            if relay_can_pay { String::new() } else {
                format!(" | RELAY OUT OF GAS: {:.4} CELO — every on-chain action is failing",
                        relay_gas_celo.unwrap_or(0.0))
            },
        );
    }

    HttpResponse::Ok().json(json!({
        "healthy": healthy,
        "checked_at": chrono::Utc::now(),
        "frozen_players": frozen,
        "frozen_query_error": frozen_err,
        "stuck_payouts": stuck,
        "stuck_payout_query_error": stuck_err,
        "stuck_after_minutes": STUCK_PAYOUT_MINUTES,
        "relay_gas_celo": relay_gas_celo,
        "relay_can_pay": relay_can_pay,
    }))
}
