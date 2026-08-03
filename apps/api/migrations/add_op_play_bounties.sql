-- Pay-per-play bounties (policy change 2026-07-24): every session-backed Campaign op WIN
-- pays the op bounty, not just the first clear. Keyed by battle id so each play is its own
-- idempotent payout slot (and its own on-chain ref: keccak("op_play:{wallet}:{battle_id}")).
-- First clears keep flowing through first_clear_bounties unchanged; this table holds the
-- replay wins only.
CREATE TABLE IF NOT EXISTS op_play_bounties (
    battle_id      UUID PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    level          INTEGER NOT NULL,
    amount         BIGINT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'pending',
    tx_hash        TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_op_play_bounties_wallet ON op_play_bounties (wallet_address);
CREATE INDEX IF NOT EXISTS idx_op_play_bounties_status ON op_play_bounties (status, created_at);
