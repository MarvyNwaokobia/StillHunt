-- B4 — staked async score-duels.
--
-- Two players stake the same amount of G$, both play the SAME seeded run
-- separately, and the higher server-validated score takes the pot minus a house
-- cut. Deliberately NOT live PvP: there is no netcode here, so there is nothing
-- to desync and nothing to trust a client with beyond a score the server already
-- range-checks against elapsed time (the Gauntlet anti-cheat anchor).
--
-- Money flow reuses the proven rails rather than a new contract:
--   stake    player -> RewardPool via spend_rearm (the B1 re-arm allowance rail)
--   payout   RewardPool -> winner via distribute_reward (idempotent by reference)
-- Stakes fund the payout, so a duel emits nothing new; the retained cut is a SINK.
--
-- `seed` is what makes the comparison fair: both players get identical spawns and
-- drops. It is generated SERVER-SIDE and never accepted from a client, otherwise a
-- challenger could shop for a seed they had already practised.
CREATE TABLE IF NOT EXISTS duels (
    id                     UUID PRIMARY KEY,
    challenger_wallet      TEXT   NOT NULL,
    -- NULL while the duel is open to anyone; set on accept.
    opponent_wallet        TEXT,
    -- Whole G$ each side stakes. Both sides stake the SAME amount.
    stake_g                BIGINT NOT NULL,
    seed                   BIGINT NOT NULL,

    -- Per-side run state. The token is single-use and its issue time is the
    -- server's clock for the elapsed-time check; a client never supplies duration.
    challenger_run_token   TEXT,
    challenger_started_at  TIMESTAMPTZ,
    challenger_score       INTEGER,
    opponent_run_token     TEXT,
    opponent_started_at    TIMESTAMPTZ,
    opponent_score         INTEGER,

    -- open -> accepted -> resolved. cancelled is an unaccepted duel withdrawn by
    -- its challenger (stake refunded).
    status                 TEXT   NOT NULL DEFAULT 'open',
    -- NULL on a resolved duel means a DRAW (both refunded), not "unpaid".
    winner_wallet          TEXT,
    payout_tx              TEXT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    accepted_at            TIMESTAMPTZ,
    resolved_at            TIMESTAMPTZ
);

-- Browsing open duels is the main read; the partial index keeps it cheap as
-- resolved rows accumulate.
CREATE INDEX IF NOT EXISTS idx_duels_open ON duels (created_at DESC) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_duels_challenger ON duels (challenger_wallet, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_duels_opponent ON duels (opponent_wallet, created_at DESC);

-- One open duel per challenger. Without this a player could open twenty duels,
-- escrow twenty stakes, and strand the lot.
CREATE UNIQUE INDEX IF NOT EXISTS idx_duels_one_open_per_challenger
    ON duels (challenger_wallet) WHERE status = 'open';
