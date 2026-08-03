//! Crash reports from the browser.
//!
//! Exists because the alternative was inference. A route-level crash rendered
//! "Something broke", the message never left the device, and working out what
//! threw meant reasoning backwards from a screenshot of a phone — which is how
//! the same bug got two confident wrong diagnoses before this endpoint existed.

use actix_web::{web, HttpRequest, HttpResponse};
use serde::Deserialize;
use serde_json::json;

use crate::utils::normalize_wallet;
use crate::AppState;

/// Caps on what we store. A crash loop can fire this repeatedly, and a stack is
/// unbounded in principle, so both are trimmed rather than trusted.
const MAX_MESSAGE: usize = 2_000;
const MAX_STACK: usize = 8_000;
const MAX_URL: usize = 500;
const MAX_UA: usize = 300;

#[derive(Deserialize)]
pub struct ClientErrorReport {
    pub message: String,
    pub stack: Option<String>,
    pub digest: Option<String>,
    pub url: Option<String>,
    pub wallet_address: Option<String>,
}

fn clip(s: &str, max: usize) -> String {
    s.chars().take(max).collect()
}

// ── POST /client-errors ────────────────────────────────────────────────────────
// Unauthenticated on purpose: the crashes worth hearing about include the ones
// that happen before a session resolves, and a client that has just died cannot
// be relied on to prove who it is. Nothing here is trusted — every field is
// clipped, and it is written to a table nothing else reads from.
pub async fn report(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<ClientErrorReport>,
) -> HttpResponse {
    let wallet = body
        .wallet_address
        .as_deref()
        .filter(|w| w.len() == 42 && w.starts_with("0x"))
        .map(normalize_wallet);

    let user_agent = req
        .headers()
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .map(|v| clip(v, MAX_UA));

    let message = clip(&body.message, MAX_MESSAGE);

    // Logged as well as stored: the log is what shows up while tailing a deploy,
    // the row is what can be queried a day later.
    tracing::error!(
        "CLIENT CRASH [{}] at {}: {}",
        wallet.as_deref().unwrap_or("anon"),
        body.url.as_deref().unwrap_or("?"),
        message,
    );

    let written = sqlx::query(
        "INSERT INTO client_errors (wallet_address, message, stack, digest, url, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(&wallet)
    .bind(&message)
    .bind(body.stack.as_deref().map(|s| clip(s, MAX_STACK)))
    .bind(body.digest.as_deref())
    .bind(body.url.as_deref().map(|s| clip(s, MAX_URL)))
    .bind(&user_agent)
    .execute(&state.db)
    .await;

    if let Err(e) = written {
        tracing::error!("could not store client error report: {}", e);
    }

    // Always 200. A reporting endpoint that can fail the reporter is worse than
    // no reporting endpoint.
    HttpResponse::Ok().json(json!({ "ok": true }))
}
