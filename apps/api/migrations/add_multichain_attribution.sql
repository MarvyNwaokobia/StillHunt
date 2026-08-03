-- Chain attribution: which chain did this transaction actually land on?
--
-- Until now StillHunt was single-chain, so every tx_hash in the database was
-- implicitly Celo and nothing had to say so. The moment a second chain exists
-- that assumption becomes a silent lie: a hash on its own cannot tell you which
-- explorer it belongs to, and a payout count cannot be split per chain for
-- grant reporting. Both of those are answered here, before the first
-- non-Celo transaction is written rather than after.
--
-- TWO DIFFERENT SHAPES, ON PURPOSE
-- --------------------------------
--   • g_ledger gets a COLUMN. A payout lands on exactly one chain, because the
--     player chose one currency at claim time. One row, one chain.
--   • battles get a TABLE. A match is recorded on every chain StillHunt runs on
--     (the same real event, written to two ledgers), so the relationship is
--     one-to-many and a column cannot hold it.

-- ── Payouts ───────────────────────────────────────────────────────────────────
--
-- DEFAULT 42220 backfills every existing row to Celo, which is exactly right:
-- every G$ payment ever made was on Celo. The default stays for that historical
-- accuracy, but insert_ledger_entry() takes the chain as a REQUIRED argument so
-- no new call site can fall through to it by accident.
ALTER TABLE g_ledger
    ADD COLUMN IF NOT EXISTS chain_id INTEGER NOT NULL DEFAULT 42220;

-- Grant reporting reads this constantly: volume per chain over a date range.
CREATE INDEX IF NOT EXISTS idx_g_ledger_chain_created
    ON g_ledger (chain_id, created_at DESC);

-- ── Match records ─────────────────────────────────────────────────────────────
--
-- One row per (battle, chain). battles.game_record_tx is KEPT and still written
-- for Celo, because three read paths depend on it (admin.rs's activity feed,
-- players.rs's battle history, BattleHistory.tsx) and breaking them buys
-- nothing. This table is the authoritative multi-chain record; that column is
-- a legacy pointer at the Celo row. Both are written by the same function so
-- they cannot drift.
CREATE TABLE IF NOT EXISTS battle_chain_records (
    battle_id  UUID        NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
    chain_id   INTEGER     NOT NULL,
    tx_hash    TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (battle_id, chain_id)
);

CREATE INDEX IF NOT EXISTS idx_battle_chain_records_chain
    ON battle_chain_records (chain_id, created_at DESC);

-- Backfill every battle already recorded on Celo. ON CONFLICT keeps this
-- re-runnable, which the migrator requires: it re-runs every file once against
-- a hand-migrated baseline database.
INSERT INTO battle_chain_records (battle_id, chain_id, tx_hash, created_at)
SELECT id, 42220, game_record_tx, created_at
  FROM battles
 WHERE game_record_tx LIKE '0x%'
ON CONFLICT (battle_id, chain_id) DO NOTHING;
