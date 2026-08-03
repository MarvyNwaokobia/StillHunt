-- Add on-chain transaction hash columns
-- Run after init.sql on existing databases

ALTER TABLE players
    ADD COLUMN IF NOT EXISTS character_claim_tx TEXT;

ALTER TABLE battles
    ADD COLUMN IF NOT EXISTS game_record_tx TEXT;
