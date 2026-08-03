use actix_web::{web, HttpResponse};
use ethers::types::U256;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::str::FromStr;

use crate::utils::normalize_wallet;
use crate::AppState;

/// Records one row in the ledger. Best-effort — a failed insert here must
/// never roll back or fail the caller's real on-chain/DB work that already
/// happened, so errors are logged and swallowed like the rest of this codebase's
/// background chain-write call sites.
///
/// `chain` is REQUIRED rather than defaulted. The column has a SQL default of
/// Celo so the ~731 historical rows backfill correctly, but relying on that
/// default for new writes is how an Avalanche payout ends up silently counted
/// as Celo volume. Making the compiler ask is cheap; auditing a mislabelled
/// ledger after the fact is not. See services::chain_id.
pub async fn insert_ledger_entry(
    db: &sqlx::PgPool,
    wallet: &str,
    category: &str,
    amount: Decimal,
    tx_hash: Option<&str>,
    counterparty: Option<&str>,
) {
    let result = sqlx::query(
        "INSERT INTO g_ledger (wallet_address, category, amount, tx_hash, counterparty, chain_id)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(wallet)
    .bind(category)
    .bind(amount)
    .bind(tx_hash)
    .bind(counterparty)
    .bind(crate::services::chain::CHAIN_ID as i32)
    .execute(db)
    .await;

    if let Err(e) = result {
        tracing::error!("Failed to record g_ledger entry ({} {} {}): {}", wallet, category, amount, e);
    }
}

// ── Withdrawal fee ─────────────────────────────────────────────────────────────
//
// A cut of every transfer-out. Unlike every other G$ sink in the app (shop spend,
// duel stakes, re-arm) this one does NOT go to the reward pool — it goes to a
// treasury address, so it leaves the reward economy entirely instead of being
// recycled back into payouts.
//
// The rate lives here rather than in an env var alone because an unset env var
// would silently mean "no fee", and a fee that quietly stops being charged is
// the kind of thing nobody notices for a month. The env vars override; the
// constants are the working default.

/// Withdrawal fee in basis points (2000 = 20%).
fn withdraw_fee_bps() -> u64 {
    std::env::var("WITHDRAW_FEE_BPS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(2000)
        .min(10_000)
}

/// Treasury address the withdrawal fee is paid to. NOT the reward pool.
const WITHDRAW_FEE_ADDRESS: &str = "0x84A3D9F71DcF0D05841cDBdEAE24a7A6e05A582D";

fn withdraw_fee_address() -> String {
    std::env::var("WITHDRAW_FEE_ADDRESS").unwrap_or_else(|_| WITHDRAW_FEE_ADDRESS.to_string())
}

/// Split a gross withdrawal into (net to destination, fee). Pure, so the policy
/// is testable and so the UI's preview and the chain call cannot disagree: both
/// derive from this one rule.
///
/// Rounds the fee DOWN, so rounding dust always favours the player.
fn split_fee(gross: U256, bps: u64) -> (U256, U256) {
    if bps == 0 {
        return (gross, U256::zero());
    }
    let fee = gross * U256::from(bps) / U256::from(10_000u64);
    (gross - fee, fee)
}


// ── GET /relay-address ─────────────────────────────────────────────────────────
// Public (addresses aren't secret) — the frontend needs this as the `spender`
// in the EIP-2612 permit it signs for a transfer-out.
pub async fn get_relay_address(state: web::Data<AppState>) -> HttpResponse {
    match state.chain.as_ref() {
        Some(chain) => HttpResponse::Ok().json(json!({ "address": format!("{:?}", chain.relay_address()) })),
        None => HttpResponse::ServiceUnavailable().json(json!({"error": "Chain relay not available"})),
    }
}


fn wei_to_g(amount: U256) -> Decimal {
    Decimal::from_str(&amount.to_string()).unwrap_or(Decimal::ZERO) / Decimal::from(10u64.pow(18))
}

// ── GET /players/:wallet/ledger-summary ───────────────────────────────────────
#[derive(Serialize)]
pub struct LedgerSummary {
    #[serde(with = "rust_decimal::serde::float")]
    pub ubi_earned: Decimal,
    #[serde(with = "rust_decimal::serde::float")]
    pub gameplay_earned: Decimal,
    #[serde(with = "rust_decimal::serde::float")]
    pub marketplace_spent: Decimal,
    #[serde(with = "rust_decimal::serde::float")]
    pub transferred_out: Decimal,
    /// G$ this player has earned but whose on-chain transfer hasn't settled yet.
    /// The ledger above only counts money that actually landed, so without this a
    /// player told "+500 G$" at rank-up sees nothing here until the payout confirms
    /// (and up to a reconcile sweep later, if the first attempt failed) — which reads
    /// as the game losing their money. Surfacing it as pending is the honest answer.
    #[serde(with = "rust_decimal::serde::float")]
    pub pending_payout: Decimal,
}

pub async fn get_ledger_summary(
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> HttpResponse {
    let wallet = normalize_wallet(&path.into_inner());

    let row: Option<(Decimal, Decimal, Decimal, Decimal)> = sqlx::query_as(
        "SELECT
            COALESCE(SUM(amount) FILTER (WHERE category = 'ubi_claim'), 0),
            COALESCE(SUM(amount) FILTER (WHERE category = 'battle_reward'), 0),
            COALESCE(SUM(amount) FILTER (WHERE category = 'marketplace_purchase'), 0),
            COALESCE(SUM(amount) FILTER (WHERE category = 'transfer_out'), 0)
         FROM g_ledger WHERE wallet_address = $1",
    )
    .bind(&wallet)
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None);

    let (ubi_earned, gameplay_earned, marketplace_spent, transferred_out) =
        row.unwrap_or((Decimal::ZERO, Decimal::ZERO, Decimal::ZERO, Decimal::ZERO));

    // Claimed-but-unsettled payouts from both rails. Anything not yet 'paid' is money
    // owed: 'pending' is in flight (or abandoned and awaiting the sweep), 'failed' is
    // waiting on a retry. Both are re-attempted until they land, so both are pending
    // from the player's point of view.
    let pending_payout: Decimal = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount), 0)::numeric FROM (
            SELECT amount FROM first_clear_bounties WHERE wallet_address = $1 AND status <> 'paid'
            UNION ALL
            SELECT amount FROM rank_up_rewards     WHERE wallet_address = $1 AND status <> 'paid'
         ) AS unsettled",
    )
    .bind(&wallet)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten()
    .unwrap_or(Decimal::ZERO);

    HttpResponse::Ok().json(LedgerSummary {
        ubi_earned,
        gameplay_earned,
        marketplace_spent,
        transferred_out,
        pending_payout,
    })
}

// ── POST /players/:wallet/daily-claim ─────────────────────────────────────────
// (body extension only — the claim-cooldown logic itself lives in players.rs::daily_claim)
#[derive(Deserialize)]
pub struct DailyClaimLedgerBody {
    pub amount: Option<String>,
    pub tx_hash: Option<String>,
}

pub async fn record_ubi_claim(db: &sqlx::PgPool, wallet: &str, body: &DailyClaimLedgerBody) {
    let Some(amount_str) = body.amount.as_deref() else { return };
    let Ok(amount) = Decimal::from_str(amount_str) else { return };
    if amount <= Decimal::ZERO {
        return;
    }
    // GoodDollar's UBI is a Celo protocol claim by definition — it exists nowhere else.
    insert_ledger_entry(db, wallet, "ubi_claim", amount, body.tx_hash.as_deref(), None).await;
}

// ── POST /players/:wallet/transfer ────────────────────────────────────────────
// Transfers G$ out to any destination wallet. The player signs an EIP-2612
// permit off-chain granting the backend's hot wallet a one-time allowance for
// the exact amount they signed; this endpoint just relays that permit +
// transferFrom on-chain (StillHunt never custodies G$ — see chain.rs::transfer_g_for).
#[derive(Deserialize)]
pub struct TransferRequest {
    pub to: String,
    pub amount_wei: String,
    pub deadline: u64,
    pub v: u8,
    pub r: String,
    pub s: String,
}


#[cfg(test)]
mod tests {
    use super::*;

    fn g(n: u64) -> U256 {
        U256::from(n) * U256::exp10(18)
    }

    #[test]
    fn twenty_percent_is_taken_from_the_gross() {
        let (net, fee) = split_fee(g(1_000), 2000);
        assert_eq!(net, g(800));
        assert_eq!(fee, g(200));
        assert_eq!(net + fee, g(1_000), "the split must never mint or burn G$");
    }

    #[test]
    fn zero_bps_disables_the_fee() {
        let (net, fee) = split_fee(g(1_000), 0);
        assert_eq!(net, g(1_000));
        assert!(fee.is_zero());
    }

    #[test]
    fn rounding_dust_favours_the_player() {
        // 3 wei at 20% is 0.6 wei of fee — floor it, so the player keeps the dust
        // and the two legs still sum to exactly what they signed for.
        let (net, fee) = split_fee(U256::from(3u64), 2000);
        assert_eq!(fee, U256::zero());
        assert_eq!(net, U256::from(3u64));
    }
}
