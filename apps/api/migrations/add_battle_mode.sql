-- Record on each battle row WHICH game mode produced it, and whether it counted on
-- the player's W/L tally.
--
-- Why this is needed: every mode persists through the same `persist_battle` helper,
-- so an Endless wave and a Campaign op land as structurally identical rows
-- (challenger = player, opponent = 'bot', is_bot = true). But Endless deliberately
-- calls award_player with count_result = false — waves award XP and can rank you up,
-- yet must not each register as a "win" on the profile.
--
-- Nothing recorded that distinction, so anything reading the battle ledger had to
-- ASSUME every row counted. The consistency check did exactly that and reported the
-- only two Endless players in the game as having corrupt win counts, on every
-- 15-minute tick. Their counts were correct; the ledger just wasn't self-describing.
--
-- Both columns are NULLABLE and deliberately NOT backfilled. In the 264 rows that
-- predate this migration an Endless wave and a Campaign op are genuinely
-- indistinguishable, so any backfill would be a guess written down as fact. NULL
-- means "written before intent was recorded" and readers must treat it as unknown
-- rather than assume it counted.
ALTER TABLE battles ADD COLUMN IF NOT EXISTS mode TEXT;
ALTER TABLE battles ADD COLUMN IF NOT EXISTS counts_result BOOLEAN;

COMMENT ON COLUMN battles.mode IS
  'Game mode that produced this row: campaign | bot | pvp | endless. NULL = pre-dates the column.';
COMMENT ON COLUMN battles.counts_result IS
  'Did this battle increment players.wins/losses? Mirrors award_player''s count_result. NULL = unknown (legacy row).';

-- Endless is the mode this was added for, and the one most likely to be queried on
-- its own (per-mode history, wave analytics), so index the non-legacy rows.
CREATE INDEX IF NOT EXISTS idx_battles_mode ON battles (mode, created_at) WHERE mode IS NOT NULL;
