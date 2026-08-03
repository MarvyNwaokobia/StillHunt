-- Per-wave G$ payouts for Endless survival. One row per (session, wave), mirroring
-- first_clear_bounties / rank_up_rewards so the same idempotent settle + reconcile
-- rail covers it. The wave count is server-authoritative (the session owns it), so a
-- row only exists for a wave the server actually validated.
--
-- Idempotent; safe to re-run. Run BEFORE deploying the code that writes it.

CREATE TABLE IF NOT EXISTS endless_rewards (
  session_id     UUID   NOT NULL,
  wave           INT    NOT NULL,
  wallet_address TEXT   NOT NULL,
  amount         BIGINT NOT NULL,                         -- whole G$ paid for this wave
  week_key       TEXT   NOT NULL,                         -- ISO year-week, for the weekly cap
  status         TEXT   NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'paid', 'failed')),
  tx_hash        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, wave)
);

CREATE INDEX IF NOT EXISTS idx_endless_rewards_wallet ON endless_rewards (wallet_address);
-- Drives the (optional) per-player weekly cap: sum amount for a wallet in a week.
CREATE INDEX IF NOT EXISTS idx_endless_rewards_wallet_week ON endless_rewards (wallet_address, week_key);
-- Drives the reconcile sweep of unsettled rows.
CREATE INDEX IF NOT EXISTS idx_endless_rewards_status ON endless_rewards (status);
