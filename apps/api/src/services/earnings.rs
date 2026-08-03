//! Accrue-then-claim earning. The Avalanche edition's money path.
//!
//! Celo pays on the spot: win an op, the relay fires a transaction, real G$ lands.
//! That is untouched by this module and stays exactly as it is. Nothing here writes
//! to `g_ledger` or to any of the existing bounty tables.
//!
//! This is the other shape, for chains where StillHunt mints its own currency. A player
//! accrues, sees a balance, and claims when they choose. See the header of
//! `migrations/add_earnings_and_claims.sql` for why that shape is better.
//!
//! THE INVARIANT THIS MODULE EXISTS TO HOLD
//! ----------------------------------------
//! A unit of earned value is in exactly one of three states, and can never be in
//! two at once:
//!
//!   unclaimed  → counted in the balance, claimable
//!   claimed    → attached to a claim, NOT in the balance, awaiting or holding a payout
//!   released   → a claim failed, so it is unclaimed again
//!
//! The dangerous transition is the middle one. If a claim attaches rows and then the
//! on-chain send fails without releasing them, the player's money vanishes from their
//! balance while never arriving in their wallet. `fail_claim` is what prevents that,
//! and it is why claiming and paying are separate steps rather than one function.

use rust_decimal::Decimal;
use sqlx::PgPool;
use uuid::Uuid;

use CHAINID_GONE;

/// A claim that has been opened and had earnings attached, but not yet paid.
#[derive(Debug, Clone)]
pub struct OpenClaim {
    pub id: Uuid,
    pub amount: Decimal,
}

/// Credits a player for something they earned. Idempotent on `ref`.
///
/// Returns true if this call created the row, false if `ref` had already been
/// credited. Callers can treat false as success: it means the award is recorded,
/// just not by this attempt. That matches how the on-chain `ref` keys already work
/// in this codebase and makes retries free.
///
/// `amount` must be positive; a zero or negative award is rejected by the CHECK
/// constraint rather than silently stored, because a negative "earning" would
/// quietly reduce a balance through a path that has no audit trail for a debit.
pub async fn award(
    db: &PgPool,
    wallet: &str,
    chain: ChainId,
    category: &str,
    amount: Decimal,
    ref_key: &str,
) -> bool {
    let result = sqlx::query(
        "INSERT INTO earnings (wallet_address, chain_id, category, amount, ref)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (wallet_address, ref) DO NOTHING",
    )
    .bind(wallet)
    .bind(chain.as_i32())
    .bind(category)
    .bind(amount)
    .bind(ref_key)
    .execute(db)
    .await;

    match result {
        Ok(r) => r.rows_affected() > 0,
        Err(e) => {
            // Loud, not swallowed. An award that fails to record is money the player
            // earned and will never be able to claim, which is the exact class of
            // silent write failure that cost this codebase a rank ladder once.
            tracing::error!("Failed to record earning ({} {} {}): {}", wallet, category, amount, e);
            false
        }
    }
}

/// What this wallet could claim right now on this chain.
///
/// Zero for an unknown wallet or a read error. Returning zero on error is the safe
/// direction here: it shows a player less than they have and they retry, rather
/// than offering a claim the database cannot back.
pub async fn balance(db: &PgPool, wallet: &str, chain: ChainId) -> Decimal {
    sqlx::query_scalar::<_, Decimal>(
        "SELECT COALESCE(SUM(amount), 0) FROM earnings
          WHERE wallet_address = $1 AND chain_id = $2 AND claim_id IS NULL",
    )
    .bind(wallet)
    .bind(chain.as_i32())
    .fetch_one(db)
    .await
    .unwrap_or_else(|e| {
        tracing::error!("Failed to read earnings balance for {}: {}", wallet, e);
        Decimal::ZERO
    })
}

/// Opens a claim and attaches every unclaimed earning for this wallet and chain.
///
/// Runs in ONE transaction, and that is the whole point. Between reading a balance
/// and attaching rows, another request could open a second claim over the same
/// earnings and the player would be paid twice. Doing both inside a transaction,
/// with the attaching UPDATE filtering on `claim_id IS NULL`, makes the second
/// claim attach nothing and settle at zero instead.
///
/// Returns `None` when there is nothing to claim. Callers must then NOT send a
/// transaction — an empty claim would burn gas to move nothing.
///
/// The claim is left `pending` on purpose. Paying is a separate step because it
/// talks to a chain and can fail; see `settle_claim` / `fail_claim`.
pub async fn open_claim(db: &PgPool, wallet: &str, chain: ChainId) -> Option<OpenClaim> {
    let chain_id = chain.as_i32();

    let mut tx = match db.begin().await {
        Ok(t) => t,
        Err(e) => {
            tracing::error!("Failed to open claim transaction for {}: {}", wallet, e);
            return None;
        }
    };

    // Lock the unclaimed rows first. FOR UPDATE means a concurrent claim for the
    // same wallet blocks here rather than racing us to the UPDATE below.
    let total: Decimal = match sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount), 0) FROM (
             SELECT amount FROM earnings
              WHERE wallet_address = $1 AND chain_id = $2 AND claim_id IS NULL
              FOR UPDATE
         ) locked",
    )
    .bind(wallet)
    .bind(chain_id)
    .fetch_one(&mut *tx)
    .await
    {
        Ok(t) => t,
        Err(e) => {
            tracing::error!("Failed to total earnings for {}: {}", wallet, e);
            return None;
        }
    };

    if total <= Decimal::ZERO {
        // Nothing owed. Not an error — a player opening the Bank with a zero
        // balance is the normal case, so this rolls back quietly.
        return None;
    }

    let claim_id: Uuid = match sqlx::query_scalar(
        "INSERT INTO claims (wallet_address, chain_id, amount) VALUES ($1, $2, $3) RETURNING id",
    )
    .bind(wallet)
    .bind(chain_id)
    .bind(total)
    .fetch_one(&mut *tx)
    .await
    {
        Ok(id) => id,
        Err(e) => {
            tracing::error!("Failed to create claim row for {}: {}", wallet, e);
            return None;
        }
    };

    // `claim_id IS NULL` in the WHERE is the second half of the double-pay guard:
    // even if the lock above were somehow bypassed, a row already attached to
    // another claim cannot be attached again.
    if let Err(e) = sqlx::query(
        "UPDATE earnings SET claim_id = $1
          WHERE wallet_address = $2 AND chain_id = $3 AND claim_id IS NULL",
    )
    .bind(claim_id)
    .bind(wallet)
    .bind(chain_id)
    .execute(&mut *tx)
    .await
    {
        tracing::error!("Failed to attach earnings to claim {}: {}", claim_id, e);
        return None;
    }

    if let Err(e) = tx.commit().await {
        tracing::error!("Failed to commit claim for {}: {}", wallet, e);
        return None;
    }

    Some(OpenClaim { id: claim_id, amount: total })
}

/// Marks a claim paid, recording the transaction that paid it.
pub async fn settle_claim(db: &PgPool, claim_id: Uuid, tx_hash: &str) {
    if let Err(e) = sqlx::query(
        "UPDATE claims SET status = 'paid', tx_hash = $2, paid_at = now()
          WHERE id = $1 AND status = 'pending'",
    )
    .bind(claim_id)
    .bind(tx_hash)
    .execute(db)
    .await
    {
        // The money HAS moved at this point. Losing the record does not lose the
        // funds, but it does leave a claim stuck 'pending' that the reconciler will
        // look at, so this must be shouted about rather than swallowed.
        tracing::error!("PAID BUT NOT RECORDED: claim {} tx {}: {}", claim_id, tx_hash, e);
    }
}

/// Marks a claim failed and RELEASES its earnings back into the player's balance.
///
/// This is the function that keeps the invariant at the top of this file true. A
/// claim that fails without releasing leaves the player's money attached to a
/// payout that never happened: gone from their balance, absent from their wallet,
/// and invisible in both places. Releasing first, then marking the status, means an
/// interruption between the two leaves the money claimable rather than stranded.
pub async fn fail_claim(db: &PgPool, claim_id: Uuid, reason: &str) {
    if let Err(e) = sqlx::query("UPDATE earnings SET claim_id = NULL WHERE claim_id = $1")
        .bind(claim_id)
        .execute(db)
        .await
    {
        tracing::error!(
            "STRANDED EARNINGS: claim {} failed ({}) but its earnings could not be released: {}",
            claim_id, reason, e,
        );
        return;
    }

    if let Err(e) = sqlx::query("UPDATE claims SET status = 'failed' WHERE id = $1")
        .bind(claim_id)
        .execute(db)
        .await
    {
        // Harmless relative to the above: the earnings are already claimable again,
        // so the player is whole. The row just reads 'pending' until reconciled.
        tracing::error!("Claim {} released but status not updated: {}", claim_id, e);
    } else {
        tracing::warn!("claim {} failed and was released back to balance: {}", claim_id, reason);
    }
}
