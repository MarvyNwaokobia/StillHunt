-- Duels are escrowed by StillHuntDuels on-chain, not by the backend, so a row
-- here is a record of a duel that already exists on the contract. Without this
-- column there is no way back from our row to the escrow holding the stakes.
ALTER TABLE duels ADD COLUMN IF NOT EXISTS onchain_duel_id BIGINT NOT NULL DEFAULT 0;

-- Two rows must never point at the same escrow: settling one would pay out the
-- other's pot. Partial, so the legacy rows that predate on-chain escrow (all of
-- them at 0) do not collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS duels_onchain_id_uniq
  ON duels (onchain_duel_id) WHERE onchain_duel_id > 0;
