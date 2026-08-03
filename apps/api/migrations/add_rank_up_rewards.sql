-- Rank-up rewards. Reaching a new rank (crossing 1000 XP) pays a flat 500 G$,
-- once per rank per wallet. The PRIMARY KEY (wallet, rank) makes each reward
-- idempotent — attempted at most once per rank per wallet, so a retry or a
-- concurrent duplicate fight-complete can never pay twice (the on-chain
-- StillHuntRewardPool ref guard is the second line of defence). Mirrors
-- first_clear_bounties so the reconcile sweep can re-attempt failed payouts.
-- Run after add_first_clear_bounties.sql on existing databases.

CREATE TABLE IF NOT EXISTS rank_up_rewards (
  wallet_address TEXT   NOT NULL REFERENCES players (wallet_address) ON DELETE CASCADE,
  rank           TEXT   NOT NULL,
  amount         BIGINT NOT NULL,                         -- whole G$ paid for this rank
  status         TEXT   NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'paid', 'failed')),
  tx_hash        TEXT,                                    -- set once the payout confirms
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (wallet_address, rank)
);

CREATE INDEX IF NOT EXISTS idx_rank_up_rewards_wallet ON rank_up_rewards (wallet_address);
