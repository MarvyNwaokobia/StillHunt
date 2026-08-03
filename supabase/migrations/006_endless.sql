-- ============================================================
-- 006 · Endless mode leaderboards
-- ============================================================
-- One row per Endless run = the number of waves the player survived. The all-time
-- board is MAX(score) per wallet across all rows; the weekly (seasonal) board is
-- MAX(score) per wallet within the current ISO week (week_key, e.g. "2026-W26").
-- "Weekly reset" is just querying the current week_key — nothing is deleted.

CREATE TABLE IF NOT EXISTS endless_scores (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_address TEXT NOT NULL,
  score          INTEGER NOT NULL,
  week_key       TEXT NOT NULL,           -- ISO year-week the run happened in
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_endless_alltime ON endless_scores (score DESC);
CREATE INDEX IF NOT EXISTS idx_endless_weekly  ON endless_scores (week_key, score DESC);
