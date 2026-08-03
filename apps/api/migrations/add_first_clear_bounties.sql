-- First-clear bounties (B0 · XP≠G$ decoupling).
-- XP no longer mints G$ on rank-up; the PvE G$ source is now a one-time bounty for
-- the FIRST clear of each Campaign op. The PRIMARY KEY (wallet, level) makes each
-- bounty idempotent — it is attempted at most once per op per wallet, so a retry or
-- a concurrent duplicate request can never pay twice (the on-chain StillHuntRewardPool
-- ref guard is the second line of defence).
-- Run after init.sql + add_gdollar_ledger.sql on existing databases.

CREATE TABLE IF NOT EXISTS first_clear_bounties (
  wallet_address TEXT   NOT NULL REFERENCES players (wallet_address) ON DELETE CASCADE,
  level          INT    NOT NULL,
  amount         BIGINT NOT NULL,                         -- whole G$ paid for this clear
  status         TEXT   NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'paid', 'failed')),
  tx_hash        TEXT,                                    -- set once the payout confirms
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (wallet_address, level)
);

CREATE INDEX IF NOT EXISTS idx_first_clear_bounties_wallet ON first_clear_bounties (wallet_address);
