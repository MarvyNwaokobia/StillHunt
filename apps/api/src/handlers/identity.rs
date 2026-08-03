use actix_web::{web, HttpResponse};
use serde::{Deserialize, Serialize};

use crate::AppState;

#[derive(Serialize)]
pub struct VerifyResponse {
    verified: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    face_verify_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

// GoodDollar identity API response shapes
#[derive(Deserialize)]
struct GdWhitelistResponse {
    whitelisted: Option<bool>,
    // identity API v2 uses "isWhitelisted"
    #[serde(rename = "isWhitelisted")]
    is_whitelisted: Option<bool>,
}

pub async fn verify_identity(
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> HttpResponse {
    let wallet = path.into_inner().to_lowercase();

    // Fast path: player already has a character in our DB → already verified
    let existing: Option<(String,)> = sqlx::query_as(
        "SELECT wallet_address FROM players WHERE LOWER(wallet_address) = $1",
    )
    .bind(&wallet)
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None);

    if existing.is_some() {
        return HttpResponse::Ok().json(VerifyResponse {
            verified: true,
            face_verify_url: None,
            error: None,
        });
    }

    // Check GoodDollar whitelist via API
    // The GoodDollar backend exposes a simple REST endpoint for whitelist checks.
    // citizen-sdk hits the same underlying identity contract — this is the backend equivalent.
    let api_base = std::env::var("GOOD_DOLLAR_API_URL")
        .unwrap_or_else(|_| "https://gooddollar-api.gooddollar.org".into());

    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .unwrap_or_default();

    // Try v2 API first, fall back to v1
    let url_v2 = format!("{}/api/v2/verify/whitelisted/{}", api_base, wallet);
    let url_v1 = format!("{}/api/v1/verify/{}", api_base, wallet);

    let whitelisted = async {
        for url in [&url_v2, &url_v1] {
            if let Ok(res) = http.get(url).send().await {
                if res.status().is_success() {
                    if let Ok(body) = res.json::<GdWhitelistResponse>().await {
                        let result = body.is_whitelisted.or(body.whitelisted);
                        if result.is_some() {
                            return result;
                        }
                    }
                }
            }
        }
        None
    }
    .await;

    match whitelisted {
        Some(true) => HttpResponse::Ok().json(VerifyResponse {
            verified: true,
            face_verify_url: None,
            error: None,
        }),
        Some(false) => {
            // Generate face verification URL
            // In production the frontend generates this via citizen-sdk generateFVLink.
            // The backend provides it as a fallback for server-side checks.
            let fv_url = format!(
                "https://app.gooddollar.org/face-verification?account={}",
                wallet
            );
            HttpResponse::Ok().json(VerifyResponse {
                verified: false,
                face_verify_url: Some(fv_url),
                error: None,
            })
        }
        None => {
            tracing::warn!("GoodDollar whitelist check failed for {}", wallet);
            HttpResponse::Ok().json(VerifyResponse {
                verified: false,
                face_verify_url: None,
                error: Some(
                    "Could not verify with GoodDollar. Please try again or use the frontend verification flow.".into()
                ),
            })
        }
    }
}
