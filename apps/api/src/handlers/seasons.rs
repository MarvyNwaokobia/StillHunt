use actix_web::{web, HttpRequest, HttpResponse};
use chrono::{DateTime, Utc};
use ethers::types::Address;
use serde::Serialize;
use serde_json::json;
use sqlx::FromRow;
use uuid::Uuid;

use crate::AppState;
use crate::handlers::admin::verify_admin_token;

// Top-heavy long-tail prize split, in basis points of the pool, by 1-based rank.
// Sums to 10000 (100%) across the top 20. Winners past the table get nothing;
// unclaimed shares (fewer than 20 winners) simply stay in the pool for next season.
const PAYOUT_BPS: &[u64] = &[
    3000, 1800, 1200, 800, 600, // 1-5  → 74%
    300, 300, 300, 300, 300,    // 6-10 → 15%
    110, 110, 110, 110, 110,    // 11-20 → 11%
    110, 110, 110, 110, 110,
];

/// Whole-G$ prize for each of `n` winners from a `pool_g` pool. Rank i (0-based)
/// gets floor(pool * bps[i] / 10000); ranks beyond the table get 0.
///
/// `custom` is the season's own split when it has one (e.g. Season 1's flat top 10,
/// which the long-tail default can't express); otherwise the default table applies.
fn payout_split(pool_g: u64, n: usize, custom: Option<&[i32]>) -> Vec<u64> {
    let table: Vec<u64> = match custom {
        Some(bps) if !bps.is_empty() => bps.iter().map(|b| (*b).max(0) as u64).collect(),
        _ => PAYOUT_BPS.to_vec(),
    };
    (0..n)
        .map(|i| table.get(i).map_or(0, |bps| pool_g.saturating_mul(*bps) / 10_000))
        .collect()
}

#[derive(FromRow)]
struct SeasonMeta {
    id: Uuid,
    name: String,
    starts_at: DateTime<Utc>,
    ends_at: Option<DateTime<Utc>>,
    prize_pool_g: i64,
    payout_status: String,
    /// Shared layout seed — every player in the season walks the same room chain.
    seed: i64,
    /// This season's own prize split in basis points by rank; None = the default table.
    payout_bps: Option<Vec<i32>>,
}

#[derive(Serialize, FromRow)]
struct BoardEntry {
    wallet_address: String,
    username: Option<String>,
    best: i32,
}

/// The season ladder, ranked by WAVES COMPLETED.
///
/// Not best-run and not time-played: a player's score is simply how far through the
/// chain they have got. Quitting never costs progress and dying only sends them back
/// to the start of their current wave, so this number is monotonic — which is exactly
/// what makes it a fair single measure of "who got furthest".
///
/// Ties break on who reached that wave FIRST, so no two places can ever share a rank
/// (which matters when each place is a separate cash prize).
async fn season_board(db: &sqlx::PgPool, s: &SeasonMeta, limit: i64) -> Vec<BoardEntry> {
    sqlx::query_as::<_, BoardEntry>(
        "SELECT g.wallet_address, p.username, (g.wave - 1) AS best
         FROM endless_progress g LEFT JOIN players p ON p.wallet_address = g.wallet_address
         WHERE g.season_id = $1 AND g.wave > 1
         ORDER BY g.wave DESC, g.reached_at ASC
         LIMIT $2",
    )
    .bind(s.id).bind(limit)
    .fetch_all(db).await.unwrap_or_default()
}

// ── GET /seasons/current ───────────────────────────────────────────────────────
// Public: the live season — its prize pool, the leaderboard within its window, and
// the estimated payout each rank would earn if the season closed now. This is what
// makes the competition legible ("play the Gauntlet, here's what's on the line").
pub async fn current(state: web::Data<AppState>) -> HttpResponse {
    // Prefer a season that is live RIGHT NOW (a season carries a scheduled window, so
    // "live" is a time comparison, not just an open-ended ends_at). Otherwise show the
    // most recent one, so a finished season keeps displaying its final board.
    let season: Option<SeasonMeta> = sqlx::query_as::<_, SeasonMeta>(
        "SELECT id, name, starts_at, ends_at, prize_pool_g, payout_status, seed, payout_bps
         FROM seasons
         ORDER BY (starts_at <= now() AND (ends_at IS NULL OR ends_at >= now())) DESC,
                  starts_at DESC
         LIMIT 1",
    )
    .fetch_optional(&state.db).await.ok().flatten();

    let Some(season) = season else {
        return HttpResponse::Ok().json(json!({ "season": null }));
    };

    // Show the WHOLE field, not a page of it. With 28 entrants a limit of 25 quietly
    // hid three players who had earned their place — and a player who cannot see
    // themselves on the board has no way to tell a ranking from a recording fault.
    // Payout is capped separately by the split table, so this only affects display.
    let board = season_board(&state.db, &season, 500).await;
    let split = payout_split(season.prize_pool_g.max(0) as u64, board.len(), season.payout_bps.as_deref());
    let entries: Vec<_> = board.iter().enumerate().map(|(i, e)| json!({
        "rank": i + 1,
        "wallet_address": e.wallet_address,
        "username": e.username,
        "best": e.best,
        "est_payout_g": split.get(i).copied().unwrap_or(0),
    })).collect();

    let now = Utc::now();
    let started = season.starts_at <= now;
    let ended = season.ends_at.map(|e| e < now).unwrap_or(false);

    HttpResponse::Ok().json(json!({
        "season": {
            "id": season.id,
            "name": season.name,
            "starts_at": season.starts_at.to_rfc3339(),
            "ends_at": season.ends_at.map(|d| d.to_rfc3339()),
            // Live now — the flag the Seasonal Campaign entry unlocks on.
            "active": started && !ended,
            // Scheduled but not open yet, so the UI can count down to it.
            "upcoming": !started,
            "ended": ended,
            "seed": season.seed,
            "prize_pool_g": season.prize_pool_g,
            "payout_status": season.payout_status,
        },
        "leaderboard": entries,
    }))
}

// ── POST /admin/seasons/:id/fund ───────────────────────────────────────────────
// Admin: set a season's G$ prize pool. (Funding the on-chain RewardPool balance is
// separate — this just records how much of it this season pays out.)
#[derive(serde::Deserialize)]
pub struct FundRequest { pub prize_pool_g: i64 }

pub async fn fund(req: HttpRequest, state: web::Data<AppState>, path: web::Path<Uuid>, body: web::Json<FundRequest>) -> HttpResponse {
    if let Err(resp) = verify_admin_token(&req) { return resp; }
    if body.prize_pool_g < 0 {
        return HttpResponse::BadRequest().json(json!({"error": "Prize pool must be ≥ 0"}));
    }
    let row = sqlx::query("UPDATE seasons SET prize_pool_g = $1 WHERE id = $2")
        .bind(body.prize_pool_g).bind(path.into_inner())
        .execute(&state.db).await;
    match row {
        Ok(r) if r.rows_affected() == 1 => HttpResponse::Ok().json(json!({"ok": true, "prize_pool_g": body.prize_pool_g})),
        Ok(_) => HttpResponse::NotFound().json(json!({"error": "Season not found"})),
        Err(e) => { tracing::error!("season fund failed: {}", e); HttpResponse::InternalServerError().json(json!({"error": "Database error"})) }
    }
}

// ── GET /admin/seasons/:id/payout-preview ──────────────────────────────────────
// Admin, READ-ONLY. Exactly who would be paid, how much, and whether the money and
// gas are actually there — so the payout is a confirmation, not a leap of faith.
//
// Deliberately runs the SAME board + split the payout runs, rather than
// reimplementing "who wins" for display. A preview that can disagree with the
// transfer it is previewing is worse than no preview.
//
// Once a payout has started, this reports the REAL rows (with their status and tx
// hashes) instead of a fresh computation, so a resumed payout shows what is left.
pub async fn payout_preview(req: HttpRequest, state: web::Data<AppState>, path: web::Path<Uuid>) -> HttpResponse {
    if let Err(resp) = verify_admin_token(&req) { return resp; }
    let season_id = path.into_inner();

    let season: Option<SeasonMeta> = sqlx::query_as::<_, SeasonMeta>(
        "SELECT id, name, starts_at, ends_at, prize_pool_g, payout_status, seed, payout_bps FROM seasons WHERE id = $1",
    )
    .bind(season_id).fetch_optional(&state.db).await.ok().flatten();
    let Some(season) = season else {
        return HttpResponse::NotFound().json(json!({"error": "Season not found"}));
    };

    // Committed rows win over a recomputed board: after the first run these carry
    // the truth, including anything that failed part-way.
    let committed: Vec<(String, Option<String>, i32, i32, i64, String, Option<String>)> = sqlx::query_as(
        "SELECT sp.wallet_address, p.username, sp.rank, sp.waves, sp.amount_g, sp.status, sp.tx_hash
         FROM season_payouts sp LEFT JOIN players p ON p.wallet_address = sp.wallet_address
         WHERE sp.season_id = $1 ORDER BY sp.rank ASC",
    )
    .bind(season_id).fetch_all(&state.db).await.unwrap_or_default();

    let winners: Vec<serde_json::Value> = if committed.is_empty() {
        let board = season_board(&state.db, &season, PAYOUT_BPS.len() as i64).await;
        let split = payout_split(season.prize_pool_g.max(0) as u64, board.len(), season.payout_bps.as_deref());
        board.iter().enumerate()
            .filter_map(|(i, e)| {
                let amount = split.get(i).copied().unwrap_or(0);
                // Mirrors the payout's own "no dust rows" skip, so the count matches.
                if amount == 0 { return None; }
                Some(json!({
                    "rank": i + 1, "wallet_address": e.wallet_address, "username": e.username,
                    "waves": e.best, "amount_g": amount, "status": "pending", "tx_hash": null,
                }))
            })
            .collect()
    } else {
        committed.iter().map(|(w, u, r, waves, amt, st, tx)| json!({
            "rank": r, "wallet_address": w, "username": u,
            "waves": waves, "amount_g": amt, "status": st, "tx_hash": tx,
        })).collect()
    };

    let total_g: i64 = winners.iter().filter_map(|w| w["amount_g"].as_i64()).sum();
    let unpaid_g: i64 = winners.iter()
        .filter(|w| w["status"].as_str() != Some("paid"))
        .filter_map(|w| w["amount_g"].as_i64())
        .sum();

    // StillHuntRewardPool.MAX_REWARD caps one distributeReward at 10,000 G$, so each
    // prize goes out in chunks. Surfacing the count sets the right expectation:
    // this is a long run of transactions, not a single click that returns at once.
    const MAX_CHUNK_G: i64 = 10_000;
    let tx_count: i64 = winners.iter()
        .filter(|w| w["status"].as_str() != Some("paid"))
        .filter_map(|w| w["amount_g"].as_i64())
        .map(|a| (a + MAX_CHUNK_G - 1) / MAX_CHUNK_G)
        .sum();

    // Can it actually complete? Money and gas are the two ways this fails half-way.
    let (pool_balance_g, pool_address, relay_celo) = match state.chain.as_ref() {
        Some(chain) => {
            let addr = chain.reward_pool_address();
            let bal = match addr {
                Some(a) => chain.g_balance(a).await.ok().map(|b| (b / ethers::types::U256::exp10(18)).as_u64() as i64),
                None => None,
            };
            let celo = chain.celo_balance(chain.relay_address()).await.ok()
                .map(|c| c.as_u128() as f64 / 1e18);
            (bal, addr.map(|a| format!("{:?}", a)), celo)
        }
        None => (None, None, None),
    };

    let now = Utc::now();
    let closed = season.ends_at.map(|e| e <= now).unwrap_or(false);

    HttpResponse::Ok().json(json!({
        "season": {
            "id": season.id, "name": season.name,
            "ends_at": season.ends_at.map(|d| d.to_rfc3339()),
            "prize_pool_g": season.prize_pool_g,
            "payout_status": season.payout_status,
            "closed": closed,
        },
        "winners": winners,
        "winner_count": winners.len(),
        "total_g": total_g,
        "unpaid_g": unpaid_g,
        "tx_count": tx_count,
        "pool_address": pool_address,
        "pool_balance_g": pool_balance_g,
        // The two preconditions, pre-checked so the UI can say WHY it is blocked.
        "funded": pool_balance_g.map(|b| b >= unpaid_g).unwrap_or(false),
        "relay_celo": relay_celo,
        "can_pay": closed && pool_balance_g.map(|b| b >= unpaid_g).unwrap_or(false) && unpaid_g > 0,
    }))
}

// ── POST /admin/seasons/:id/payout ─────────────────────────────────────────────
// Admin, MONEY-TOUCHING. Computes the top runs in a CLOSED season, writes the payout
// ledger (idempotent), and distributes G$ on-chain via the RewardPool. Safe to re-run:
// winners are computed once (PK), and each transfer is guarded by the on-chain ref so
// re-running only re-attempts rows that haven't paid yet (a built-in reconcile).
pub async fn payout(req: HttpRequest, state: web::Data<AppState>, path: web::Path<Uuid>) -> HttpResponse {
    if let Err(resp) = verify_admin_token(&req) { return resp; }
    let season_id = path.into_inner();

    let season: Option<SeasonMeta> = sqlx::query_as::<_, SeasonMeta>(
        "SELECT id, name, starts_at, ends_at, prize_pool_g, payout_status, seed, payout_bps FROM seasons WHERE id = $1",
    )
    .bind(season_id).fetch_optional(&state.db).await.ok().flatten();
    let Some(season) = season else {
        return HttpResponse::NotFound().json(json!({"error": "Season not found"}));
    };
    // The season must be OVER, not merely scheduled to end. Checking only that
    // ends_at exists let a payout run mid-season, and that is not a recoverable
    // mistake: the winners are frozen on the first run (see the `already == 0`
    // guard below) and every chunk burns a one-shot on-chain reference, so a
    // player who climbed after the early payout could never be paid the
    // difference. Refuse until the clock has actually passed.
    let Some(ends_at) = season.ends_at else {
        return HttpResponse::BadRequest().json(json!({"error": "End the season before paying it out"}));
    };
    if ends_at > Utc::now() {
        return HttpResponse::BadRequest().json(json!({
            "error": "Season is still running — it closes at its scheduled time",
            "ends_at": ends_at.to_rfc3339(),
        }));
    }
    let Some(chain) = state.chain.as_ref().cloned() else {
        return HttpResponse::ServiceUnavailable().json(json!({"error": "Chain relay not available"}));
    };

    // Compute winners exactly once — the PK makes the INSERT a no-op on re-run.
    let already: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM season_payouts WHERE season_id = $1")
        .bind(season_id).fetch_one(&state.db).await.unwrap_or(0);
    if already == 0 {
        let board = season_board(&state.db, &season, PAYOUT_BPS.len() as i64).await;
        let split = payout_split(season.prize_pool_g.max(0) as u64, board.len(), season.payout_bps.as_deref());
        for (i, e) in board.iter().enumerate() {
            let amount = split.get(i).copied().unwrap_or(0);
            if amount == 0 { continue; } // no dust rows
            let _ = sqlx::query(
                "INSERT INTO season_payouts (season_id, wallet_address, rank, waves, amount_g)
                 VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING",
            )
            .bind(season_id).bind(&e.wallet_address).bind((i + 1) as i32).bind(e.best).bind(amount as i64)
            .execute(&state.db).await;
        }
    }

    // (Re)attempt every not-yet-paid payout on-chain.
    let rows: Vec<(String, i64)> = sqlx::query_as(
        "SELECT wallet_address, amount_g FROM season_payouts WHERE season_id = $1 AND status <> 'paid' ORDER BY rank ASC",
    )
    .bind(season_id).fetch_all(&state.db).await.unwrap_or_default();

    let attempted = rows.len();
    let mut paid = 0u32;
    for (wallet, amount) in rows {
        if settle_season_payout(&state.db, &chain, season_id, &wallet, amount.max(0) as u64).await {
            paid += 1;
        }
    }

    // Season is fully paid once nothing is left unpaid.
    let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM season_payouts WHERE season_id = $1 AND status <> 'paid'")
        .bind(season_id).fetch_one(&state.db).await.unwrap_or(1);
    if remaining == 0 {
        let _ = sqlx::query("UPDATE seasons SET payout_status = 'paid' WHERE id = $1").bind(season_id).execute(&state.db).await;
    }

    tracing::info!("season {} payout: {}/{} settled, {} still unpaid", season.name, paid, attempted, remaining);
    HttpResponse::Ok().json(json!({
        "ok": true, "attempted": attempted, "paid": paid,
        "still_unpaid": remaining, "season_paid": remaining == 0,
    }))
}

/// Distribute one season prize on-chain + reconcile the row/ledger. Mirrors the
/// first-clear bounty settle: an on-chain `ref` keyed to (season, wallet) makes every
/// re-attempt idempotent, and an already-used ref reconciles to paid without gas.
async fn settle_season_payout(
    db: &sqlx::PgPool,
    chain: &crate::services::chain::ChainWriter,
    season_id: Uuid,
    wallet: &str,
    amount: u64,
) -> bool {
    let Ok(addr) = wallet.parse::<Address>() else { return false; };

    // StillHuntRewardPool.MAX_REWARD caps a SINGLE distributeReward at 10,000 G$ and
    // reverts anything larger, so a season prize (Season 1 pays ~85,500 G$ a head)
    // has to go out as a series of transfers. Each chunk carries its OWN on-chain
    // reference, which is what makes the whole payout resumable: re-running after a
    // partial failure skips the chunks that already landed and retries only the rest.
    const MAX_CHUNK_G: u64 = 10_000; // mirrors StillHuntRewardPool.MAX_REWARD

    let mut chunks: Vec<u64> = Vec::new();
    let mut left = amount;
    while left > 0 {
        let take = left.min(MAX_CHUNK_G);
        chunks.push(take);
        left -= take;
    }

    let mut last_hash: Option<String> = None;
    let mut all_ok = true;
    for (i, chunk) in chunks.iter().enumerate() {
        let reference = ethers::utils::keccak256(
            format!("season_payout:{}:{}:{}", season_id, wallet, i).as_bytes(),
        );
        let already = chain.reward_ref_used(reference).await.unwrap_or(false);
        // Some(hash) = paid by THIS settle; None = landed in an earlier tx we no longer know.
        let result = if already {
            Ok(Some(None))
        } else {
            chain.distribute_reward(addr, *chunk, reference).await.map(|r| r.map(Some))
        };
        match result {
            Ok(Some(h)) => { if h.is_some() { last_hash = h; } }
            Ok(None) | Err(_) => {
                tracing::error!(
                    "season payout chunk {}/{} FAILED for {} ({} G$) — re-run the payout to resume",
                    i + 1, chunks.len(), wallet, chunk,
                );
                all_ok = false;
                break; // stop on the first failure; the rest stay unpaid and retryable
            }
        }
    }

    // Only a fully-delivered prize counts as paid. A partial one stays 'failed' so
    // re-running the payout picks it back up where it stopped.
    let result: Result<Option<Option<String>>, ()> = if all_ok { Ok(Some(last_hash)) } else { Ok(None) };

    match result {
        Ok(Some(tx_hash)) => {
            let _ = sqlx::query("UPDATE season_payouts SET status = 'paid', tx_hash = COALESCE($3, tx_hash) WHERE season_id = $1 AND wallet_address = $2")
                .bind(season_id).bind(wallet).bind(&tx_hash).execute(db).await;
            let credited_locally = sqlx::query("UPDATE players SET g_earned_lifetime = g_earned_lifetime + $1 WHERE wallet_address = $2")
                .bind(amount as i64).bind(wallet).execute(db).await;
            // Paid on-chain already; a failed local credit means our ledger under-reports
            // real money, so never swallow it.
            crate::handlers::battles::log_write_failure("season g_earned_lifetime credit", wallet, &credited_locally);
            crate::handlers::ledger::insert_ledger_entry(
                db, wallet, "season_reward", rust_decimal::Decimal::from(amount), tx_hash.as_deref(), None,
                crate::services::chain_id::ChainId::Celo,
            ).await;
            tracing::info!("season payout paid: {} +{} G$ in {} tx", wallet, amount, chunks.len());
            true
        }
        Ok(None) | Err(_) => {
            let _ = sqlx::query("UPDATE season_payouts SET status = 'failed' WHERE season_id = $1 AND wallet_address = $2")
                .bind(season_id).bind(wallet).execute(db).await;
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_is_top_heavy_and_within_pool() {
        let s = payout_split(1000, 20, None);
        assert_eq!(s[0], 300); // 30%
        assert_eq!(s[1], 180); // 18%
        assert!(s[0] > s[1] && s[1] > s[2]);           // strictly top-heavy
        assert!(s.iter().sum::<u64>() <= 1000);         // never over-pays
        assert_eq!(s.iter().sum::<u64>(), 1000);        // full pool across 20
    }

    #[test]
    fn fewer_winners_leave_the_rest_in_pool() {
        let s = payout_split(1000, 3, None);
        assert_eq!(s, vec![300, 180, 120]);
        assert!(s.iter().sum::<u64>() < 1000); // unclaimed stays in pool
    }

    #[test]
    fn empty_and_zero_are_safe() {
        assert!(payout_split(1000, 0, None).is_empty());
        assert_eq!(payout_split(0, 5, None), vec![0, 0, 0, 0, 0]);
    }

    #[test]
    fn winners_past_the_table_get_nothing() {
        let s = payout_split(1_000_000, 25, None);
        assert_eq!(s.len(), 25);
        assert_eq!(s[20], 0); // rank 21 → beyond the 20-deep table
    }
}
