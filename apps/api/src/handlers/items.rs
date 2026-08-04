use actix_web::{web, HttpResponse};
use ethers::types::Address;
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use rust_decimal::prelude::ToPrimitive;
use crate::AppState;
use crate::models::item::Item;
use crate::utils::normalize_wallet;

pub async fn list_items(state: web::Data<AppState>) -> HttpResponse {
    let result = sqlx::query_as::<_, Item>(
        "SELECT * FROM items ORDER BY price_g ASC",
    )
    .fetch_all(&state.db)
    .await;

    let mut items = match result {
        Ok(i) => i,
        Err(e) => {
            tracing::error!("Failed to fetch items: {}", e);
            return HttpResponse::InternalServerError().json(json!({"error": "Failed to fetch items"}));
        }
    };

    // Attach non-Celo prices. One query for the whole table rather than one per item:
    // the shop lists everything on every load, so N+1 here would be N+1 on the hottest
    // read in the app.
    //
    // A failure loads the shop with Celo prices only, which is the safe direction:
    // clients disable buying for a chain they have no price for, so the worst case is
    // "cannot buy with Scrip right now" rather than "signed a permit for the wrong
    // amount and it reverted".
    let prices = sqlx::query_as::<_, (uuid::Uuid, i32, rust_decimal::Decimal)>(
        "SELECT item_id, chain_id, price FROM item_chain_prices",
    )
    .fetch_all(&state.db)
    .await;

    match prices {
        Ok(rows) => {
            let mut by_item: std::collections::HashMap<uuid::Uuid, std::collections::HashMap<String, f64>> =
                std::collections::HashMap::new();
            for (item_id, chain_id, price) in rows {
                                if let Some(p) = price.to_f64() {
                    by_item.entry(item_id).or_default().insert(chain_id.to_string(), p);
                }
            }
            for item in items.iter_mut() {
                if let Some(m) = by_item.remove(&item.id) {
                    item.chain_prices = m;
                }
            }
        }
        Err(e) => tracing::error!("Failed to fetch per-chain item prices: {}", e),
    }

    HttpResponse::Ok().json(items)
}

// ── POST /items/:id/purchase ──────────────────────────────────────────────────
// Internal/admin endpoint — records inventory without a G$ check.
// The relay endpoint below is the user-facing purchase path.
#[derive(Deserialize)]
pub struct PurchaseRequest {
    pub wallet_address: String,
}

pub async fn purchase_item(
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
    body: web::Json<PurchaseRequest>,
) -> HttpResponse {
    let item_id = path.into_inner();
    let wallet  = normalize_wallet(&body.wallet_address);

    let item = sqlx::query_as::<_, Item>("SELECT * FROM items WHERE id = $1")
        .bind(item_id)
        .fetch_optional(&state.db)
        .await;

    let item = match item {
        Ok(Some(i)) => i,
        Ok(None) => return HttpResponse::NotFound().json(json!({"error": "Item not found"})),
        Err(_) => return HttpResponse::InternalServerError().json(json!({"error": "Database error"})),
    };

    if let Some(remaining) = item.remaining_supply {
        if remaining <= 0 {
            return HttpResponse::Conflict().json(json!({"error": "Item sold out"}));
        }
    }

    let inv_result = sqlx::query(
        "INSERT INTO inventory (wallet_address, item_id, equipped, acquired_at)
         VALUES ($1, $2, false, now())
         ON CONFLICT (wallet_address, item_id) DO NOTHING",
    )
    .bind(&wallet)
    .bind(item_id)
    .execute(&state.db)
    .await;

    if inv_result.is_err() {
        return HttpResponse::InternalServerError().json(json!({"error": "Failed to record purchase"}));
    }

    let _ = sqlx::query(
        "UPDATE items SET remaining_supply = GREATEST(0, remaining_supply - 1) WHERE id = $1 AND remaining_supply IS NOT NULL",
    )
    .bind(item_id)
    .execute(&state.db)
    .await;

    HttpResponse::Ok().json(json!({ "success": true, "item_id": item_id }))
}

// ── POST /items/:id/purchase-relay ────────────────────────────────────────────
// User-facing on-chain purchase via EIP-2612 permit relay.
// Frontend signs a permit (no CELO gas), backend submits purchaseWithPermit on-chain.
#[derive(Deserialize)]
pub struct RelayPurchaseRequest {
    pub wallet_address: String,
    pub deadline: u64,
    pub v: u8,
    pub r: String,
    pub s: String,
    /// Which chain the buyer signed their permit against. Absent = Celo, so every
    /// client that predates SCRP purchases keeps working with no change.
    ///
    /// This is NOT a trust boundary — a client claiming the wrong chain gets a
    /// permit that fails to verify against that chain's marketplace and reverts,
    /// costing them a signature and us nothing. It is routing information.
    pub chain_id: Option<i32>,
}

pub async fn purchase_item_relay(
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
    body: web::Json<RelayPurchaseRequest>,
) -> HttpResponse {
    let item_id = path.into_inner();
    let wallet  = normalize_wallet(&body.wallet_address);

    // Fetch item — need on_chain_id for the marketplace call
    let item = sqlx::query_as::<_, Item>("SELECT * FROM items WHERE id = $1")
        .bind(item_id)
        .fetch_optional(&state.db)
        .await;

    let item = match item {
        Ok(Some(i)) => i,
        Ok(None) => return HttpResponse::NotFound().json(json!({"error": "Item not found"})),
        Err(_) => return HttpResponse::InternalServerError().json(json!({"error": "Database error"})),
    };

    if let Some(remaining) = item.remaining_supply {
        if remaining <= 0 {
            return HttpResponse::Conflict().json(json!({"error": "Item sold out"}));
        }
    }

    // Guard against double-purchase
    let already_owned: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM inventory WHERE wallet_address = $1 AND item_id = $2)",
    )
    .bind(&wallet)
    .bind(item_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);

    if already_owned {
        return HttpResponse::Conflict().json(json!({"error": "Already owned"}));
    }

    // Which chain the buyer signed against. Absent = Celo, so every existing client
    // is unaffected.
    // The price this purchase is denominated in. Used for the LEDGER only — the
    // contract charges from its own listing — but the two must agree or reporting
    // drifts away from what actually moved.
    let charged_price: rust_decimal::Decimal = item.price_g;

    let tx_hash: String;

    if let Some(on_chain_id) = item.on_chain_id {
        let buyer: Address = match wallet.parse() {
            Ok(a) => a,
            Err(_) => return HttpResponse::BadRequest().json(json!({"error": "Invalid wallet address"})),
        };

        // Check the tank before spending the buyer's signature, so a relay with no
        // gas doesn't burn a permit nonce and send them round the "signature
        // invalid" loop. Both rails, same rule.
        let relay_dry_error = || {
            HttpResponse::ServiceUnavailable().json(json!({
                "error": "StillHunt can't process purchases right now — our relay is out of gas. \
                          You have not been charged. This is on us, not your wallet.",
                "code": crate::services::chain::RELAY_OUT_OF_GAS,
            }))
        };

        let relay_result = {

                let chain = match state.chain.as_ref() {
                    Some(c) => c,
                    None => return HttpResponse::ServiceUnavailable()
                        .json(json!({"error": "Chain relay not available"})),
                };
                if !chain.relay_can_pay().await {
                    tracing::error!("RELAY OUT OF GAS — refusing purchase for {} before taking the signature", wallet);
                    return relay_dry_error();
                }
                chain
                    .purchase_item_for(buyer, on_chain_id as u64, body.deadline, body.v, &body.r, &body.s)
                    .await
        };

        tx_hash = match relay_result {
            Ok(hash) => format!("{:?}", hash),
            Err(e) => {
                tracing::warn!("purchase relay failed for {}: {}", wallet, e);
                if crate::services::chain::is_out_of_gas(&e) {
                    return HttpResponse::ServiceUnavailable().json(json!({
                        "error": "StillHunt's relay ran out of gas mid-purchase. You have not been \
                                  charged — this is on us, not your wallet.",
                        "code": crate::services::chain::RELAY_OUT_OF_GAS,
                    }));
                }
                return HttpResponse::BadRequest().json(json!({"error": e}));
            }
        };
    } else {
        // Off-chain item (ammo, attachments, etc.) — the signed permit proves
        // intent; we record the purchase directly without a contract call.
        tx_hash = format!("offchain-{}", item_id);
    }

    // Record inventory + decrement supply
    let _ = sqlx::query(
        "INSERT INTO inventory (wallet_address, item_id, equipped, acquired_at)
         VALUES ($1, $2, false, now())
         ON CONFLICT (wallet_address, item_id) DO NOTHING",
    )
    .bind(&wallet)
    .bind(item_id)
    .execute(&state.db)
    .await;

    let _ = sqlx::query(
        "UPDATE items SET remaining_supply = GREATEST(0, remaining_supply - 1) WHERE id = $1 AND remaining_supply IS NOT NULL",
    )
    .bind(item_id)
    .execute(&state.db)
    .await;

    crate::handlers::ledger::insert_ledger_entry(
        &state.db, &wallet, "marketplace_purchase", charged_price, Some(&tx_hash), None,
    ).await;

    // Shop revenue stays in the marketplace contract. There is no reward pool to
    // recirculate it into, and that is the point: it accumulates as real revenue
    // earmarked for the TALLY exit, rather than being recycled into payouts.

    tracing::info!("Purchase confirmed: item={} buyer={} tx={}", item_id, wallet, tx_hash);

    HttpResponse::Ok().json(json!({
        "success": true,
        "item_id": item_id,
        "wallet_address": wallet,
        "tx_hash": tx_hash,
    }))
}
