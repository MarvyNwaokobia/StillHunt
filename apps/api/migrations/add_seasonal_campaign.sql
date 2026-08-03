-- Seasonal Campaign (2026-07-26)
--
-- Two things the season model was missing:
--
-- 1. A SEED. Every player in a season walks the same generated room chain, so a
--    season is a fair comparison rather than a luck draw. The seed is what makes
--    that true, and storing it means the layout is reproducible after the fact.
--
-- 2. A SCHEDULED WINDOW. Seasons were "active = ends_at IS NULL", which can only
--    express "open-ended, until someone closes it". Season 1 runs a fixed 24 hours
--    (27 Jul 2026, 00:00–23:59 WAT), so a season now carries both bounds up front
--    and "active" is a time comparison. An open-ended season still works: leave
--    ends_at NULL and it stays live until it's closed.
--
-- Runs are recorded in survival_runs, which already carries submitted_at; the
-- season board filters that by the window, so no change is needed there.

ALTER TABLE seasons ADD COLUMN IF NOT EXISTS seed BIGINT;

-- Backfill any existing season with a stable seed derived from its id, so an
-- in-flight season doesn't suddenly have a NULL layout.
UPDATE seasons SET seed = ABS(('x' || substr(md5(id::text), 1, 8))::bit(32)::int)
WHERE seed IS NULL;

ALTER TABLE seasons ALTER COLUMN seed SET NOT NULL;

-- Distinguishes a Seasonal Campaign run from a practice Gauntlet run. Only seasonal
-- runs count toward a season board, so a player grinding the Gauntlet outside the
-- window can never appear on the season ladder.
ALTER TABLE survival_runs ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES seasons(id);

CREATE INDEX IF NOT EXISTS survival_runs_season_idx
  ON survival_runs (season_id, status, waves DESC);

-- Per-season prize split, in basis points by rank. NULL falls back to the built-in
-- top-20 table. Season 1 pays a flat top 5 ($10 each), which the default table can't
-- express, and a split should be a property of the season anyway rather than a
-- constant that has to be redeployed to change.
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS payout_bps INTEGER[];
