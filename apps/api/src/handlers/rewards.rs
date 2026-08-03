use actix_web::{web, HttpResponse};
use ethers::types::{Address, U256};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::AppState;
use crate::services::rewards::APP_DESCRIPTION;

#[derive(Deserialize)]
pub struct SignClaimRequest {
    pub user: String,
}

#[derive(Serialize)]
pub struct SignClaimResponse {
    pub app_address: String,
    pub app_signature: String,
    pub valid_until_block: u64,
    pub description: String,
}

pub async fn sign_engagement_claim(
    state: web::Data<AppState>,
    body: web::Json<SignClaimRequest>,
) -> HttpResponse {
    let rewards = match &state.rewards {
        Some(r) => r,
        None => {
            return HttpResponse::ServiceUnavailable()
                .json(json!({"error": "Reward service not configured — set BACKEND_PRIVATE_KEY"}))
        }
    };

    let user: Address = match body.user.parse() {
        Ok(a) => a,
        Err(_) => {
            return HttpResponse::BadRequest()
                .json(json!({"error": "Invalid user address"}))
        }
    };

    let current_block = match rewards.get_current_block().await {
        Ok(b) => b,
        Err(e) => {
            tracing::error!("Failed to get Celo block number: {}", e);
            return HttpResponse::InternalServerError()
                .json(json!({"error": "Could not fetch current block"}));
        }
    };

    // 600 blocks ≈ 50 minutes on Celo — enough time for the user to sign and submit
    let valid_until_block = current_block + 600;

    match rewards.sign_app_claim(user, U256::from(valid_until_block)).await {
        Ok(app_signature) => HttpResponse::Ok().json(SignClaimResponse {
            app_address: rewards.app_address_hex(),
            app_signature,
            valid_until_block,
            description: APP_DESCRIPTION.to_string(),
        }),
        Err(e) => {
            tracing::error!("AppClaim signing failed for {}: {}", body.user, e);
            HttpResponse::InternalServerError().json(json!({"error": "Signing failed"}))
        }
    }
}
