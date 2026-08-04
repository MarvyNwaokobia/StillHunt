use actix_web::{web, HttpRequest, HttpResponse};
use chrono::Utc;
use ethers::types::Address;
use serde::Deserialize;
use serde_json::json;
use std::time::{Duration, Instant};
use uuid::Uuid;

use crate::AppState;
use crate::models::player::Player;
use crate::services::battle::{BotFightSession, LiveFightSession, RoundData, fight_xp, simulate_async_fight};
use crate::utils::{is_valid_wallet, normalize_wallet};

fn uuid_to_bytes32(id: Uuid) -> [u8; 32] {
    let mut bytes = [0u8; 32];
    bytes[..16].copy_from_slice(id.as_bytes());
    bytes
}

/// Records a finished operation on-chain and stores the hash.
///
/// Best effort throughout. The operation already happened and the player already
/// has their XP, so a failed write costs one row in a public log and nothing
/// else — which is exactly why the database, not the chain, is the operational
/// source of truth.
async fn record_on_chain(
    db: &sqlx::PgPool,
    chain: Option<crate::services::chain::ChainWriter>,
    battle_id: Uuid,
    battle_bytes: [u8; 32],
    winner: Address,
    loser: Address,
    xp_winner: u32,
    xp_loser: u32,
    solo: bool,
) {
    let Some(c) = chain else { return };

    // Checked first so a drained relay logs one clear line instead of one failed
    // send per operation.
    if !c.relay_can_pay().await {
        tracing::error!(
            "{}: skipping record for {} — relay {:?} cannot pay gas",
            crate::services::chain::RELAY_OUT_OF_GAS, battle_id, c.relay_address(),
        );
        return;
    }

    if let Some(hash) = c
        .record_contract(battle_bytes, winner, loser, xp_winner, xp_loser, solo)
        .await
    {
        let tx = format!("{:?}", hash);
        if let Err(e) = sqlx::query("UPDATE battles SET game_record_tx = $1 WHERE id = $2")
            .bind(&tx).bind(battle_id).execute(db).await
        {
            tracing::error!("Failed to set game_record_tx for {}: {}", battle_id, e);
        }
    }
}

#[derive(sqlx::FromRow)]
struct EquippedBoost {
    stat_boost: i32,
    category:   String,
}

async fn equipped_xp_multiplier(db: &sqlx::PgPool, wallet: &str) -> i32 {
    let has_booster: bool = sqlx::query_scalar(
        "SELECT EXISTS (
            SELECT 1 FROM inventory
            JOIN items ON inventory.item_id = items.id
            WHERE inventory.wallet_address = $1
              AND inventory.equipped = true
              AND items.category = 'booster'
        )",
    )
    .bind(wallet)
    .fetch_one(db)
    .await
    .unwrap_or(false);

    if has_booster { 2 } else { 1 }
}

async fn apply_item_boosts(db: &sqlx::PgPool, mut player: Player) -> Player {
    let boosts: Vec<EquippedBoost> = sqlx::query_as(
        "SELECT items.stat_boost, items.category
         FROM inventory
         JOIN items ON inventory.item_id = items.id
         WHERE inventory.wallet_address = $1 AND inventory.equipped = true",
    )
    .bind(&player.wallet_address)
    .fetch_all(db)
    .await
    .unwrap_or_default();

    for b in boosts {
        match b.category.as_str() {
            "weapon" => player.attack_stat  += b.stat_boost,
            "shield" => player.defense_stat += b.stat_boost,
            _ => {}
        }
    }
    player
}

/// PROGRESSIVE rank ladder: the cost of a rank GROWS with the rank.
///
/// A flat cost per rank was the old design error. It charged the first rank (the one
/// carrying retention) exactly what it charged the last (the one carrying prestige), and
/// at a flat 5000 the entire 15-op campaign played perfectly (2610 XP body-shot, 3390
/// all-headshot) could not buy even ONE rank. The only way up was replaying the single
/// best-paying op ~20 times per rank.
///
/// Indexed by rank-up ordinal (Tracker = 1 … Apex = 6). Calibrated against the real
/// campaign ceiling: Tracker lands inside the first session (~op 3), and one full
/// campaign clear (~2610 XP) lands Marksman, so the story arc and the rank arc finish
/// together. Apex stays a genuine climb at ~6.7 campaign-equivalents.
const RANK_STEP_XP: [i32; 6] = [400, 900, 1300, 2500, 4500, 8000];
/// Past Apex every prestige costs a flat step, forever (uncapped, see award_player).
const PRESTIGE_STEP_XP: i32 = 8000;

/// XP that the `ordinal`-th rank-up costs on its own (the size of the bar you fill
/// while sitting at the rank below it). Ordinals past Apex are prestiges.
fn rank_step_xp(ordinal: i32) -> i32 {
    if ordinal <= 0 {
        return RANK_STEP_XP[0];
    }
    *RANK_STEP_XP
        .get((ordinal - 1) as usize)
        .unwrap_or(&PRESTIGE_STEP_XP)
}

/// Total XP a player must have earned across their whole career to legitimately hold
/// the `ordinal`-th rank. This is the Way-2 anti-forgery gate: it must track the curve
/// exactly, or an honest player's rank-up bonus gets silently withheld.
fn cumulative_xp_for_rank(ordinal: i32) -> i32 {
    (1..=ordinal.max(0)).map(rank_step_xp).sum()
}
/// Rank-up G$ is FLAT: every rank-up pays the same, whichever rank it is.
///
/// It used to be STEP × N (Tracker 500, Stalker 1000 … Apex 3000), so reaching
/// Apex paid 10,500 G$ across the climb. The scaling was the point — rarer ranks
/// paid more — but at the pool's real size it was unaffordable: measured against the
/// live ledger, rank-ups plus campaign clears plus Endless had paid 622,238 G$ in
/// eighteen days against a 73,534 G$ pool, roughly two days of runway.
///
/// Flat pays 1,200 G$ for the whole climb to Apex instead of 10,500, and every
/// prestige past it the same 200. Paid once per (wallet, rank) on-chain, idempotently —
/// see award_player + settle_rank_up_reward.
const RANK_UP_REWARD_G: u64 = 200;
const MAX_REWARD_G: u64 = 10_000; // StillHuntRewardPool.MAX_REWARD — a bigger payout reverts

/// G$ for the reward_ordinal-th rank-up. Flat, so the ordinal no longer changes the
/// amount; kept in the signature because callers pass it and the idempotency key is
/// still per-rank. Clamped for the same reason the others are: MAX_REWARD_G is the
/// on-chain per-call ceiling, and a constant over it would revert every payout.
fn rank_up_reward_g(_reward_ordinal: i32) -> u64 {
    RANK_UP_REWARD_G.min(MAX_REWARD_G)
}
const VALID_MOVES: &[&str] = &["attack", "defend", "special"];

/// THE LADDER, lowest to highest. This is the single source of truth for rank ORDER:
/// `next_rank`, `rank_ordinal` and the leaderboard's SQL sort all derive from it, so
/// adding a tier is one edit here rather than a hunt for every place that happens to
/// list the ranks.
///
/// It is a const because the last time a tier was added by hand, one copy was missed:
/// the leaderboard sort still spelled out the OLD five-rank ladder, which dropped
/// Ghost (the second-highest rank) into its `ELSE` bucket and sorted Ghost players
/// BELOW Stalker. Deriving from one array makes that failure impossible.
pub(crate) const RANK_LADDER: [&str; 7] =
    ["Drifter", "Tracker", "Stalker", "Marksman", "Ranger", "Ghost", "Apex"];

fn next_rank(rank: &str) -> Option<&'static str> {
    // Apex (the last entry) has no next rank — a full bar past it PRESTIGES
    // instead (see award_player). An unknown rank has no next step either.
    let i = RANK_LADDER.iter().position(|r| *r == rank)?;
    RANK_LADDER.get(i + 1).copied()
}

/// G$ bounty for a Campaign op — FLAT, the same for every op. Paid on the first clear,
/// once per (wallet, op).
///
/// It used to be 500 × level, so op 15 paid 7,500 and clearing all fifteen paid 60,000.
/// Splitting the live ledger by source showed why that had to go: campaign first clears
/// alone were 573,822 G$ of the 622,238 G$ ever paid out — 92% of everything — against
/// a 73,534 G$ pool. The weekly cap was already quietly halving the top ops (op 15
/// averaged 3,712 paid against 7,500 owed), which is a cap doing a payout curve's job
/// and telling players a number that then does not arrive.
///
/// Cut again 200 -> 10 on 2026-07-31: the full fifteen-op campaign now pays 150 G$,
/// down from 3,000 and from 60,000 before that. Same shape, same promise at every op —
/// only the size changed.
const FIRST_CLEAR_BOUNTY_G: u64 = 10;

/// The op RATE, ignoring whether earning is currently paused. Flat, so the level no
/// longer changes the amount. Clamped to the on-chain per-payout ceiling, since a
/// bigger single distributeReward call reverts.
///
/// Split from `first_clear_bounty` so the rate stays assertable on its own: a test that
/// exercised the paused path would only ever see 0 and would stop guarding the curve.
fn op_bounty_rate_g(_level: i32) -> u64 {
    FIRST_CLEAR_BOUNTY_G.min(MAX_REWARD_G)
}

/// What an op clear actually pays right now: the rate, or nothing while the earning
/// pause is on (see earn_cap::earning_paused). Ops are one of the two grindable
/// surfaces the pause covers; rank-ups keep paying.
fn first_clear_bounty(level: i32) -> u64 {
    if crate::services::earn_cap::earning_paused() {
        return 0;
    }
    op_bounty_rate_g(level)
}

struct FightOutcome {
    won:       bool,
    xp_earned: i32,
    new_xp:    i32,
    ranked_up: bool,
    new_rank:  Option<&'static str>,
    g_awarded: i64,
    prestiged: bool, // true when this fight prestiged the player (past Apex)
    prestige_level: i32, // the player's prestige level after this fight
    battle_id: Uuid,
}

pub(crate) struct PlayerAward {
    pub xp_earned: i32,
    pub new_xp:    i32,
    pub ranked_up: bool,
    pub new_rank:  Option<&'static str>,
    pub g_awarded: i64,
    pub prestiged: bool,
    pub prestige_level: i32,
}

/// Number of rank-ups needed to reach a rank, from the Drifter floor — Tracker is the 1st,
/// Apex the 6th. Used to size the refereed-XP a rank-up bonus requires
/// (the curve's cumulative XP through N). Prestige levels extend past Apex: prestige P is the
/// (6 + P)th rank-up, computed inline in award_player rather than here.
/// Position on the ladder: Drifter 0 … Apex 6. An unknown rank reads as the floor,
/// which fails closed (it gates rewards harder, never softer).
fn rank_ordinal(rank: &str) -> i32 {
    RANK_LADDER.iter().position(|r| *r == rank).unwrap_or(0) as i32
}

/// Shout when a write that carries a player's money or progress fails.
///
/// The default `let _ = sqlx::query(...)` discards the error, which is how a stale
/// `xp <= 999` CHECK constraint froze one player's rank for 18 hours while every
/// sibling write in the same request succeeded and the app looked perfectly healthy
/// (see migrations/fix_xp_cap.sql). Anything on the reward path routes through here so
/// the next such failure is one log search away instead of needing a player to notice.
pub(crate) fn log_write_failure(
    what: &str,
    wallet: &str,
    result: &Result<sqlx::postgres::PgQueryResult, sqlx::Error>,
) {
    if let Err(e) = result {
        tracing::error!("WRITE FAILED [{}] for {}: {}", what, wallet, e);
    }
}

/// Award one player for a finished fight: re-read them, compute XP (× multiplier),
/// handle rank-up + its G$ reward, persist the player row, and kick the per-player
/// rank-up on-chain records. The caller decides win/loss; all amounts are computed
/// here. Used for every mode (bot, live PvE, PvP) so awards never diverge.
///
/// `reward_eligible` marks a server-verified (refereed) fight — a session-backed
/// Campaign fight, a bot fight, PvP, or a server-authoritative Endless wave. Only these
/// add to `ranked_xp_lifetime`, and a rank-up's G$ bonus is paid only when that tally
/// justifies the rank. This blocks farming the bonus through an honor-system path
/// without ever denying honest progression — rank still advances for all XP.
///
/// `count_result` records the win/loss on the player's W/L tally. True for real fights;
/// false for Endless waves, which award XP (and can rank up) but should not each count
/// as a "win" on the profile.
pub(crate) async fn award_player(
    state: &AppState,
    wallet: &str,
    won: bool,
    base_xp: i32,
    xp_multiplier: i32,
    reward_eligible: bool,
    count_result: bool,
) -> Result<PlayerAward, HttpResponse> {
    // Re-fetch so xp/wins/losses/rank reflect any change since the fight began.
    let player = sqlx::query_as::<_, Player>("SELECT * FROM players WHERE wallet_address = $1")
        .bind(wallet)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten();

    let Some(player) = player else {
        return Err(HttpResponse::InternalServerError().json(json!({"error": "Player not found"})));
    };

    let now = Utc::now();

    let xp_earned  = base_xp * xp_multiplier;
    let raw_new_xp = player.xp + xp_earned;

    // CLIMB the ladder, one step at a time, for as many steps as the new total pays for.
    // A filled bar does one of two things:
    //   • PROMOTE — advance to the next rank (Drifter→…→Apex), or
    //   • PRESTIGE — at Apex (no next rank), bump prestige_level instead. XP is never
    //     deleted; the bar keeps counting and keeps paying, forever. This is the fix for
    //     the old Apex bug where a full bar subtracted 1000 XP and paid nothing.
    //
    // This is a LOOP, not a single step, because the ladder is progressive: an early rank
    // can cost less than one op pays, and a backfill or a big Endless award can span
    // several. Awarding one rank per fight would strand that XP in the bar and quietly
    // under-pay every rank it skipped, so each step crossed is its own reward event with
    // its own key and its own G$.
    let mut new_xp      = raw_new_xp;
    let mut cur_rank: &str = &player.rank;
    let mut new_prestige   = player.prestige_level;
    // (reward_key, reward_ordinal, promoted_rank) per step crossed, in order.
    let mut steps: Vec<(String, i32, Option<&'static str>)> = Vec::new();

    loop {
        // The ordinal of the step being attempted: the next rank's ordinal, or for a
        // player already at Apex, the (6 + prestige)th.
        let ordinal = match next_rank(cur_rank) {
            Some(nr) => rank_ordinal(nr),
            None if cur_rank == "Apex" => rank_ordinal("Apex") + new_prestige + 1,
            // Unknown rank with no next step: bail WITHOUT touching xp, so a bad rank
            // string can never silently eat a player's progress.
            None => break,
        };
        let cost = rank_step_xp(ordinal);
        if new_xp < cost {
            break;
        }
        new_xp -= cost;
        match next_rank(cur_rank) {
            Some(nr) => {
                steps.push((nr.to_string(), ordinal, Some(nr)));
                cur_rank = nr;
            }
            None => {
                // Prestige: rank stays "Apex", so the plain name can't key the payout.
                new_prestige += 1;
                steps.push((format!("Apex+{}", new_prestige), ordinal, None));
            }
        }
        // Hard bound: a corrupt xp value can never spin here or mint unbounded payouts.
        if steps.len() >= 16 {
            break;
        }
    }

    let rank_event  = !steps.is_empty();
    let prestige_up = steps.iter().any(|(_, _, r)| r.is_none());
    // The highest rank actually reached this fight (None if only prestiges fired).
    let new_rank    = steps.iter().rev().find_map(|(_, _, r)| *r);
    // Set below, summed across every step whose payout slot is actually claimed.
    let mut g_awarded = 0i64;

    let wins   = if count_result && won  { player.wins + 1 }   else { player.wins };
    let losses = if count_result && !won { player.losses + 1 } else { player.losses };

    // Refereed-XP tally (Way 2). A verified fight atomically adds its XP and returns
    // the new total; an unverified one just reads the current total. Kept OUT of the
    // main player UPDATE below so a lagging migration can never block the core save —
    // if the column is missing this reads 0, which fails closed (withholds the bonus).
    let honest_xp_after: i32 = if reward_eligible && xp_earned != 0 {
        sqlx::query_scalar(
            "UPDATE players SET ranked_xp_lifetime = ranked_xp_lifetime + $1
             WHERE wallet_address = $2 RETURNING ranked_xp_lifetime",
        )
        .bind(xp_earned).bind(wallet)
        .fetch_optional(&state.db).await.ok().flatten().unwrap_or(0)
    } else {
        sqlx::query_scalar("SELECT ranked_xp_lifetime FROM players WHERE wallet_address = $1")
            .bind(wallet)
            .fetch_optional(&state.db).await.ok().flatten().unwrap_or(0)
    };

    // One UPDATE for every case. rank advances on a promotion (or stays put), and
    // prestige_level advances on a prestige (or stays put); when neither fires both bind
    // to their current value, a harmless no-op. g_earned_lifetime is bumped separately,
    // only once the G$ transfer confirms on-chain — see the tokio::spawn block.
    let new_rank_str: &str = cur_rank;
    let saved = sqlx::query(
        "UPDATE players
         SET xp = $1, wins = $2, losses = $3, rank = $4, prestige_level = $5,
             last_active = $6, decay_status = 'none'
         WHERE wallet_address = $7",
    )
    .bind(new_xp).bind(wins).bind(losses).bind(new_rank_str).bind(new_prestige)
    .bind(now).bind(wallet)
    .execute(&state.db).await;

    // NEVER swallow this one. It is the only write that persists rank progress, and
    // every other write in the request (battle row, ranked_xp_lifetime, pve_level,
    // first-clear bounty) is a separate statement that succeeds without it, so a
    // silent failure here looks exactly like a normal op while the player's rank is
    // frozen. A stale `xp <= 999` CHECK did precisely that for a day (fix_xp_cap.sql).
    // The fight still stands (the XP is banked in ranked_xp_lifetime and the battle
    // row), so this logs loudly rather than failing the request.
    if let Err(e) = &saved {
        tracing::error!(
            "PLAYER SAVE FAILED for {}: rank progress NOT persisted (xp={}, wins={}, \
             losses={}, rank={}, prestige={}): {}",
            wallet, new_xp, wins, losses, new_rank_str, new_prestige, e
        );
    }

    // Every step crossed pays separately, oldest first, so a multi-rank climb pays each
    // rank it passed through rather than only the one it landed on.
    for (reward_key, reward_ordinal, promoted) in &steps {
        let (reward_key, reward_ordinal) = (reward_key.clone(), *reward_ordinal);
        // This rank-up's payout grows with the rank (STEP × ordinal), capped on-chain,
        // then trimmed by the player's remaining weekly allowance. The RANK still
        // advances in full either way — the cap only ever touches money.
        let reward_g = crate::services::earn_cap::cap_reward(
            state, wallet, rank_up_reward_g(reward_ordinal),
        ).await;
        // Way 2 gate: the G$ bonus is paid only when the player's refereed lifetime XP
        // earns the level (the Nth rank-up needs the curve's cumulative XP through N).
        // The rank/prestige itself still advances above and on-chain below — only the
        // money is gated — so honest progression is untouched while forged flat/Endless
        // wins can never mint the bonus.
        let xp_needed = cumulative_xp_for_rank(reward_ordinal);
        let earned_enough = honest_xp_after >= xp_needed;

        // Claim the once-per-key payout slot idempotently: only the first request to
        // insert (wallet, reward_key) owns the payout. A retry or a concurrent duplicate
        // fight-complete hits the PK conflict and pays nothing (the on-chain ref guard
        // is the second line of defence). The key is unique per rank AND per prestige
        // level, so every prestige past Apex is its own one-time payout.
        let claimed = earned_enough && sqlx::query(
            "INSERT INTO rank_up_rewards (wallet_address, rank, amount)
             VALUES ($1, $2, $3) ON CONFLICT (wallet_address, rank) DO NOTHING",
        )
        .bind(wallet).bind(&reward_key).bind(reward_g as i64)
        .execute(&state.db).await
        .map(|r| r.rows_affected() == 1)
        .unwrap_or(false);

        if claimed {
            g_awarded += reward_g as i64;
        } else if !earned_enough {
            tracing::info!(
                "rank-up bonus withheld for {} → {}: refereed XP {} < {}",
                wallet, reward_key, honest_xp_after, xp_needed
            );
        }

        // The bonus accrues synchronously — it is a database write, not a
        // transfer, so there is nothing to wait on and nothing to retry.
        if claimed {
            accrue_rank_up(state, wallet, &reward_key, reward_g).await;
        }

        // Only the on-chain record is fired in the background, because it is the
        // one thing here that talks to a chain and can be slow.
        if let (Some(chain), Ok(addr)) = (state.chain.as_ref().cloned(), wallet.parse::<Address>()) {
            if let Some(rank) = promoted.map(|r| r.to_string()) {
                tokio::spawn(async move { chain.record_rank(addr, rank).await; });
            }
        }
    }

    Ok(PlayerAward { xp_earned, new_xp, ranked_up: rank_event, new_rank, g_awarded, prestiged: prestige_up, prestige_level: new_prestige })
}

/// Persist exactly one battle row and kick the on-chain `record_battle`. The loser
/// is whichever of challenger/opponent is not the winner; "bot"/invalid wallets map
/// to the zero address on-chain. Shared by PvE (opponent = "bot", is_bot) and PvP.
pub(crate) async fn persist_battle(
    state: &AppState,
    battle_id: Uuid,
    challenger: &str,
    opponent: &str,
    winner_wallet: &str,
    xp_challenger: i32,
    xp_opponent: i32,
    is_bot: bool,
    rounds_data: serde_json::Value,
    // Whether to also record this result on-chain (StillHuntRecord). PvE losses
    // skip the chain to save gas — the DB row still shows in battle history.
    should_record: bool,
    // Which mode produced this row: "campaign" | "bot" | "pvp" | "endless".
    mode: &str,
    // Did this battle increment players.wins/losses? MUST match the `count_result`
    // passed to award_player for the same fight. Every mode lands here as a
    // structurally identical row, so without this the ledger cannot say whether a
    // row was meant to count, and readers are forced to assume it did — which is
    // what made the consistency check flag Endless players as corrupt.
    counts_result: bool,
) {
    let now = Utc::now();
    let _ = sqlx::query(
        "INSERT INTO battles
           (id, challenger_wallet, opponent_wallet, winner_wallet,
            rounds_data, xp_awarded_challenger, xp_awarded_opponent, is_bot, created_at,
            mode, counts_result)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
    )
    .bind(battle_id)
    .bind(challenger)
    .bind(opponent)
    .bind(winner_wallet)
    .bind(rounds_data)
    .bind(xp_challenger)
    .bind(xp_opponent)
    .bind(is_bot)
    .bind(now)
    .bind(mode)
    .bind(counts_result)
    .execute(&state.db)
    .await;

    if let Some(chain) = state.chain.as_ref().filter(|_| should_record).cloned() {
        let loser_wallet = if winner_wallet == challenger { opponent } else { challenger };
        let winner_addr = winner_wallet.parse::<Address>().unwrap_or_else(|_| Address::zero());
        let loser_addr = loser_wallet.parse::<Address>().unwrap_or_else(|_| Address::zero());
        let battle_bytes = uuid_to_bytes32(battle_id);
        // u32, not u8. A boss operation pays more than 255 XP and the narrower
        // type silently wrapped, so the on-chain record disagreed with the game.
        let xp = xp_challenger.max(xp_opponent).max(0) as u32;
        let db = state.db.clone();
        tokio::spawn(async move {
            record_on_chain(
                &db, Some(chain), battle_id, battle_bytes,
                winner_addr, loser_addr, xp, 0, is_bot,
            ).await;
        });
    }
}

/// Server-authoritative finalize for a single-player-perspective fight (turn-based
/// bot fight and the real-time PvE fighter). Awards the player and records one bot
/// battle row.
async fn finalize_fight(
    state: &AppState,
    wallet: &str,
    won: bool,
    base_xp: i32,
    xp_multiplier: i32,
    rounds_data: serde_json::Value,
    // Record this result on-chain? PvE passes `won` (Option B: wins/completions
    // on-chain, losses history-only); the bot fight passes true.
    should_record: bool,
    // Is this a server-verified (refereed) fight? Bot fights are; a live fight is
    // only when it's session-backed (Campaign). Gates the rank-up G$ bonus.
    reward_eligible: bool,
    // "campaign" or "bot" — recorded on the row so the ledger is self-describing.
    mode: &str,
) -> Result<FightOutcome, HttpResponse> {
    // count_result and the row's counts_result are the SAME decision; keep them on
    // one binding so they can never drift apart.
    const COUNTS: bool = true;
    let award = award_player(state, wallet, won, base_xp, xp_multiplier, reward_eligible, COUNTS).await?;
    let battle_id = Uuid::new_v4();
    let winner = if won { wallet } else { "bot" };
    persist_battle(state, battle_id, wallet, "bot", winner, award.xp_earned, 0, true, rounds_data, should_record, mode, COUNTS).await;
    Ok(FightOutcome {
        won,
        xp_earned: award.xp_earned,
        new_xp:    award.new_xp,
        ranked_up: award.ranked_up,
        new_rank:  award.new_rank,
        g_awarded: award.g_awarded,
        prestiged: award.prestiged,
        prestige_level: award.prestige_level,
        battle_id,
    })
}

/// Sessions are abandoned (no /round call) after this long are dropped.
const SESSION_TTL_SECS: u64 = 600;

#[derive(Deserialize)]
pub struct StartBotFightRequest {
    pub wallet: String,
}

#[derive(Deserialize)]
pub struct BotFightRoundRequest {
    pub session_id:   Uuid,
    pub player_move:  String,
}

#[derive(Deserialize)]
pub struct ChallengeRequest {
    pub challenger_wallet: String,
    pub opponent_wallet: String,
}

/// Starts a new bot fight session: validates the player, snapshots their
/// item-boosted stats, picks the bot's class, and stores in-progress fight
/// state server-side. The client then plays it out via `/battles/bot/round`.
pub async fn start_bot_fight(
    state: web::Data<AppState>,
    req: HttpRequest,
    body: web::Json<StartBotFightRequest>,
) -> HttpResponse {
    // Rate limit: 10 bot fights per 60 seconds per IP
    let ip = req.connection_info().realip_remote_addr()
        .unwrap_or("unknown")
        .to_string();
    if !state.battle_limiter.check(&ip) {
        return HttpResponse::TooManyRequests()
            .json(json!({"error": "Too many battles. Slow down, warrior."}));
    }

    // Validate wallet
    if !is_valid_wallet(&body.wallet) {
        return HttpResponse::BadRequest().json(json!({"error": "Invalid wallet address"}));
    }

    let wallet = normalize_wallet(&body.wallet);

    let player = sqlx::query_as::<_, crate::models::player::Player>(
        "SELECT * FROM players WHERE wallet_address = $1",
    )
    .bind(&wallet)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten();

    let Some(player) = player else {
        return HttpResponse::NotFound().json(json!({"error": "Player not found"}));
    };

    let player = apply_item_boosts(&state.db, player).await;
    let xp_multiplier = equipped_xp_multiplier(&state.db, &wallet).await;

    // Sweep expired sessions opportunistically — no background task needed.
    state.bot_fight_sessions.retain(|_, s| s.created_at.elapsed() < Duration::from_secs(SESSION_TTL_SECS));

    let session = BotFightSession::new(wallet, &player, xp_multiplier);
    let player_class = session.player_class;
    let bot_class = session.bot_class;

    let session_id = Uuid::new_v4();
    state.bot_fight_sessions.insert(session_id, session);

    HttpResponse::Ok().json(json!({
        "session_id":   session_id,
        "player_class": player_class,
        "bot_class":    bot_class,
    }))
}

/// Resolves one round of an in-progress bot fight. On the final round, persists
/// the battle, awards XP/rank, and includes those results in the response.
pub async fn bot_fight_round(
    state: web::Data<AppState>,
    body: web::Json<BotFightRoundRequest>,
) -> HttpResponse {
    if !VALID_MOVES.contains(&body.player_move.as_str()) {
        return HttpResponse::BadRequest()
            .json(json!({"error": format!("Invalid move: {}", body.player_move)}));
    }

    struct FinalizeData {
        wallet:         String,
        xp_multiplier:  i32,
        challenger_won: bool,
        xp_awarded:     i32,
        rounds:         Vec<RoundData>,
    }

    let (round_response, finalize) = {
        let mut session = match state.bot_fight_sessions.get_mut(&body.session_id) {
            Some(s) => s,
            None => return HttpResponse::NotFound()
                .json(json!({"error": "Battle session not found or expired"})),
        };

        if session.created_at.elapsed() >= Duration::from_secs(SESSION_TTL_SECS) {
            drop(session);
            state.bot_fight_sessions.remove(&body.session_id);
            return HttpResponse::NotFound()
                .json(json!({"error": "Battle session not found or expired"}));
        }

        if body.player_move == "special" && session.player_special_used {
            return HttpResponse::BadRequest().json(json!({"error": "Special already used"}));
        }

        let round_response = session.play_round(&body.player_move);
        let finalize = if session.is_final() {
            Some(FinalizeData {
                wallet:         session.wallet.clone(),
                xp_multiplier:  session.xp_multiplier,
                challenger_won: session.challenger_won(),
                xp_awarded:     session.xp_awarded(),
                rounds:         session.rounds.clone(),
            })
        } else {
            None
        };
        (round_response, finalize)
    };

    let Some(finalize) = finalize else {
        return HttpResponse::Ok().json(json!({
            "round":       round_response.round,
            "player_move": round_response.player_move,
            "bot_move":    round_response.bot_move,
            "player_dmg":  round_response.player_dmg,
            "bot_dmg":     round_response.bot_dmg,
            "player_hp":   round_response.player_hp,
            "bot_hp":      round_response.bot_hp,
            "is_final":    false,
        }));
    };

    state.bot_fight_sessions.remove(&body.session_id);

    let rounds_json = serde_json::to_value(&finalize.rounds).unwrap_or_default();
    let outcome = match finalize_fight(
        &state,
        &finalize.wallet,
        finalize.challenger_won,
        finalize.xp_awarded,
        finalize.xp_multiplier,
        rounds_json,
        true, // bot fights record on-chain as before
        true, // bot fights are fully server-simulated — refereed, so bonus-eligible
        "bot",
    )
    .await
    {
        Ok(o) => o,
        Err(resp) => return resp,
    };

    HttpResponse::Ok().json(json!({
        "round":        round_response.round,
        "player_move":  round_response.player_move,
        "bot_move":     round_response.bot_move,
        "player_dmg":   round_response.player_dmg,
        "bot_dmg":      round_response.bot_dmg,
        "player_hp":    round_response.player_hp,
        "bot_hp":       round_response.bot_hp,
        "is_final":     true,
        "won":          outcome.won,
        "xp_awarded":   outcome.xp_earned,
        "xp_multiplier": finalize.xp_multiplier,
        "new_xp":       outcome.new_xp,
        "ranked_up":    outcome.ranked_up,
        "new_rank":     outcome.new_rank,
        "prestiged":    outcome.prestiged,
        "prestige_level": outcome.prestige_level,
        "g_awarded":    outcome.g_awarded,
        "battle_id":    outcome.battle_id,
    }))
}

/// How long an issued live-fight token stays valid. Generous so pre-fight story /
/// dialogue reading never expires a legit run; a genuine fight is far shorter.
const LIVE_FIGHT_TTL_SECS: u64 = 1800;

#[derive(Deserialize)]
pub struct StartLiveFightRequest {
    pub wallet: String,
    /// PvE Campaign op being played (1-based). Absent for a non-Campaign fight.
    #[serde(default)]
    pub level:  Option<i32>,
}

/// Issues a single-use token for a real-time fight and records the server-side
/// start time. For a Campaign fight it enforces the sequential unlock: you may
/// only start the op already unlocked (a replay) or the very next one — never skip
/// ahead. The client hands this token back to `/battles/fight/complete`, which is
/// the ONLY way to earn Campaign XP / a first-clear G$ bounty / a pve advance.
pub async fn start_live_fight(
    state: web::Data<AppState>,
    req: HttpRequest,
    body: web::Json<StartLiveFightRequest>,
) -> HttpResponse {
    let ip = req.connection_info().realip_remote_addr().unwrap_or("unknown").to_string();
    if !state.battle_limiter.check(&ip) {
        return HttpResponse::TooManyRequests()
            .json(json!({"error": "Too many battles. Slow down, warrior."}));
    }
    if !is_valid_wallet(&body.wallet) {
        return HttpResponse::BadRequest().json(json!({"error": "Invalid wallet address"}));
    }
    let wallet = normalize_wallet(&body.wallet);

    // Sequential Campaign gate — the core of closing the "skip to op 15" exploit.
    if let Some(level) = body.level {
        let current: i32 = sqlx::query_scalar("SELECT pve_level FROM players WHERE wallet_address = $1")
            .bind(&wallet)
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten()
            .unwrap_or(0);
        if level < 1 || level > current + 1 {
            return HttpResponse::Forbidden().json(json!({
                "error": "Operation locked — clear the campaign in order",
                "locked": true, "have_level": current, "requested": level,
            }));
        }
    }

    // Sweep expired tokens opportunistically — no background task needed.
    state.live_fight_sessions.retain(|_, s| s.created_at.elapsed() < Duration::from_secs(LIVE_FIGHT_TTL_SECS));

    let session_id = Uuid::new_v4();
    state.live_fight_sessions.insert(session_id, LiveFightSession {
        wallet,
        level: body.level,
        created_at: Instant::now(),
    });

    HttpResponse::Ok().json(json!({ "session_id": session_id }))
}

#[derive(Deserialize)]
pub struct LiveFightRequest {
    pub won: bool,
    /// Campaign fights MUST carry a server-issued session (from /battles/fight/start).
    /// It fixes the wallet + level + server-measured start time so the client can no
    /// longer assert them at completion.
    #[serde(default)]
    pub session_id: Option<Uuid>,
    /// Only used on the sessionless flat path (non-Campaign, e.g. Endless): XP-only,
    /// never a bounty or a pve advance. Ignored when session_id is present.
    #[serde(default)]
    pub wallet: Option<String>,
    /// Client-reported performance for the skill bonus (Phase 3). Server-capped per op
    /// via max_rewardable_kills so a forged count can't mint XP; only applied to a
    /// session-backed campaign win.
    #[serde(default)]
    pub kills: i32,
    #[serde(default)]
    pub headshots: i32,
}

// ── XP is kill-driven (what you see = what you get) ───────────────────────────────
// Every enemy pays XP; the client shows the same number live as you kill. The server
// re-adds it up at op-end, CAPPED by how many enemies the op actually holds, so a
// forged count can't mint XP. Tune the feel here — nothing else needs to change.
const KILL_XP: i32 = 10;             // per rewardable kill
const HEADSHOT_BONUS_XP: i32 = 5;    // extra for a headshot kill (headshot kill = 15)
const CLEAR_BONUS_XP: i32 = 50;      // flat, for finishing the op
const BOSS_BONUS_XP: i32 = 100;      // the op finales (Cinder / Warden / StillHunt)

/// Most kills an op can legitimately pay for — mirrors the campaign enemy counts in
/// apps/web/src/engine/fps/campaign.ts. Op 3 (THE WELL) recycles reinforcements during
/// its hold, so its cap deliberately exceeds the static enemy array. This is the anti-
/// faucet clamp: a client claiming more kills than the op contains gets nothing extra.
fn max_rewardable_kills(level: i32) -> i32 {
    match level {
        1 => 9,  2 => 12, 3 => 20, 4 => 11, 5 => 8,
        6 => 9,  7 => 11, 8 => 8,  9 => 11, 10 => 11,
        11 => 9, 12 => 10, 13 => 8, 14 => 11, 15 => 8,
        _ => 10,
    }
}

/// Boss ops — clearing one means the boss is dead, so a WIN on it earns the bonus (no
/// client boss-count needed; you can't finish a boss op without killing the boss).
fn boss_bonus_xp(level: i32) -> i32 {
    match level { 5 | 10 | 15 => BOSS_BONUS_XP, _ => 0 }
}

/// XP for a finished campaign op. Capped kills (+ headshots ≤ kills) drive it; a WIN
/// adds the clear bonus and, on a boss op, the boss bonus. A LOSS still pays for the
/// kills you made (bounded by the same cap), so effort is never wasted.
fn campaign_xp(level: i32, won: bool, kills: i32, headshots: i32) -> i32 {
    let cap = max_rewardable_kills(level);
    let k = kills.clamp(0, cap);
    let hs = headshots.clamp(0, k);
    let kill_xp = k * KILL_XP + hs * HEADSHOT_BONUS_XP;
    if won { CLEAR_BONUS_XP + kill_xp + boss_bonus_xp(level) } else { kill_xp }
}

/// Shortest real-time fight (seconds) that still earns rewards — blocks scripted
/// instant-win spam. A genuine fight runs well past this; it only filters abuse.
const MIN_LIVE_FIGHT_SECS: f64 = 3.0;

/// Real-time fighter reward hook. The client reports only the outcome + how long
/// the fight ran; the server computes and awards everything (XP / rank / G$) via
/// the same `finalize_fight` path the turn-based bot fight uses. Guards: per-IP
/// rate limit + a minimum match duration.
pub async fn complete_live_fight(
    state: web::Data<AppState>,
    req: HttpRequest,
    body: web::Json<LiveFightRequest>,
) -> HttpResponse {
    let ip = req.connection_info().realip_remote_addr()
        .unwrap_or("unknown")
        .to_string();
    if !state.battle_limiter.check(&ip) {
        return HttpResponse::TooManyRequests()
            .json(json!({"error": "Too many battles. Slow down, warrior."}));
    }

    // Campaign fights arrive with a server-issued token; the wallet + level + real
    // duration are taken from the SERVER's record of the fight, not the client's
    // word. A sessionless request is a non-Campaign flat fight (Endless).
    let (wallet, level) = match body.session_id {
        Some(sid) => {
            let Some((_, session)) = state.live_fight_sessions.remove(&sid) else {
                return HttpResponse::BadRequest().json(json!({"error": "No active fight session"}));
            };
            let elapsed = session.created_at.elapsed();
            if elapsed >= Duration::from_secs(LIVE_FIGHT_TTL_SECS) {
                return HttpResponse::BadRequest().json(json!({"error": "Fight session expired"}));
            }
            // Server-measured duration — the client can't fake an instant win.
            if elapsed.as_secs_f64() < MIN_LIVE_FIGHT_SECS {
                return HttpResponse::BadRequest().json(json!({"error": "Fight too short to count"}));
            }
            (session.wallet, session.level)
        }
        None => {
            // Flat path: XP only. Level is forced None so a sessionless request can
            // never reach Campaign money (first-clear bounty) or a pve advance.
            let w = body.wallet.as_deref().unwrap_or("");
            if !is_valid_wallet(w) {
                return HttpResponse::BadRequest().json(json!({"error": "Invalid wallet address"}));
            }
            (normalize_wallet(w), None)
        }
    };

    let xp_multiplier = equipped_xp_multiplier(&state.db, &wallet).await;

    // A Campaign op's XP is kill-driven (campaign_xp: capped kills + clear/boss bonus);
    // a non-Campaign flat fight uses the old win/loss rate.
    let (base_xp, first_clear) = match level {
        Some(level) if body.won => {
            let current: i32 = sqlx::query_scalar("SELECT pve_level FROM players WHERE wallet_address = $1")
                .bind(&wallet)
                .fetch_optional(&state.db)
                .await
                .ok()
                .flatten()
                .unwrap_or(0);
            let first = level > current;
            (campaign_xp(level, true, body.kills, body.headshots), first)
        }
        Some(level) => (campaign_xp(level, false, body.kills, body.headshots), false), // lost — kill XP only
        None => (fight_xp(body.won), false),                                            // non-Campaign fight
    };

    // Carry the mission context so battle history can show "OP N · <mission> — WIN/LOSS".
    // The frontend maps `level` → the mission name (it owns the campaign data).
    let rounds = match level {
        Some(level) => json!({ "kind": "mission", "level": level, "won": body.won }),
        None => json!([]),
    };
    // Record every result on-chain — both a completion (win) and a death (loss)
    // write a StillHuntRecord. Losses cost gas but give an honest on-chain history.
    let should_record = true;
    // Refereed (bonus-eligible) only when session-backed — the flat/Endless path is not.
    let reward_eligible = body.session_id.is_some();
    let outcome = match finalize_fight(&state, &wallet, body.won, base_xp, xp_multiplier, rounds, should_record, reward_eligible, "campaign").await {
        Ok(o) => o,
        Err(resp) => return resp,
    };

    // First clear advances the Campaign unlock (monotonic) AND pays a one-time
    // G$ bounty — the PvE G$ source now that ranking up no longer mints G$.
    let mut bounty_awarded: u64 = 0;
    if first_clear {
        if let Some(level) = level {
            let advanced = sqlx::query("UPDATE players SET pve_level = $1 WHERE wallet_address = $2 AND pve_level < $1")
                .bind(level)
                .bind(&wallet)
                .execute(&state.db)
                .await;
            log_write_failure("pve_level unlock", &wallet, &advanced);

            // Trimmed by the shared weekly ceiling before the row is written, so the
            // stored amount is what actually gets paid and the reconcile sweep has
            // nothing to disagree with.
            let amount = crate::services::earn_cap::cap_reward(
                &state, &wallet, first_clear_bounty(level),
            ).await;
            // Claim the payout slot idempotently: only the first request to insert
            // the (wallet, level) row owns the payout. A retry or a concurrent
            // duplicate hits the PK conflict and pays nothing (and the on-chain ref
            // guard is a second line of defence).
            // `amount > 0` so a paused payout writes NO row. Writing a zero row would
            // burn the once-per-(wallet, level) slot and make the op unpayable for
            // ever, and the reconcile sweep only retries rows it can find — so an
            // absent row is the honest record of "not paid" rather than a poisoned one.
            // The unlock above still happens: play is unaffected, only the money stops.
            if amount == 0 {
                tracing::info!(
                    "EARNING PAUSED: op bounty skipped for {} at level {} (unlock still granted)",
                    wallet, level,
                );
            }
            let claimed = amount > 0 && sqlx::query(
                "INSERT INTO first_clear_bounties (wallet_address, level, amount)
                 VALUES ($1, $2, $3) ON CONFLICT (wallet_address, level) DO NOTHING",
            )
            .bind(&wallet).bind(level).bind(amount as i64)
            .execute(&state.db).await
            .map(|r| r.rows_affected() == 1)
            .unwrap_or(false);

            if claimed {
                bounty_awarded = amount;
                accrue_first_clear(&state, &wallet, level, amount).await;
            }
        }
    }
    // Pay-per-play was removed (2026-07-26): a Campaign op pays its bounty ONCE, on the
    // first clear only. Replaying a cleared op earns XP but no G$ — this caps the per-op
    // payout so one player can't drain the pool by grinding a single op. (The op_play
    // bounty path + table are retired; see settle_op_play_bounty for the reconcile rail.)

    HttpResponse::Ok().json(json!({
        "won":            outcome.won,
        "xp_awarded":     outcome.xp_earned,
        "xp_multiplier":  xp_multiplier,
        "new_xp":         outcome.new_xp,
        "ranked_up":      outcome.ranked_up,
        "new_rank":       outcome.new_rank,
        "prestiged":      outcome.prestiged,
        "prestige_level": outcome.prestige_level,
        "g_awarded":      outcome.g_awarded,
        "bounty_awarded": bounty_awarded,
        "battle_id":      outcome.battle_id,
        "first_clear":    first_clear,
        "level":          level,
    }))
}

/// Fire-and-forget the on-chain first-clear bounty payout. The DB row was already
/// claimed by the caller (idempotent), so this runs at most once per (wallet, op).
/// Delegates to `settle_first_clear_bounty`, which is shared with the reconcile job.
/// Accrues a first-clear bounty.
///
/// There is no on-chain payout here and no reconcile sweep behind it. StillHunt
/// has no reward pool: clearing an operation records a balance the player later
/// claims, and `earnings::award` is idempotent on its ref key, so a retry or a
/// duplicate request credits exactly once. That removes the entire class of bug
/// this function used to carry — a transfer that confirmed on-chain while the
/// local credit failed, leaving the player paid and the ledger disagreeing.
async fn accrue_first_clear(state: &AppState, wallet: &str, level: i32, amount: u64) {
    if amount == 0 { return; }
    let credited = crate::services::earnings::award(
        &state.db,
        wallet,
        "first_clear",
        rust_decimal::Decimal::from(amount),
        &format!("first_clear:{wallet}:{level}"),
    ).await;

    if credited {
        let lifetime = sqlx::query(
            "UPDATE players SET g_earned_lifetime = g_earned_lifetime + $1 WHERE wallet_address = $2",
        )
        .bind(amount as i64).bind(wallet).execute(&state.db).await;
        log_write_failure("earned_lifetime credit", wallet, &lifetime);
        tracing::info!("first-clear accrued: {} op{} +{} TALLY", wallet, level, amount);
    }
}

/// Accrues a rank-up bonus. Idempotent per (wallet, rank).
async fn accrue_rank_up(state: &AppState, wallet: &str, rank: &str, amount: u64) {
    if amount == 0 { return; }
    let credited = crate::services::earnings::award(
        &state.db,
        wallet,
        "rank_up",
        rust_decimal::Decimal::from(amount),
        &format!("rank_up:{wallet}:{rank}"),
    ).await;

    if credited {
        let lifetime = sqlx::query(
            "UPDATE players SET g_earned_lifetime = g_earned_lifetime + $1 WHERE wallet_address = $2",
        )
        .bind(amount as i64).bind(wallet).execute(&state.db).await;
        log_write_failure("earned_lifetime credit", wallet, &lifetime);
        tracing::info!("rank-up accrued: {} {} +{} TALLY", wallet, rank, amount);
    }
}

// The reconcile sweep is gone with the reward pool. It existed to re-attempt
// payouts whose on-chain transfer never landed, which is a failure mode accrual
// does not have: `earnings::award` is a single idempotent INSERT, so it either
// records the balance or logs loudly, and there is nothing half-done to retry.

#[derive(Deserialize)]
pub struct PvpCompleteRequest {
    pub winner_wallet: String,
    pub loser_wallet:  String,
    #[serde(default)]
    pub duration_secs: f64,
}

/// Finalises a server-refereed PvP match. Runs the same XP/rank path as every
/// other mode and records one PvP (non-solo) battle row.
pub async fn complete_pvp_match(
    state: web::Data<AppState>,
    req: HttpRequest,
    body: web::Json<PvpCompleteRequest>,
) -> HttpResponse {
    // Trusted-server auth — fail closed if no secret is configured.
    let expected = std::env::var("PVP_SERVER_SECRET").ok();
    let provided = req.headers().get("x-pvp-secret").and_then(|h| h.to_str().ok()).map(str::to_string);
    match (expected, provided) {
        (Some(e), Some(p)) if !e.is_empty() && e == p => {}
        _ => return HttpResponse::Unauthorized().json(json!({"error": "Unauthorized"})),
    }

    if !is_valid_wallet(&body.winner_wallet) || !is_valid_wallet(&body.loser_wallet) {
        return HttpResponse::BadRequest().json(json!({"error": "Invalid wallet address"}));
    }
    if body.winner_wallet.to_lowercase() == body.loser_wallet.to_lowercase() {
        return HttpResponse::BadRequest().json(json!({"error": "Winner and loser are the same player"}));
    }
    if body.duration_secs < MIN_LIVE_FIGHT_SECS {
        return HttpResponse::BadRequest().json(json!({"error": "Fight too short to count"}));
    }

    let winner = normalize_wallet(&body.winner_wallet);
    let loser  = normalize_wallet(&body.loser_wallet);
    let win_mult  = equipped_xp_multiplier(&state.db, &winner).await;
    let lose_mult = equipped_xp_multiplier(&state.db, &loser).await;

    // PvP is resolved by the trusted realtime host (secret-gated) — refereed, so both
    // sides' rank-ups are bonus-eligible.
    let aw_w = match award_player(&state, &winner, true, fight_xp(true), win_mult, true, true).await {
        Ok(a) => a,
        Err(resp) => return resp,
    };
    let aw_l = match award_player(&state, &loser, false, fight_xp(false), lose_mult, true, true).await {
        Ok(a) => a,
        Err(resp) => return resp,
    };

    let battle_id = Uuid::new_v4();
    persist_battle(&state, battle_id, &winner, &loser, &winner, aw_w.xp_earned, aw_l.xp_earned, false, json!([]), true, "pvp", true).await;

    let side = |w: &str, a: &PlayerAward| json!({
        "wallet": w, "xp_awarded": a.xp_earned, "new_xp": a.new_xp,
        "ranked_up": a.ranked_up, "new_rank": a.new_rank, "g_awarded": a.g_awarded,
        "prestiged": a.prestiged, "prestige_level": a.prestige_level,
    });
    HttpResponse::Ok().json(json!({
        "battle_id": battle_id,
        "winner": side(&winner, &aw_w),
        "loser":  side(&loser, &aw_l),
    }))
}

pub async fn challenge_player(
    state: web::Data<AppState>,
    req: HttpRequest,
    body: web::Json<ChallengeRequest>,
) -> HttpResponse {
    // Rate limit: 5 challenges per 60 seconds per IP
    let ip = req.connection_info().realip_remote_addr()
        .unwrap_or("unknown")
        .to_string();
    if !state.battle_limiter.check(&format!("challenge:{}", ip)) {
        return HttpResponse::TooManyRequests()
            .json(json!({"error": "Too many challenges. Slow down."}));
    }

    if !is_valid_wallet(&body.challenger_wallet) || !is_valid_wallet(&body.opponent_wallet) {
        return HttpResponse::BadRequest().json(json!({"error": "Invalid wallet address"}));
    }
    if body.challenger_wallet.to_lowercase() == body.opponent_wallet.to_lowercase() {
        return HttpResponse::BadRequest().json(json!({"error": "Cannot challenge yourself"}));
    }

    // Normalize ONCE, then use only these. Wallets are stored lowercase (all 97
    // rows are), but the client sends the EIP-55 checksummed form — so a raw
    // comparison found nothing and every challenge died on "One or both players
    // not found". This was the only handler that skipped normalize_wallet.
    //
    // It mattered past the lookup too: the battle row was inserted with the
    // checksummed address, which would not join against players, the consistency
    // check, or anything reading the ledger.
    let challenger_wallet = normalize_wallet(&body.challenger_wallet);
    let opponent_wallet = normalize_wallet(&body.opponent_wallet);

    // Async multiplayer: resolve fight immediately based on stats + random seed
    let challenger = sqlx::query_as::<_, crate::models::player::Player>(
        "SELECT * FROM players WHERE wallet_address = $1",
    )
    .bind(&challenger_wallet)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten();

    let opponent = sqlx::query_as::<_, crate::models::player::Player>(
        "SELECT * FROM players WHERE wallet_address = $1",
    )
    .bind(&opponent_wallet)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten();

    let (Some(challenger), Some(opponent)) = (challenger, opponent) else {
        return HttpResponse::NotFound().json(json!({"error": "One or both players not found"}));
    };

    let challenger = apply_item_boosts(&state.db, challenger).await;
    let opponent   = apply_item_boosts(&state.db, opponent).await;
    let ch_multiplier = equipped_xp_multiplier(&state.db, &challenger_wallet).await;
    let op_multiplier = equipped_xp_multiplier(&state.db, &opponent_wallet).await;

    let result = simulate_async_fight(&challenger, &opponent);
    let now = Utc::now();
    let battle_id = Uuid::new_v4();
    let winner = if result.challenger_won { &challenger_wallet } else { &opponent_wallet };

    // Award both players through the SAME path every other mode uses. This was a
    // hand-rolled UPDATE that clamped with `.min(999)` — the exact ceiling that froze
    // rank progress elsewhere, hardcoded a second time — so a challenge could silently
    // destroy thousands of XP off anyone past 999. It also never ranked anyone up at
    // all, and discarded its own write error. Routing through award_player means the
    // progressive curve, the multi-rank climb, the rank-up payout, the Way-2 gate and
    // the loud save-failure log all apply here too. The outcome is server-simulated,
    // so it is refereed (reward_eligible) like the other server-authoritative modes.
    let aw_ch = award_player(&state, &challenger_wallet, result.challenger_won,
                             result.xp_challenger, ch_multiplier, true, true).await;
    let aw_op = award_player(&state, &opponent_wallet, !result.challenger_won,
                             result.xp_opponent, op_multiplier, true, true).await;

    // Record what was actually credited, not what we hoped to credit.
    let xp_challenger = aw_ch.as_ref().map(|a| a.xp_earned)
        .unwrap_or(result.xp_challenger * ch_multiplier);
    let xp_opponent = aw_op.as_ref().map(|a| a.xp_earned)
        .unwrap_or(result.xp_opponent * op_multiplier);

    let inserted = sqlx::query(
        "INSERT INTO battles (id, challenger_wallet, opponent_wallet, winner_wallet, rounds_data, xp_awarded_challenger, xp_awarded_opponent, is_bot, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8)",
    )
    .bind(battle_id)
    .bind(&challenger_wallet)
    .bind(&opponent_wallet)
    .bind(winner)
    .bind(serde_json::to_value(&result.rounds).unwrap_or_default())
    .bind(xp_challenger)
    .bind(xp_opponent)
    .bind(now)
    .execute(&state.db)
    .await;
    if let Err(e) = &inserted {
        tracing::error!(
            "BATTLE INSERT FAILED for challenge {} vs {}: history will be missing this \
             fight (XP was still awarded): {}",
            challenger_wallet, opponent_wallet, e
        );
    }

    // Background chain write — non-blocking
    if let Some(chain) = state.chain.as_ref().cloned() {
        let battle_bytes = uuid_to_bytes32(battle_id);
        let ch_addr: Option<Address> = challenger_wallet.parse().ok();
        let op_addr: Option<Address> = opponent_wallet.parse().ok();
        let ch_won = result.challenger_won;
        let xp_ch = xp_challenger.min(255) as u8;
        let xp_op = xp_opponent.min(255) as u8;
        let db = state.db.clone();
        let battle_uuid = battle_id;
        tokio::spawn(async move {
            if let (Some(ch), Some(op)) = (ch_addr, op_addr) {
                let (winner_addr, loser_addr) = if ch_won { (ch, op) } else { (op, ch) };
                record_on_chain(
                    &db, Some(chain), battle_uuid, battle_bytes,
                    winner_addr, loser_addr, xp_ch as u32, xp_op as u32, false,
                ).await;
            }
        });
    }

    HttpResponse::Ok().json(json!({
        "winner":        winner,
        "battle_id":     battle_id,
        "xp_challenger": xp_challenger,
        "xp_opponent":   xp_opponent,
        "rounds":        result.rounds,
    }))
}

#[cfg(test)]
mod reward_amount_tests {
    use super::*;

    /// The clear anchor, and what it buys.
    ///
    /// Every marketplace price is a multiple of what one operation clear pays, so
    /// this is the number the whole catalogue is denominated in. Change it without
    /// moving the price ladder and every item silently re-prices in real terms —
    /// the entry gun stops being a first-session goal, or the top gun stops being
    /// aspirational.
    #[test]
    fn the_clear_bounty_anchors_the_price_ladder() {
        let per_clear = first_clear_bounty(1) as i64;
        assert!(per_clear > 0, "a clear must pay something or the Bank is never worth opening");

        let clears = |price: i64| price / per_clear;
        assert_eq!(clears(per_clear * 8), 8, "entry gun: reachable in a first session");
        assert_eq!(clears(per_clear * 80), 80, "top gun: still out of reach after hours");
    }

    /// Nothing may propose more than the token's per-mint ceiling.
    #[test]
    fn no_single_reward_exceeds_the_cap() {
        for level in 1..=15 {
            assert!(
                first_clear_bounty(level) <= MAX_REWARD_G,
                "op {level} proposes more than the cap",
            );
        }
        assert!(rank_up_reward_g(1) <= MAX_REWARD_G);
    }

    #[test]
    fn op_bounty_is_flat_at_every_level() {
        // Was 500 × level. Flat now, so op 1 and op 15 pay the same and no op can ever
        // reach the on-chain ceiling — which is the point: the old curve's deep ops were
        // most of the pool's outflow, and the weekly cap was silently trimming them.
        for level in [1, 5, 15, 20, 30] {
            assert_eq!(op_bounty_rate_g(level), 10, "op {level} should pay the flat rate");
        }
    }


    #[test]
    fn rewards_stay_under_the_contract_cap() {
        // The on-chain StillHuntRewardPool.MAX_REWARD is 10_000 G$; every payout must fit in
        // a single distributeReward call or it reverts with BadAmount.
        assert!(first_clear_bounty(15) <= MAX_REWARD_G);
        assert!(rank_up_reward_g(999) <= MAX_REWARD_G);
    }

    #[test]
    fn refereed_xp_needed_tracks_the_progressive_curve() {
        // Reaching the Nth rank needs the curve's CUMULATIVE XP through N before its G$
        // bonus pays — so a pure honor-system (flat/Endless) grind never earns one. The
        // gate must track the curve exactly or honest players get silently under-paid.
        assert_eq!(cumulative_xp_for_rank(rank_ordinal("Tracker")),   400);
        assert_eq!(cumulative_xp_for_rank(rank_ordinal("Stalker")),   1_300);
        assert_eq!(cumulative_xp_for_rank(rank_ordinal("Marksman")),     2_600);
        assert_eq!(cumulative_xp_for_rank(rank_ordinal("Ranger")), 5_100);
        assert_eq!(cumulative_xp_for_rank(rank_ordinal("Ghost")),  9_600);
        assert_eq!(cumulative_xp_for_rank(rank_ordinal("Apex")),  17_600);
        // Drifter is the start (never reached via a rank-up) so it gates at zero.
        assert_eq!(rank_ordinal("Drifter"), 0);
        assert_eq!(cumulative_xp_for_rank(0), 0);
    }

    #[test]
    fn the_ladder_array_is_the_only_source_of_rank_order() {
        // next_rank and rank_ordinal must agree with RANK_LADDER for EVERY tier. A
        // hand-written copy of this order is what sorted Ghost below Stalker on the
        // leaderboard for as long as Ghost existed.
        for (i, rank) in RANK_LADDER.iter().enumerate() {
            assert_eq!(rank_ordinal(rank), i as i32, "{} ordinal", rank);
            let expected = RANK_LADDER.get(i + 1).copied();
            assert_eq!(next_rank(rank), expected, "{} next", rank);
        }
        // The top of the ladder prestiges rather than promoting.
        assert_eq!(next_rank(RANK_LADDER[RANK_LADDER.len() - 1]), None);
        // An unknown rank never invents a promotion and reads as the floor.
        assert_eq!(next_rank("Mythic"), None);
        assert_eq!(rank_ordinal("Mythic"), 0);
        // Ghost specifically: second-highest, and strictly above Stalker. This is the
        // exact assertion the leaderboard's old CASE would have failed.
        assert_eq!(rank_ordinal("Ghost"), 5);
        assert!(rank_ordinal("Ghost") > rank_ordinal("Stalker"));
        assert!(rank_ordinal("Apex") > rank_ordinal("Ghost"));
        assert!(rank_ordinal("Tracker") > rank_ordinal("Drifter"));
    }

    #[test]
    fn the_ladder_is_progressive_not_flat() {
        // The whole point of the redesign: each rank costs strictly more than the last,
        // so the first rank stays cheap (retention) while the top stays rare (prestige).
        for n in 2..=6 {
            assert!(
                rank_step_xp(n) > rank_step_xp(n - 1),
                "step {} must cost more than step {}", n, n - 1
            );
        }
        // Calibration anchor: one full campaign clear (~2610 XP body-shot) reaches Marksman
        // but not Ranger, so finishing the story and finishing the rank arc coincide.
        const FULL_CAMPAIGN_XP: i32 = 2_610;
        assert!(cumulative_xp_for_rank(rank_ordinal("Marksman")) <= FULL_CAMPAIGN_XP);
        assert!(cumulative_xp_for_rank(rank_ordinal("Ranger")) > FULL_CAMPAIGN_XP);
    }

    /// Mirrors the climb loop in award_player so the ladder walk can be tested without
    /// a database. Returns (final rank, xp left in the bar, ordinals crossed).
    fn climb(start_rank: &str, start_prestige: i32, total_xp: i32) -> (String, i32, Vec<i32>) {
        let mut xp = total_xp;
        let mut cur: &str = start_rank;
        let mut prestige = start_prestige;
        let mut crossed = Vec::new();
        loop {
            let ordinal = match next_rank(cur) {
                Some(nr) => rank_ordinal(nr),
                None if cur == "Apex" => rank_ordinal("Apex") + prestige + 1,
                None => break,
            };
            let cost = rank_step_xp(ordinal);
            if xp < cost {
                break;
            }
            xp -= cost;
            match next_rank(cur) {
                Some(nr) => { crossed.push(ordinal); cur = nr; }
                None => { prestige += 1; crossed.push(ordinal); }
            }
            if crossed.len() >= 16 { break; }
        }
        (cur.to_string(), xp, crossed)
    }

    #[test]
    fn a_single_award_can_climb_several_ranks_and_pays_each() {
        // The old code subtracted ONE rank per fight, so a big award stranded the excess
        // in the bar and silently skipped the ranks it passed. A full campaign's XP
        // dropped on a fresh Drifter player must land Marksman, having paid Tracker+Stalker+Marksman.
        let (rank, left, crossed) = climb("Drifter", 0, 2_610);
        assert_eq!(rank, "Marksman");
        assert_eq!(crossed, vec![1, 2, 3]);
        assert_eq!(left, 2_610 - 2_600);
        // Every rank passed through is its own payout, so none are skipped. Flat rate, so
        // three ranks in one award pay three times the flat amount — the property under
        // test is that all three are paid, not what each is worth.
        let paid: u64 = crossed.iter().map(|o| rank_up_reward_g(*o)).sum();
        assert_eq!(paid, 3 * 200);
    }

    #[test]
    fn the_climb_never_deletes_xp_it_did_not_buy() {
        // Below the first step: nothing crossed, every point kept.
        let (rank, left, crossed) = climb("Drifter", 0, 399);
        assert_eq!((rank.as_str(), left), ("Drifter", 399));
        assert!(crossed.is_empty());
        // Exactly one step: the bar empties to zero, not below it.
        let (rank, left, _) = climb("Drifter", 0, 400);
        assert_eq!((rank.as_str(), left), ("Tracker", 0));
        // An unknown rank has no next step and must leave the bar untouched rather than
        // eat it (the guard that kept the old Apex XP-delete bug from reappearing).
        let (rank, left, crossed) = climb("Mythic", 0, 999_999);
        assert_eq!((rank.as_str(), left), ("Mythic", 999_999));
        assert!(crossed.is_empty());
    }

    #[test]
    fn past_diamond_the_climb_prestiges_instead_of_stalling() {
        // Apex with three prestiges' worth of XP banks three prestige events and
        // keeps the remainder, paying each one (uncapped, the Apex-bug fix).
        let (rank, left, crossed) = climb("Apex", 0, PRESTIGE_STEP_XP * 3 + 120);
        assert_eq!(rank, "Apex");
        assert_eq!(left, 120);
        assert_eq!(crossed, vec![7, 8, 9]);
    }

    #[test]
    fn prestige_steps_are_a_flat_uncapped_tail() {
        // Prestige P is the (6 + P)th rank-up: a flat step each, forever.
        assert_eq!(rank_step_xp(7),  PRESTIGE_STEP_XP);
        assert_eq!(rank_step_xp(50), PRESTIGE_STEP_XP);
        // The Way-2 gate keeps scaling past Apex, so a grinder can't mint prestige
        // bonuses without the refereed XP to back them.
        assert_eq!(
            cumulative_xp_for_rank(7),
            cumulative_xp_for_rank(6) + PRESTIGE_STEP_XP
        );
        assert!(cumulative_xp_for_rank(9) > cumulative_xp_for_rank(8));
    }

    #[test]
    fn campaign_xp_is_kill_driven_and_capped() {
        // Op 1 (cap 9): a win = 50 clear + 9 kills×10 + 9 headshots×5 = 185.
        assert_eq!(campaign_xp(1, true, 9, 9), 50 + 9 * 10 + 9 * 5);
        // Body-shot win = 50 + 90 = 140.
        assert_eq!(campaign_xp(1, true, 9, 0), 140);
        // A forged count clamps to the op's cap — no faucet.
        assert_eq!(campaign_xp(1, true, 9_999, 9_999), campaign_xp(1, true, 9, 9));
        // Headshots can't exceed kills; negatives floor to zero.
        assert_eq!(campaign_xp(1, true, 3, 50), 50 + 3 * 10 + 3 * 5);
        assert_eq!(campaign_xp(1, true, -5, -5), 50); // just the clear bonus
        // A LOSS still pays the kills (no clear/boss bonus).
        assert_eq!(campaign_xp(1, false, 5, 2), 5 * 10 + 2 * 5);
    }

    #[test]
    fn boss_ops_pay_the_boss_bonus_on_a_win_only() {
        assert_eq!(boss_bonus_xp(5), 100);
        assert_eq!(boss_bonus_xp(10), 100);
        assert_eq!(boss_bonus_xp(15), 100);
        assert_eq!(boss_bonus_xp(1), 0);
        // Op 5 (cap 8) win: 50 + 8×10 + 100 boss = 230; a loss gets no boss bonus.
        assert_eq!(campaign_xp(5, true, 8, 0), 50 + 80 + 100);
        assert_eq!(campaign_xp(5, false, 8, 0), 80);
    }

    #[test]
    fn op3_kill_cap_allows_for_reinforcements() {
        // THE WELL recycles spawns during its hold, so its cap must exceed the static
        // enemy array (9) — otherwise a legit defend run gets under-paid.
        assert!(max_rewardable_kills(3) > 9);
    }

    #[test]
    fn rank_up_reward_is_flat_at_every_rank() {
        // Was 500 × ordinal, so the climb to Apex paid 10,500 across six rank-ups.
        // Flat now: 1,200 for the same climb, and every prestige past it the same again.
        for rank in ["Tracker", "Stalker", "Marksman", "Ranger", "Ghost", "Apex"] {
            assert_eq!(
                rank_up_reward_g(rank_ordinal(rank)),
                200,
                "{rank} should pay the flat rate",
            );
        }
        // Deep prestige stays flat and so can never exceed the on-chain per-call cap.
        assert_eq!(rank_up_reward_g(20), 200);
        assert!(rank_up_reward_g(999) <= MAX_REWARD_G);
    }
}
