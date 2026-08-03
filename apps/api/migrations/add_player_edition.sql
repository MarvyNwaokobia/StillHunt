-- Which edition of StillHunt a player was created in.
--
-- StillHunt ships through several doors from one codebase (see apps/web/src/editions):
-- the open web, MiniPay's in-app browser, and later Avalanche. They do NOT share an
-- economy. The web edition pays real G$ and gates on GoodDollar identity; the MiniPay
-- edition pays nothing and has no identity gate, precisely because nothing pays out.
--
-- The server cannot detect the edition from a request — every edition is served from
-- the same domain and origin, by design, so players never get told to go somewhere
-- else to play the same game. So the edition is asserted once at signup and STORED,
-- and every payout decision afterwards reads this column rather than anything the
-- client sent with the request. A player cannot flip it per-request to earn.
--
-- Defaults to 'web' so every existing row keeps the behaviour it already had. This
-- is deliberately the earning default: the alternative silently stops paying real
-- players, which is a worse failure than the one it would prevent.
ALTER TABLE players ADD COLUMN IF NOT EXISTS edition TEXT NOT NULL DEFAULT 'web';

-- Reject unknown values outright rather than letting a typo become a silent
-- non-earning player. Dropped and re-added so adding a future edition is a one-line
-- edit to this file, which the migrator re-runs safely (every migration here is
-- idempotent by design).
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_edition_check;
ALTER TABLE players ADD CONSTRAINT players_edition_check
  CHECK (edition IN ('web', 'minipay', 'avalanche'));

-- Payout paths filter on this on every grindable reward, so it is worth an index
-- once the MiniPay cohort is a meaningful share of the table.
CREATE INDEX IF NOT EXISTS idx_players_edition ON players (edition);
