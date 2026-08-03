-- Marketplace debts — an amount a player owes the shop that they settle by signing
-- a G$ permit (the backend relays transferFrom → reward pool). Created when e.g.
-- prices are raised and existing owners are charged the difference. A player sees an
-- "outstanding balance" banner until every 'owed' row is 'settled'.
-- Additive migration; idempotent.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS marketplace_debts (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_address TEXT NOT NULL REFERENCES players (wallet_address) ON DELETE CASCADE,
  amount         NUMERIC(20, 8) NOT NULL CHECK (amount > 0),
  reason         TEXT NOT NULL DEFAULT 'price adjustment',
  status         TEXT NOT NULL DEFAULT 'owed' CHECK (status IN ('owed', 'settled')),
  tx_hash        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_marketplace_debts_wallet
  ON marketplace_debts (wallet_address, status);
