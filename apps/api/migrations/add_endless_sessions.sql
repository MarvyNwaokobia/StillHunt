-- In-flight Endless runs, so a server restart does not cost a player their run.
--
-- These lived ONLY in a DashMap. Every deploy restarts the process and empties
-- it, after which POST /endless/wave answers 404 and the run stops being counted
-- while the player keeps playing. On 27 Jul that cost real progress mid-season:
-- players finished on wave 5 and were recorded on wave 2, and 8 of 36 entrants
-- never appeared on the board at all.
--
-- The memory map stays as the hot path; this is the fallback it rehydrates from.
--
-- started_at is a timestamp rather than a monotonic Instant precisely so it can
-- survive a restart — the min-seconds-per-wave floor is measured from it, and a
-- floor that resets on deploy would let a restart wave through a burst of
-- otherwise-impossible clears.
CREATE TABLE IF NOT EXISTS endless_sessions (
    session_id UUID PRIMARY KEY,
    wallet     TEXT NOT NULL,
    season_id  UUID NOT NULL,
    -- Highest wave the SERVER has credited this session.
    wave       INTEGER NOT NULL,
    -- The wave this session resumed at; the timing floor is relative to it.
    base_wave  INTEGER NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The TTL sweep scans by age.
CREATE INDEX IF NOT EXISTS idx_endless_sessions_started ON endless_sessions (started_at);
