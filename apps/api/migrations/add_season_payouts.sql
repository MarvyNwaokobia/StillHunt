-- Seasons prize pool + payout (B3 · closing the earn loop).
-- The `seasons` table already exists (id, name, starts_at, ends_at). B3 adds a G$
-- prize pool per season and a payout ledger. At season close an admin computes the
-- top Gauntlet runs within the season window, applies a top-heavy split, and
-- distributes G$ on-chain via the same StillHuntRewardPool rail as first-clear bounties
-- (idempotent per (season, wallet) ref). Run after add_gdollar_ledger.sql.

ALTER TABLE seasons ADD COLUMN IF NOT EXISTS prize_pool_g  BIGINT NOT NULL DEFAULT 0;
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS payout_status TEXT   NOT NULL DEFAULT 'pending'
  CHECK (payout_status IN ('pending', 'paid'));

-- One row per winner per season = the computed prize and its on-chain settlement.
-- PRIMARY KEY (season_id, wallet) makes the whole payout idempotent: computing a
-- season's payouts twice is a no-op, and each on-chain transfer is further guarded
-- by the RewardPool's per-ref idempotency.
CREATE TABLE IF NOT EXISTS season_payouts (
  season_id      UUID   NOT NULL REFERENCES seasons (id) ON DELETE CASCADE,
  wallet_address TEXT   NOT NULL REFERENCES players (wallet_address) ON DELETE CASCADE,
  rank           INT    NOT NULL,
  waves          INT    NOT NULL,
  amount_g       BIGINT NOT NULL,
  status         TEXT   NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'paid', 'failed')),
  tx_hash        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_season_payouts_season ON season_payouts (season_id);
