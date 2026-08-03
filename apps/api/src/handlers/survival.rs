use actix_web::{web, HttpRequest, HttpResponse};
use ethers::types::U256;
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
// Kept so existing clients keep working, but there is nothing to arm.
//
// Re-arming used to spend real currency out of the player's wallet, so it needed
// a session allowance: one EIP-2612 permit signed at the pre-run screen, then
// many gasless spends against it. TALLY accrues as a balance we already hold, so
// a re-arm is a debit — no signature, no allowance, no gas, and nothing that can
// expire mid-run.
#[derive(Deserialize)]
pub struct ArmRequest {
    pub wallet: String,
    #[serde(default)]
    pub cap_g:  u64,
}

pub async fn arm_session(state: web::Data<AppState>, body: web::Json<ArmRequest>) -> HttpResponse {
    if !is_valid_wallet(&body.wallet) {
        return HttpResponse::BadRequest().json(json!({"error": "Invalid wallet address"}));
    }
    let wallet = normalize_wallet(&body.wallet);
    let balance = crate::services::earnings::balance(&state.db, &wallet).await;
    HttpResponse::Ok().json(json!({
        "armed":     true,
        "balance":   balance,
        "signature": false,
    }))
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

    // One debit, idempotent on the client's ref. The check and the write share a
    // transaction, so two re-arms racing cannot both spend the same TALLY.
    match crate::services::earnings::spend(
        &state.db,
        &wallet,
        &format!("rearm_{}", body.action),
        rust_decimal::Decimal::from(cost),
        &body.ref_id,
    ).await {
        Ok(_) => {
            let _ = sqlx::query(
                "INSERT INTO survival_rearms (wallet_address, ref, action, wave, cost_g, status)
                 VALUES ($1, $2, $3, $4, $5, 'paid')
                 ON CONFLICT (wallet_address, ref) DO NOTHING",
            )
            .bind(&wallet).bind(&body.ref_id).bind(&body.action)
            .bind(body.wave).bind(cost as i64)
            .execute(&state.db).await;

            let remaining = crate::services::earnings::balance(&state.db, &wallet).await;
            tracing::info!("re-arm: {} spent {} TALLY on {}", wallet, cost, body.action);
            HttpResponse::Ok().json(json!({
                "ok": true, "action": body.action, "cost": cost, "balance": remaining,
            }))
        }
        Err(crate::services::earnings::SpendError::Insufficient(have)) => {
            HttpResponse::PaymentRequired().json(json!({
                "error": "Not enough TALLY for that re-arm",
                "cost": cost, "balance": have,
            }))
        }
        Err(_) => HttpResponse::InternalServerError()
            .json(json!({"error": "Could not process that re-arm — nothing was charged"})),
    }
}
