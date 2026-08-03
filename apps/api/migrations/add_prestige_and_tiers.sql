-- Rank ladder v2: two new tiers + prestige past the top.
--
-- Ladder goes from 5 tiers to 7: IRON (new bottom) and EMERALD (new, before Diamond),
-- so the climb is Iron→Bronze→Silver→Gold→Platinum→Emerald→Diamond = 6 rank-ups.
-- Past Diamond, players PRESTIGE: each full 1000-XP bar increments prestige_level and
-- pays the same 500 G$, uncapped, instead of the old code deleting the XP and paying
-- nothing (the Diamond XP-delete bug this fixes).
--
-- Idempotent; safe to re-run. Run this BEFORE deploying the code that reads
-- prestige_level or writes the new ranks.

-- 1. Allow the two new ranks.
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_rank_check;
ALTER TABLE players ADD CONSTRAINT players_rank_check
  CHECK (rank = ANY (ARRAY['Iron','Bronze','Silver','Gold','Platinum','Emerald','Diamond']));

-- 2. Prestige counter. 0 for everyone until they climb past Diamond.
ALTER TABLE players ADD COLUMN IF NOT EXISTS prestige_level INT NOT NULL DEFAULT 0;

-- 3. New players now start at IRON, not Bronze.
ALTER TABLE players ALTER COLUMN rank SET DEFAULT 'Iron';

-- 3b. Make this file self-sufficient. The UPDATE below reads `ranked_xp_lifetime`, but the
--     migration that CREATES that column (add_ranked_xp_lifetime.sql) sorts AFTER this one,
--     and alphabetical order is the run order. Against prod that never showed, because prod
--     was baselined by hand with every column already present. Against a genuinely fresh
--     database — a new environment, a staging box, a restore from backup — this file used to
--     abort with `column "ranked_xp_lifetime" does not exist`, and migrate.rs fails boot on a
--     migration error by design, so the API would not start at all.
--
--     Adding the column here rather than reordering the list keeps the alphabetical invariant
--     that migrate.rs's test enforces. add_ranked_xp_lifetime.sql stays correct and becomes a
--     no-op for the ALTER; its own backfill only touches rows still at 0, so it cannot undo
--     the GREATEST() credit below.
ALTER TABLE players ADD COLUMN IF NOT EXISTS ranked_xp_lifetime INTEGER NOT NULL DEFAULT 0;

-- 4. Re-grandfather the Way-2 anti-forgery tally. ranked_xp_lifetime gates a rank-up's
--    G$ bonus (a rank pays only when the refereed tally justifies it). The ordinals just
--    shifted up (Diamond went from the 4th rank-up to the 6th), so without this an honest
--    player's NEXT bonus would be wrongly withheld. Credit each existing player up to the
--    ordinal of the rank they ALREADY hold. GREATEST() never lowers anyone.
--    Ordinals: Iron 0, Bronze 1, Silver 2, Gold 3, Platinum 4, Emerald 5, Diamond 6.
UPDATE players SET ranked_xp_lifetime = GREATEST(ranked_xp_lifetime, 1000 * CASE rank
  WHEN 'Iron'     THEN 0
  WHEN 'Bronze'   THEN 1
  WHEN 'Silver'   THEN 2
  WHEN 'Gold'     THEN 3
  WHEN 'Platinum' THEN 4
  WHEN 'Emerald'  THEN 5
  WHEN 'Diamond'  THEN 6
  ELSE 0 END);
