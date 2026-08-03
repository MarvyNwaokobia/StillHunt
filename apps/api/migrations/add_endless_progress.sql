-- Endless / Seasonal persistent progress (2026-07-26)
--
-- The mode's rules, decided with Marvy:
--   • Quitting never costs progress — you come back on the wave you left.
--   • DYING drops you to the START of your current wave, not back to wave 1. You
--     lose the rooms you had cleared in that wave and nothing else.
--   • The leaderboard ranks WAVES COMPLETED, not best run and not time played.
--
-- Because death never takes a completed wave away, progress is monotonic: one
-- number per player that only ever goes up. That makes this a progress table
-- rather than a run log — `wave` is the wave they are currently ON (uncleared),
-- so waves completed is simply `wave - 1`.
--
-- season_id partitions it: a real season id for Seasonal Campaign runs (each
-- season starts everyone from scratch), and the nil UUID for Campaign Endless,
-- which is one long career progression outside any season. NOT NULL with a nil
-- default so the primary key actually works (NULLs never compare equal).

CREATE TABLE IF NOT EXISTS endless_progress (
  wallet_address TEXT        NOT NULL,
  season_id      UUID        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  wave           INT         NOT NULL DEFAULT 1 CHECK (wave >= 1),
  deaths         INT         NOT NULL DEFAULT 0,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- When they reached their current wave. The leaderboard tie-break: level pegging
  -- on waves is settled by whoever got there first, so no two places can ever share
  -- a rank (which matters when each place is a separate cash prize).
  reached_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (wallet_address, season_id)
);

-- The leaderboard read: deepest wave first, earliest arrival breaking ties.
CREATE INDEX IF NOT EXISTS endless_progress_board_idx
  ON endless_progress (season_id, wave DESC, reached_at ASC);
