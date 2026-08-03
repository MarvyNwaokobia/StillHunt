use actix_web::{web, HttpResponse};
use ethers::types::{Address, U256};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::utils::normalize_wallet;
use crate::AppState;

// Wei per whole G$ (18 decimals). Used to turn a G$ debt into the on-chain amount.
const G_WEI: u64 = 1_000_000_000_000_000_000;

#[derive(Serialize)]
pub struct DebtResponse {
    #[serde(with = "rust_decimal::serde::float")]
    pub owed: Decimal,
    pub reason: Option<String>,
}

// ── GET /players/{wallet}/debt ────────────────────────────────────────────────
// The player's outstanding marketplace balance (sum of 'owed' rows). 0 = nothing due.
pub async fn get_debt(state: web::Data<AppState>, path: web::Path<String>) -> HttpResponse {
    let wallet = normalize_wallet(&path.into_inner());

    let owed: Decimal = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount), 0)::numeric FROM marketplace_debts
         WHERE wallet_address = $1 AND status = 'owed'",
    )
    .bind(&wallet)
    .fetch_one(&state.db)
    .await
    .unwrap_or(Decimal::ZERO);

    let reason: Option<String> = sqlx::query_scalar(
        "SELECT reason FROM marketplace_debts
         WHERE wallet_address = $1 AND status = 'owed' ORDER BY created_at LIMIT 1",
    )
    .bind(&wallet)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten();

    HttpResponse::Ok().json(DebtResponse { owed, reason })
}

#[derive(Deserialize)]
pub struct SettleRequest {
    // The permit is signed for exactly the outstanding balance in G$ wei; the server
    // re-derives that value and rejects any mismatch, so a client can never underpay.
    pub amount_wei: String,
    pub deadline: u64,
    pub v: u8,
    pub r: String,
    pub s: String,
}

// ── POST /players/{wallet}/settle-debt ────────────────────────────────────────
// Settle the outstanding balance: the player signed an EIP-2612 G$ permit granting
// the relay wallet an allowance for the owed amount; this relays transferFrom(player
// → reward pool), then marks the debt settled and records the real marketplace spend.
pub async fn settle_debt(
    state: web::Data<AppState>,
    path: web::Path<String>,
    body: web::Json<SettleRequest>,
) -> HttpResponse {
    let wallet = normalize_wallet(&path.into_inner());
    let from: Address = match wallet.parse() {
        Ok(a) => a,
        Err(_) => return HttpResponse::BadRequest().json(json!({"error": "Invalid wallet address"})),
    };

    // Server-authoritative owed amount — the client's signed value must match this.
    let owed: Decimal = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount), 0)::numeric FROM marketplace_debts
         WHERE wallet_address = $1 AND status = 'owed'",
    )
    .bind(&wallet)
    .fetch_one(&state.db)
    .await
    .unwrap_or(Decimal::ZERO);

    if owed <= Decimal::ZERO {
        return HttpResponse::BadRequest().json(json!({"error": "Nothing to settle"}));
    }

    // Expected on-chain amount = owed × 1e18 (integer-valued for our ≤8-dp amounts).
    let owed_wei_str = (owed * Decimal::from(G_WEI)).trunc().to_string();
    let owed_wei = match U256::from_dec_str(&owed_wei_str) {
        Ok(w) => w,
        Err(_) => return HttpResponse::InternalServerError().json(json!({"error": "Amount conversion failed"})),
    };
    let signed: U256 = match U256::from_dec_str(&body.amount_wei) {
        Ok(a) => a,
        Err(_) => return HttpResponse::BadRequest().json(json!({"error": "Invalid amount"})),
    };
    if signed != owed_wei {
        return HttpResponse::BadRequest()
            .json(json!({"error": "Signed amount must equal the outstanding balance"}));
    }

    let chain = match state.chain.as_ref() {
        Some(c) => c,
        None => return HttpResponse::ServiceUnavailable().json(json!({"error": "Chain relay not available"})),
    };
    let pool = match chain.reward_pool_address() {
        Some(p) => p,
        None => return HttpResponse::ServiceUnavailable().json(json!({"error": "Reward pool not configured"})),
    };

    // Move the G$: player → reward pool (recirculates as prize money).
    let hash = match chain
        .transfer_g_for(from, pool, owed_wei, body.deadline, body.v, &body.r, &body.s)
        .await
    {
        Ok(h) => h,
        Err(e) => {
            tracing::warn!("settle-debt transfer failed for {}: {}", wallet, e);
            return HttpResponse::BadRequest().json(json!({"error": e}));
        }
    };
    let hash_str = format!("{:?}", hash);

    // The G$ moved — clear the debt and record the real spend. Both are best-effort
    // after the confirmed transfer (mirrors the rest of the codebase's post-tx writes).
    let updated = sqlx::query(
        "UPDATE marketplace_debts
            SET status = 'settled', settled_at = now(), tx_hash = $2
          WHERE wallet_address = $1 AND status = 'owed'",
    )
    .bind(&wallet)
    .bind(&hash_str)
    .execute(&state.db)
    .await;
    if let Err(e) = updated {
        tracing::error!("settle-debt: transfer {} confirmed but debt not cleared for {}: {}", hash_str, wallet, e);
    }

    crate::handlers::ledger::insert_ledger_entry(
        &state.db, &wallet, "marketplace_purchase", owed, Some(&hash_str), None,
    )
    .await;

    tracing::info!("Debt settled: wallet={} amount={} G$ tx={}", wallet, owed, hash_str);

    HttpResponse::Ok().json(json!({
        "success": true,
        "tx_hash": hash_str,
        "settled_g": owed.to_string(),
    }))
}
