use actix_web::{web, HttpRequest, HttpResponse};
use ethers::types::{Address, U256};
use serde::Deserialize;
use serde_json::json;

use crate::AppState;
use crate::utils::{is_valid_wallet, normalize_wallet};

// Whole-G$ ceiling a player may authorize for one run's re-arms. A cap, not a
// charge — nothing beyond what they actually spend is ever taken.
const MAX_ARM_CAP: u64 = 50;

/// Server-authoritative re-arm pricing (whole G$). Reviving deeper into a run
/// costs more (you're saving a bigger streak); restock is a flat top-up; a wave
/// skip scales gently. Returns `None` for an unknown action.
fn rearm_cost(action: &str, wave: i32) -> Option<u64> {
    let w = wave.max(0) as u64;
    match action {
        "revive"   => Some((3 + w / 2).min(15)),
        "restock"  => Some(2),
        "waveskip" => Some((3 + w / 3).min(12)),
        _ => None,
    }
}

fn g_wei(whole: u64) -> U256 {
    U256::from(whole) * U256::exp10(18)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_action_has_no_price() {
        assert_eq!(rearm_cost("nuke", 3), None);
        assert_eq!(rearm_cost("", 0), None);
    }

    #[test]
    fn revive_scales_with_wave_and_caps() {
        assert_eq!(rearm_cost("revive", 0), Some(3));   // base
        assert_eq!(rearm_cost("revive", 4), Some(5));   // 3 + 4/2
        assert_eq!(rearm_cost("revive", 100), Some(15)); // capped
    }

    #[test]
    fn restock_is_flat_and_waveskip_scales() {
        assert_eq!(rearm_cost("restock", 0), Some(2));
        assert_eq!(rearm_cost("restock", 99), Some(2));
        assert_eq!(rearm_cost("waveskip", 0), Some(3));
        assert_eq!(rearm_cost("waveskip", 99), Some(12)); // capped
    }

    #[test]
    fn negative_wave_is_floored_to_zero() {
        assert_eq!(rearm_cost("revive", -5), Some(3));
    }
}

// ── POST /survival/arm ─────────────────────────────────────────────────────────
// Step 1 of the session-allowance sink. The player signs ONE EIP-2612 permit at
// the pre-run screen granting this backend wallet an allowance of `cap_g` G$; every
// re-arm during the run then spends against it with no further signature.
#[derive(Deserialize)]
pub struct ArmRequest {
    pub wallet:   String,
    pub cap_g:    u64,
    pub deadline: u64,
    pub v:        u8,
    pub r:        String,
    pub s:        String,
}

pub async fn arm_session(state: web::Data<AppState>, body: web::Json<ArmRequest>) -> HttpResponse {
    if !is_valid_wallet(&body.wallet) {
        return HttpResponse::BadRequest().json(json!({"error": "Invalid wallet address"}));
    }
    if body.cap_g == 0 || body.cap_g > MAX_ARM_CAP {
        return HttpResponse::BadRequest()
            .json(json!({"error": format!("Arm cap must be between 1 and {} G$", MAX_ARM_CAP)}));
    }
    // Reject an expired permit BEFORE touching the chain — otherwise the on-chain
    // ERC20Permit reverts with "expired deadline" and we waste gas on a doomed tx.
    let now = chrono::Utc::now().timestamp().max(0) as u64;
    if body.deadline <= now {
        return HttpResponse::BadRequest().json(json!({"error": "Signature deadline expired — try again"}));
    }

    let wallet = normalize_wallet(&body.wallet);
    let chain = match state.chain.as_ref() {
        Some(c) => c,
        None => return HttpResponse::ServiceUnavailable().json(json!({"error": "Chain relay not available"})),
    };
    let owner: Address = match wallet.parse() {
        Ok(a) => a,
        Err(_) => return HttpResponse::BadRequest().json(json!({"error": "Invalid wallet address"})),
    };

    match chain.set_rearm_allowance(owner, g_wei(body.cap_g), body.deadline, body.v, &body.r, &body.s).await {
        Ok(hash) => HttpResponse::Ok().json(json!({
            "armed":   true,
            "cap_g":   body.cap_g,
            "tx_hash": format!("{:?}", hash),
        })),
        Err(e) => {
            tracing::warn!("survival arm failed for {}: {}", wallet, e);
            let msg = if e.contains("permit") { "Signature expired or invalid — try again".to_string() } else { e };
            HttpResponse::BadRequest().json(json!({"error": msg}))
        }
    }
}

// ── POST /survival/rearm ───────────────────────────────────────────────────────
// A single re-arm (revive / restock / waveskip). Debits G$ from the player's
// pre-authorized allowance into the RewardPool sink. Idempotent on the client-chosen
// `ref` so a retry never double-charges; broadcast-only spend so it feels instant.
#[derive(Deserialize)]
pub struct RearmRequest {
    pub wallet: String,
    pub action: String,
    #[serde(default)]
    pub wave:   i32,
    pub ref_id: String,
}

pub async fn rearm(state: web::Data<AppState>, req: HttpRequest, body: web::Json<RearmRequest>) -> HttpResponse {
    let ip = req.connection_info().realip_remote_addr().unwrap_or("unknown").to_string();
    if !state.battle_limiter.check(&ip) {
        return HttpResponse::TooManyRequests().json(json!({"error": "Too many re-arms. Slow down."}));
    }
    if !is_valid_wallet(&body.wallet) {
        return HttpResponse::BadRequest().json(json!({"error": "Invalid wallet address"}));
    }
    if body.ref_id.is_empty() || body.ref_id.len() > 100 {
        return HttpResponse::BadRequest().json(json!({"error": "Invalid ref"}));
    }
    let cost = match rearm_cost(&body.action, body.wave) {
        Some(c) => c,
        None => return HttpResponse::BadRequest().json(json!({"error": "Unknown re-arm action"})),
    };

    let wallet = normalize_wallet(&body.wallet);
    let chain = match state.chain.as_ref() {
        Some(c) => c,
        None => return HttpResponse::ServiceUnavailable().json(json!({"error": "Chain relay not available"})),
    };
    let owner: Address = match wallet.parse() {
        Ok(a) => a,
        Err(_) => return HttpResponse::BadRequest().json(json!({"error": "Invalid wallet address"})),
    };
    let pool = match chain.reward_pool_address() {
        Some(a) => a,
        None => return HttpResponse::ServiceUnavailable().json(json!({"error": "Re-arm sink not configured"})),
    };

    let need = g_wei(cost);

    // Gate on the LIVE on-chain allowance + balance before charging. Insufficient
    // allowance means their session cap is used up → the client re-arms the session.
    let allowance = chain.g_allowance(owner).await.unwrap_or_else(|_| U256::zero());
    if allowance < need {
        return HttpResponse::PaymentRequired().json(json!({
            "error": "Session allowance used up — arm more G$ to keep re-arming",
            "need_arm": true, "cost_g": cost,
        }));
    }
    let balance = chain.g_balance(owner).await.unwrap_or_else(|_| U256::zero());
    if balance < need {
        return HttpResponse::PaymentRequired().json(json!({
            "error": "Not enough G$ for this re-arm", "cost_g": cost,
        }));
    }

    // Claim the payout slot idempotently — only the first request for this ref
    // proceeds; a retry/duplicate replays the recorded outcome.
    let claimed = sqlx::query(
        "INSERT INTO survival_rearms (wallet_address, ref, action, amount, wave)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (wallet_address, ref) DO NOTHING",
    )
    .bind(&wallet).bind(&body.ref_id).bind(&body.action).bind(cost as i64).bind(body.wave)
    .execute(&state.db).await
    .map(|r| r.rows_affected() == 1)
    .unwrap_or(false);

    if !claimed {
        // Duplicate ref — return the existing row's outcome so the client is consistent.
        let row: Option<(String, Option<String>, i64)> = sqlx::query_as(
            "SELECT status, tx_hash, amount FROM survival_rearms WHERE wallet_address = $1 AND ref = $2",
        )
        .bind(&wallet).bind(&body.ref_id)
        .fetch_optional(&state.db).await.ok().flatten();
        return match row {
            Some((status, tx, amt)) if status == "paid" => HttpResponse::Ok().json(json!({
                "ok": true, "action": body.action, "cost_g": amt, "tx_hash": tx, "replay": true,
            })),
            _ => HttpResponse::Conflict().json(json!({"error": "Re-arm already in progress — use a fresh ref"})),
        };
    }

    match chain.spend_rearm(owner, pool, need).await {
        Ok(hash) => {
            let tx_hash = format!("{:?}", hash);
            let _ = sqlx::query("UPDATE survival_rearms SET status = 'paid', tx_hash = $1 WHERE wallet_address = $2 AND ref = $3")
                .bind(&tx_hash).bind(&wallet).bind(&body.ref_id).execute(&state.db).await;
            crate::handlers::ledger::insert_ledger_entry(
                &state.db, &wallet, "survival_rearm", rust_decimal::Decimal::from(cost), Some(&tx_hash), None,
                crate::services::chain_id::ChainId::Celo,
            ).await;
            tracing::info!("survival re-arm: {} {} wave{} -{} G$", wallet, body.action, body.wave, cost);
            let remaining = ((allowance - need) / U256::exp10(18)).as_u64();
            HttpResponse::Ok().json(json!({
                "ok": true, "action": body.action, "cost_g": cost,
                "tx_hash": tx_hash, "remaining_allowance_g": remaining,
            }))
        }
        Err(e) => {
            tracing::warn!("survival re-arm spend failed for {} {}: {}", wallet, body.action, e);
            let _ = sqlx::query("UPDATE survival_rearms SET status = 'failed' WHERE wallet_address = $1 AND ref = $2")
                .bind(&wallet).bind(&body.ref_id).execute(&state.db).await;
            HttpResponse::BadGateway().json(json!({"error": "Re-arm payment failed — try again"}))
        }
    }
}
