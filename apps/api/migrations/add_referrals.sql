-- Referrals: a player who brings in a NEW verified fighter is paid once.
--
-- Keyed on the REFERRED wallet, not on the referrer. One row per new player, for
-- ever, which is what makes the payout idempotent: a replayed or retried
-- create_player finds the slot already claimed and pays nothing. Without that,
-- any repeat of the creation request would pay the referrer again.
--
-- Anti-sybil is inherited rather than invented. A player row cannot exist without
-- passing the GoodDollar whitelist check in onboarding, and GoodDollar does
-- face-based one-person-one-account dedup — so the usual referral failure mode
-- (one human, fifty wallets, fifty payouts) is already blocked upstream. This
-- table adds no defence of its own beyond the one-payout-per-wallet key.
--
-- Deliberately NOT reversed if the referred player is later un-whitelisted.
-- GoodDollar drops a large share of Magic wallets within days (see
-- add_magic_identity.sql), and clawing money back from someone who genuinely
-- recruited a real person would make the mechanic untrustworthy.
CREATE TABLE IF NOT EXISTS referrals (
    -- One referral per new player, ever.
    referred_wallet TEXT PRIMARY KEY,
    referrer_wallet TEXT NOT NULL,
    amount          BIGINT NOT NULL,
    -- pending -> paid | failed. Mirrors the other payout tables so the same
    -- reconcile-and-retry habits apply.
    status          TEXT NOT NULL DEFAULT 'pending',
    tx_hash         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at         TIMESTAMPTZ
);

-- "How many warriors have I recruited" is the read behind the card counter.
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals (referrer_wallet, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals (status) WHERE status <> 'paid';

-- A player can never refer themselves, whatever the client sends.
ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_no_self;
ALTER TABLE referrals ADD CONSTRAINT referrals_no_self
    CHECK (referrer_wallet <> referred_wallet);
