-- Store the Magic login identity per wallet so we can see when one PERSON has multiple
-- wallets (email-login vs Google-login, or Safari-ITP re-issues, all give different
-- addresses). Same email across wallets = same person → lets us detect the multi-account
-- pattern that may trigger GoodDollar's one-face whitelist churn. Nullable + backfilled
-- lazily on next login; existing rows stay NULL until then.
ALTER TABLE players ADD COLUMN IF NOT EXISTS magic_email  TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS magic_issuer TEXT;  -- Magic DID (per login identity)
CREATE INDEX IF NOT EXISTS idx_players_magic_email ON players (magic_email) WHERE magic_email IS NOT NULL;
