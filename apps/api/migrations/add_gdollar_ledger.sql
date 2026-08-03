-- G$ ledger — records every real G$ movement (UBI claims, battle-reward
-- payouts, marketplace spend, transfers out) so the Bank page can show a
-- per-player breakdown and season analytics can aggregate volume/awards.
-- Seasons are manually started/ended admin-side; no automatic cadence.
-- Run after init.sql on existing databases.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS g_ledger (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_address TEXT NOT NULL REFERENCES players (wallet_address) ON DELETE CASCADE,
  category       TEXT NOT NULL CHECK (category IN (
                     'ubi_claim', 'battle_reward', 'marketplace_purchase', 'transfer_out'
                   )),
  amount         NUMERIC(20, 8) NOT NULL,
  tx_hash        TEXT,
  counterparty   TEXT,           -- destination wallet, transfer_out only
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_g_ledger_wallet   ON g_ledger (wallet_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_g_ledger_category ON g_ledger (category, created_at DESC);

CREATE TABLE IF NOT EXISTS seasons (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  starts_at  TIMESTAMPTZ NOT NULL,
  ends_at    TIMESTAMPTZ,        -- NULL = currently active
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
