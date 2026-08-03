-- Survival re-arm sink (B1 · economy sinks).
-- During a Survival run a player can spend G$ to revive, restock ammo, or skip a
-- wave. The G$ leaves their own wallet (player → RewardPool) via a session
-- allowance they authorize once per run (one EIP-2612 permit), so re-arms need no
-- further signature. This table is the idempotency + audit ledger: the client
-- sends a unique `ref` per re-arm and the PRIMARY KEY (wallet, ref) guarantees a
-- retry or double-submit charges at most once.
-- Run after init.sql + add_gdollar_ledger.sql on existing databases.

CREATE TABLE IF NOT EXISTS survival_rearms (
  wallet_address TEXT   NOT NULL REFERENCES players (wallet_address) ON DELETE CASCADE,
  ref            TEXT   NOT NULL,                         -- client-chosen idempotency key
  action         TEXT   NOT NULL CHECK (action IN ('revive', 'restock', 'waveskip')),
  amount         BIGINT NOT NULL,                         -- whole G$ debited for this re-arm
  wave           INT    NOT NULL DEFAULT 0,               -- wave it was bought on (audit)
  status         TEXT   NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'paid', 'failed')),
  tx_hash        TEXT,                                    -- transferFrom hash once broadcast
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (wallet_address, ref)
);

CREATE INDEX IF NOT EXISTS idx_survival_rearms_wallet ON survival_rearms (wallet_address);
