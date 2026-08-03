-- Claim-based earning: accrue first, pay on demand.
--
-- Celo pays the moment you win: every campaign clear fires its own relay transaction
-- carrying real G$. That works, and it is NOT changed by this migration — the web
-- edition keeps auto-paying exactly as it does today, and nothing here touches
-- g_ledger or any existing bounty table.
--
-- The Avalanche edition works the other way round. A player accrues Scrip as they
-- play, sees a balance, and claims it in the Bank when they want it on-chain. Three
-- reasons that shape is better, all of which apply to Celo too if it ever switches:
--
--   1. ONE transaction per claim instead of one per win. The relay running out of
--      gas is the single most common cause of failed payouts in this codebase's
--      history; batching cuts the transaction count by roughly the number of wins
--      between claims.
--   2. Unclaimed balance is never paid out. A large share of earned value is simply
--      never collected, which is normal player behaviour and reduces real outflow
--      without taking anything away from anyone who does turn up to claim.
--   3. It puts a single, obvious gate in front of the money, which is where an
--      identity check belongs: play freely, prove you are human once, at the exit.
--
-- WHY TWO TABLES
-- --------------
-- `earnings` is the accrual: one row per thing a player earned, unpaid until a claim
-- picks it up. `claims` is one payout attempt covering many earnings. Keeping them
-- separate is what makes a failed payout recoverable — the earnings detach from the
-- failed claim and reappear in the balance, rather than being lost inside a single
-- row that is both the debt and the payment.

-- ── claims ────────────────────────────────────────────────────────────────────
--
-- Created BEFORE earnings because earnings references it.
CREATE TABLE IF NOT EXISTS claims (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address TEXT        NOT NULL,
    -- Which chain this was paid on. A claim is settled in exactly one currency on
    -- exactly one chain, because that is what the player picked in the Bank.
    chain_id       INTEGER     NOT NULL,
    amount         NUMERIC(20,8) NOT NULL,
    -- pending: rows attached, on-chain send not yet confirmed.
    -- paid:    tx_hash is set and mined.
    -- failed:  send failed; the attached earnings have been released back.
    status         TEXT        NOT NULL DEFAULT 'pending',
    tx_hash        TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at        TIMESTAMPTZ,
    CONSTRAINT claims_status_check CHECK (status IN ('pending', 'paid', 'failed')),
    -- A claim for nothing is always a bug: it means the balance was read as
    -- positive and then found empty, which is the race this rejects outright
    -- rather than sending a zero-value transaction that costs gas and proves nothing.
    CONSTRAINT claims_amount_positive CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_claims_wallet  ON claims (wallet_address, created_at DESC);
-- The reconciler sweeps stuck 'pending' rows; this is the index it reads.
CREATE INDEX IF NOT EXISTS idx_claims_status  ON claims (status, created_at);

-- ── earnings ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS earnings (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address TEXT        NOT NULL,
    chain_id       INTEGER     NOT NULL,
    -- Mirrors g_ledger.category so the two can be reported side by side:
    -- battle_reward, first_clear, rank_up, endless_wave, referral_reward…
    category       TEXT        NOT NULL,
    amount         NUMERIC(20,8) NOT NULL,
    -- Idempotency key, same discipline as the on-chain refs this codebase already
    -- uses (`first_clear:{wallet}:{level}`, `op_play:{wallet}:{battle_id}`). The
    -- UNIQUE below is what makes awarding safe to retry: a duplicate award is a
    -- no-op instead of paying twice.
    ref            TEXT        NOT NULL,
    -- NULL means unclaimed, and therefore spendable balance. Set when a claim
    -- picks the row up; set back to NULL if that claim fails.
    claim_id       UUID        REFERENCES claims(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT earnings_amount_positive CHECK (amount > 0)
);

-- The idempotency guarantee. Scoped per wallet because refs embed the wallet
-- anyway; the pair is what a retry collides on.
CREATE UNIQUE INDEX IF NOT EXISTS idx_earnings_wallet_ref
    ON earnings (wallet_address, ref);

-- The balance query: unclaimed rows for one wallet on one chain. Partial, because
-- claimed rows are history and never participate in a balance, so there is no point
-- carrying them in the index that gets read on every Bank page load.
CREATE INDEX IF NOT EXISTS idx_earnings_unclaimed
    ON earnings (wallet_address, chain_id)
    WHERE claim_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_earnings_claim ON earnings (claim_id);
