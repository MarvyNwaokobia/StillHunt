//! The Bank's claim counter: turn accrued balance into on-chain currency.
//!
//! Celo pays the moment you win. This is the other shape, for Avalanche: a player
//! accrues Scrip as they play, sees a balance, and claims it when they choose. See
//! `migrations/add_earnings_and_claims.sql` for why that shape is better, and
//! `services/earnings.rs` for the invariant it has to hold.
//!
//! THE ORDER OF OPERATIONS IS THE WHOLE DESIGN
//! -------------------------------------------
//! Claiming and paying are separate steps, and they happen in this order:
//!
//!   1. refuse early if the relay cannot pay gas  — before touching any balance
//!   2. open a claim, attaching the unclaimed rows to it, in ONE transaction
//!   3. mint on-chain
//!   4. settle (success) or fail (release the rows back)
//!
//! Step 1 exists because steps 2-4 are recoverable but noisy: without it, a relay
//! out of AVAX would attach a player's whole balance to a claim, fail to mint, and
//! release it again on every single attempt. The player sees their balance blink
//! to zero and back with no explanation.
//!
//! Step 4's failure path is the one that matters. A claim that attaches earnings
//! and then fails without releasing them leaves the money gone from the balance and
//! absent from the wallet at the same time — invisible in both places.

use actix_web::{web, HttpResponse};
use ethers::types::{Address, U256};
use rust_decimal::prelude::ToPrimitive;
use rust_decimal::Decimal;
use serde::Serialize;
use serde_json::json;
use std::str::FromStr;

use crate::services::chain_id::ChainId;
use crate::services::earnings;
use crate::utils::{is_valid_wallet, normalize_wallet};
use crate::AppState;

#[derive(Serialize)]
pub struct ClaimableResponse {
    /// Unclaimed balance, in whole currency units.
    pub balance: Decimal,
    /// What that balance is denominated in, for the UI to render.
    pub symbol: &'static str,
    pub chain_id: i32,
    /// False when there is nothing to claim, or when the payout rail is not
    /// configured or cannot pay. The UI disables the button rather than letting a
    /// player press something that is guaranteed to fail.
    pub claimable: bool,
    /// Why not, when `claimable` is false. Shown to the player, so it says what is
    /// actually wrong instead of blaming their wallet — the mistake that had us
    /// chasing signing bugs for hours when the real cause was an empty relay.
    pub reason: Option<String>,
}

// ── GET /players/{wallet}/claimable ───────────────────────────────────────────
/// What this player could claim right now.
///
/// Avalanche only. Celo is deliberately absent: the web edition auto-pays G$ on
/// every win and has no accrued balance to claim, and its rewards must stay G$ to
/// satisfy StillHunt's GoodDollar grant.
pub async fn get_claimable(state: web::Data<AppState>, path: web::Path<String>) -> HttpResponse {
    let wallet = normalize_wallet(&path.into_inner());
    if !is_valid_wallet(&wallet) {
        return HttpResponse::BadRequest().json(json!({"error": "Invalid wallet address"}));
    }

    let chain = ChainId::Avalanche;
    let balance = earnings::balance(&state.db, &wallet, chain).await;

    let (claimable, reason) = match state.avalanche.as_ref() {
        None => (false, Some("Scrip payouts are not enabled yet.".to_string())),
        Some(av) if !av.can_mint() => {
            (false, Some("Scrip payouts are not configured yet.".to_string()))
        }
        Some(av) if !av.relay_can_pay().await => (
            false,
            // Named honestly. This is our problem, not the player's, and telling
            // them to retry would be advice that cannot work.
            Some("Payouts are paused while we top up the payout wallet. Your balance is safe.".to_string()),
        ),
        Some(_) if balance <= Decimal::ZERO => (false, Some("Nothing to claim yet.".to_string())),
        Some(_) => (true, None),
    };

    HttpResponse::Ok().json(ClaimableResponse {
        balance,
        symbol: chain.currency_symbol(),
        chain_id: chain.as_i32(),
        claimable,
        reason,
    })
}

// ── POST /players/{wallet}/claim ──────────────────────────────────────────────
/// Claim the accrued balance, minting it on-chain.
///
/// Idempotent under concurrency without needing a lock of its own: `open_claim`
/// attaches rows inside a transaction filtering on `claim_id IS NULL`, so a second
/// request racing the first finds nothing to attach and returns "nothing to claim"
/// rather than paying twice.
pub async fn claim(state: web::Data<AppState>, path: web::Path<String>) -> HttpResponse {
    let wallet = normalize_wallet(&path.into_inner());
    if !is_valid_wallet(&wallet) {
        return HttpResponse::BadRequest().json(json!({"error": "Invalid wallet address"}));
    }

    let Some(av) = state.avalanche.as_ref().cloned() else {
        return HttpResponse::ServiceUnavailable()
            .json(json!({"error": "Scrip payouts are not enabled yet"}));
    };

    if !av.can_mint() {
        return HttpResponse::ServiceUnavailable()
            .json(json!({"error": "Scrip payouts are not configured yet"}));
    }

    // BEFORE opening a claim, not after. Attaching a balance to a claim we already
    // know cannot be paid just makes the player watch it vanish and reappear.
    if !av.relay_can_pay().await {
        tracing::error!(
            "{}: refusing claim for {} — Avalanche relay {:?} cannot pay gas",
            crate::services::chain::RELAY_OUT_OF_GAS,
            wallet,
            av.relay_address(),
        );
        return HttpResponse::ServiceUnavailable().json(json!({
            "error": "Payouts are paused while we top up the payout wallet. Your balance is safe."
        }));
    }

    let to: Address = match Address::from_str(&wallet) {
        Ok(a) => a,
        Err(_) => return HttpResponse::BadRequest().json(json!({"error": "Invalid wallet address"})),
    };

    let chain = ChainId::Avalanche;
    let Some(open) = earnings::open_claim(&state.db, &wallet, chain).await else {
        return HttpResponse::Ok().json(json!({
            "claimed": false,
            "reason": "Nothing to claim",
        }));
    };

    // From here the player's earnings are ATTACHED. Every path below must either
    // settle the claim or fail it; returning without doing one of those strands
    // their money.
    let Some(amount_wei) = to_wei(open.amount) else {
        earnings::fail_claim(&state.db, open.id, "amount could not be converted to wei").await;
        tracing::error!("claim {} for {}: bad amount {}", open.id, wallet, open.amount);
        return HttpResponse::InternalServerError()
            .json(json!({"error": "Could not process that amount — nothing was charged"}));
    };

    match av.mint_scrip(to, amount_wei).await {
        Ok(hash) => {
            let hash_str = format!("{:?}", hash);
            earnings::settle_claim(&state.db, open.id, &hash_str).await;

            // Mirror into the ledger so per-chain volume reporting sees it. Best
            // effort: the money has already moved, and a missing ledger row is a
            // reporting gap rather than a lost payout.
            crate::handlers::ledger::insert_ledger_entry(
                &state.db,
                &wallet,
                "claim",
                open.amount,
                Some(&hash_str),
                None,
                chain,
            )
            .await;

            tracing::info!("claim paid: {} +{} SCRP tx={}", wallet, open.amount, hash_str);
            HttpResponse::Ok().json(json!({
                "claimed":  true,
                "amount":   open.amount,
                "symbol":   chain.currency_symbol(),
                "tx_hash":  hash_str,
                "chain_id": chain.as_i32(),
            }))
        }
        Err(e) => {
            earnings::fail_claim(&state.db, open.id, &e).await;
            tracing::error!("claim {} for {} failed: {}", open.id, wallet, e);
            HttpResponse::BadGateway().json(json!({
                "error": "The payout did not go through. Your balance is unchanged — try again shortly."
            }))
        }
    }
}

/// Whole currency units to 18-decimal wei.
///
/// `None` rather than a panic or a silent zero on anything that does not convert.
/// A zero here would settle a claim by minting nothing, which reads as success on
/// both sides and quietly destroys the balance.
fn to_wei(amount: Decimal) -> Option<U256> {
    if amount <= Decimal::ZERO {
        return None;
    }
    // Via string rather than f64: a float round-trip on a large balance loses
    // precision in exactly the digits that represent real money.
    let scaled = (amount * Decimal::from(1_000_000_000_000_000_000u64)).trunc();
    U256::from_dec_str(&scaled.to_string()).ok().filter(|w| !w.is_zero())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn whole_units_scale_to_wei() {
        assert_eq!(to_wei(Decimal::from(1)), Some(U256::from(1_000_000_000_000_000_000u64)));
        assert_eq!(
            to_wei(Decimal::from(8000)),
            U256::from_dec_str("8000000000000000000000").ok()
        );
    }

    #[test]
    fn fractional_units_survive_the_conversion() {
        // NUMERIC(20,8) allows eight decimal places, and they must not be lost:
        // truncating 0.5 to 0 would mint nothing while marking the claim paid.
        assert_eq!(
            to_wei(Decimal::new(5, 1)), // 0.5
            U256::from_dec_str("500000000000000000").ok()
        );
    }

    #[test]
    fn nothing_claimable_converts_to_nothing() {
        // Each of these must refuse rather than produce a zero mint, which would
        // settle a claim having moved no money.
        assert_eq!(to_wei(Decimal::ZERO), None);
        assert_eq!(to_wei(Decimal::from(-5)), None);
        // Smaller than one wei: truncates to zero, so it must be refused too.
        assert_eq!(to_wei(Decimal::new(1, 20)), None);
    }
}
