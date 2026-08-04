-- In-game spending against the accrued balance.
--
-- A player earns TALLY as a database balance and claims it on-chain when they
-- choose. Mid-run spending (a re-arm, a resupply) has to come out of that accrued
-- balance rather than their wallet: it happens between waves, and stopping to
-- sign a transaction there would end the run it is meant to rescue.
--
-- Kept in its OWN table rather than as a negative `earnings` row. The earnings
-- CHECK requires amount > 0, and relaxing it would let any bug that flips a sign
-- silently drain a balance through a path with no audit trail. Two tables with
-- one direction each cannot express that mistake.
CREATE TABLE IF NOT EXISTS spends (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address TEXT NOT NULL,
    category      TEXT NOT NULL,
    amount        NUMERIC(20,8) NOT NULL CHECK (amount > 0),
    -- Idempotency key. A retried re-arm must debit once, not twice.
    ref           TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (wallet_address, ref)
);

CREATE INDEX IF NOT EXISTS spends_wallet_idx ON spends (wallet_address);
