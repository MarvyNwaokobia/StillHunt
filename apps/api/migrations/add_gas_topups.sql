-- Gas top-ups — records the relay's CELO drips to player wallets so a 0-CELO Magic
-- wallet can pay gas for its own GoodDollar UBI claim when GoodDollar's own faucet
-- doesn't come through. One row per wallet; the last_topup_at gate rate-limits drips
-- (see handlers/gas.rs) so the tiny faucet can't be farmed. Additive + idempotent.

CREATE TABLE IF NOT EXISTS gas_topups (
  wallet_address TEXT PRIMARY KEY REFERENCES players (wallet_address) ON DELETE CASCADE,
  last_topup_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_wei      NUMERIC(40, 0) NOT NULL DEFAULT 0,
  topup_count    INTEGER NOT NULL DEFAULT 0
);
