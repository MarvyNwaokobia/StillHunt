use actix_web::{web, HttpResponse};
use ethers::types::{Address, U256};
use serde_json::json;

use crate::utils::normalize_wallet;
use crate::AppState;

// The GoodDollar claim needs ≥ 0.01 CELO on hand (mirrors MIN_CELO_FOR_CLAIM in the
// web app). We only ever drip when a wallet is under this.
const MIN_CELO_WEI: u128 = 10_000_000_000_000_000; // 0.01 CELO
// What we send when we do drip — a touch above the threshold so the claim clears and
// there's headroom for a few more days of claims before another top-up is needed.
const DRIP_WEI: u128 = 20_000_000_000_000_000; // 0.02 CELO

// ── POST /players/{wallet}/gas-topup ──────────────────────────────────────────
// Fallback gas faucet: if a real player's Magic wallet can't afford its UBI claim
// (GoodDollar's own faucet didn't come through), the relay drips a little CELO so
// they can pay their own gas. Guards against farming: the wallet must be a known
// player, must actually be under the claim threshold, and is rate-limited to one
// drip per 20h. The relay pays the (tiny) CELO.
pub async fn gas_topup(state: web::Data<AppState>, path: web::Path<String>) -> HttpResponse {
    let wallet = normalize_wallet(&path.into_inner());
    let addr: Address = match wallet.parse() {
        Ok(a) => a,
        Err(_) => return HttpResponse::BadRequest().json(json!({"error": "Invalid wallet address"})),
    };

    // Anti-farm: only ever drip to a wallet that's an onboarded player.
    let is_player: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM players WHERE wallet_address = $1)",
    )
    .bind(&wallet)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);
    if !is_player {
        return HttpResponse::NotFound().json(json!({"error": "Unknown player"}));
    }

    let chain = match state.chain.as_ref() {
        Some(c) => c,
        None => return HttpResponse::ServiceUnavailable().json(json!({"error": "Chain relay not available"})),
    };

    // Only drip if the wallet is actually short on gas — a funded wallet needs nothing.
    let min_celo = U256::from(MIN_CELO_WEI);
    match chain.celo_balance(addr).await {
        Ok(bal) if bal >= min_celo => {
            return HttpResponse::Ok().json(json!({"funded": false, "reason": "wallet already has gas"}));
        }
        Ok(_) => {}
        Err(e) => {
            tracing::warn!("gas-topup: CELO balance read failed for {}: {}", wallet, e);
            return HttpResponse::ServiceUnavailable().json(json!({"error": "Could not read balance"}));
        }
    }

    // Claim the rate-limit slot atomically: a fresh row, or an existing one whose last
    // drip was > 20h ago, wins; a recent drip loses (returns no row) → rate-limited.
    let drip = rust_decimal::Decimal::from(DRIP_WEI);
    let claimed: Option<(i32,)> = sqlx::query_as(
        "INSERT INTO gas_topups (wallet_address, last_topup_at, total_wei, topup_count)
         VALUES ($1, now(), $2, 1)
         ON CONFLICT (wallet_address) DO UPDATE
           SET last_topup_at = now(),
               total_wei     = gas_topups.total_wei + $2,
               topup_count   = gas_topups.topup_count + 1
         WHERE gas_topups.last_topup_at < now() - interval '20 hours'
         RETURNING topup_count",
    )
    .bind(&wallet)
    .bind(drip)
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None);

    if claimed.is_none() {
        return HttpResponse::TooManyRequests()
            .json(json!({"funded": false, "reason": "already topped up recently"}));
    }

    // Send the drip. If it fails, release the slot so the player can retry immediately
    // rather than being locked out for 20h behind a failed send.
    match chain.send_celo(addr, U256::from(DRIP_WEI)).await {
        Ok(hash) => {
            let hash_str = format!("{:?}", hash);
            tracing::info!("gas-topup: dripped {} wei CELO to {} (tx {})", DRIP_WEI, wallet, hash_str);
            HttpResponse::Ok().json(json!({"funded": true, "tx_hash": hash_str}))
        }
        Err(e) => {
            let _ = sqlx::query(
                "UPDATE gas_topups
                    SET last_topup_at = now() - interval '20 hours',
                        total_wei   = GREATEST(0, gas_topups.total_wei - $2),
                        topup_count = GREATEST(0, gas_topups.topup_count - 1)
                  WHERE wallet_address = $1",
            )
            .bind(&wallet)
            .bind(drip)
            .execute(&state.db)
            .await;
            tracing::warn!("gas-topup: drip to {} failed: {}", wallet, e);
            HttpResponse::BadGateway().json(json!({"error": "Gas top-up failed, please try again"}))
        }
    }
}
