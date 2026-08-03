-- Schema drift repair: objects that live in PRODUCTION but that no migration creates.
--
-- Found by rebuilding the database from migrations/ alone and diffing the result
-- against prod. Both objects below were applied by hand and never captured in a
-- file, so a database built purely from these migrations came out missing them.
-- That breaks the promise migrate.rs makes in its own header: that this directory
-- IS the schema. A new environment, a staging box, or a rebuild after losing the
-- Railway volume would have come up quietly wrong rather than loudly broken.
--
-- Definitions below are copied from prod's live catalog (types, nullability,
-- defaults and indexes all read off information_schema / pg_indexes), NOT written
-- from memory. Every statement is a no-op against prod, which already has them.

-- ── endless_scores ────────────────────────────────────────────────────────────
--
-- The Endless leaderboard. 63 rows in prod at the time of writing. Read by the
-- weekly and all-time boards, so a rebuilt database would have served an empty
-- leaderboard rather than erroring, which is the worse failure: silent.
CREATE TABLE IF NOT EXISTS endless_scores (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address TEXT        NOT NULL,
    score          INTEGER     NOT NULL,
    week_key       TEXT        NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Matches prod exactly: one index for the weekly board, one for all-time.
CREATE INDEX IF NOT EXISTS idx_endless_weekly  ON endless_scores (week_key, score DESC);
CREATE INDEX IF NOT EXISTS idx_endless_alltime ON endless_scores (score DESC);

-- ── players.pve_level ─────────────────────────────────────────────────────────
--
-- Campaign progress: how far through the 15 ops a player has reached. 37 players
-- are past level 1. This is the single most damaging column to lose, because
-- rebuilding without it does not error anywhere — it silently resets everyone's
-- campaign to the start and re-opens every first-clear bounty.
ALTER TABLE players ADD COLUMN IF NOT EXISTS pve_level INTEGER NOT NULL DEFAULT 0;
