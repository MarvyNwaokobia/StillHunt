-- Rank ladder renamed to StillHunt's own.
--
--   Iron → Drifter    Bronze → Tracker   Silver → Stalker  Gold → Marksman
--   Platinum → Ranger Emerald → Ghost    Diamond → Apex
--
-- The ladder escalates by CAPABILITY rather than by metal: a Drifter wanders, a
-- Tracker reads sign, a Stalker closes unseen, a Marksman makes the shot. Same
-- seven tiers, same thresholds, same order — only the labels move.
--
-- ORDER MATTERS BELOW. The constraint is dropped BEFORE the rows are rewritten:
-- an UPDATE to a value the old CHECK forbids fails, and the new CHECK cannot be
-- added while rows still hold old names. Drop, rewrite, re-add.
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_rank_check;

UPDATE players SET rank = CASE rank
    WHEN 'Iron'     THEN 'Drifter'
    WHEN 'Bronze'   THEN 'Tracker'
    WHEN 'Silver'   THEN 'Stalker'
    WHEN 'Gold'     THEN 'Marksman'
    WHEN 'Platinum' THEN 'Ranger'
    WHEN 'Emerald'  THEN 'Ghost'
    WHEN 'Diamond'  THEN 'Apex'
    ELSE rank
END
WHERE rank IN ('Iron','Bronze','Silver','Gold','Platinum','Emerald','Diamond');

ALTER TABLE players ADD CONSTRAINT players_rank_check
  CHECK (rank = ANY (ARRAY['Drifter','Tracker','Stalker','Marksman','Ranger','Ghost','Apex']));

ALTER TABLE players ALTER COLUMN rank SET DEFAULT 'Drifter';

-- Rank-up rewards are keyed by rank name, and that key is the idempotency guard —
-- a row left under an old name would let the same rank pay a second time.
UPDATE rank_up_rewards SET rank = CASE rank
    WHEN 'Iron'     THEN 'Drifter'
    WHEN 'Bronze'   THEN 'Tracker'
    WHEN 'Silver'   THEN 'Stalker'
    WHEN 'Gold'     THEN 'Marksman'
    WHEN 'Platinum' THEN 'Ranger'
    WHEN 'Emerald'  THEN 'Ghost'
    WHEN 'Diamond'  THEN 'Apex'
    ELSE rank
END
WHERE rank IN ('Iron','Bronze','Silver','Gold','Platinum','Emerald','Diamond');

-- Same for accrual refs, which embed the rank name (`rank_up:{wallet}:{rank}`).
UPDATE earnings
   SET ref = replace(replace(replace(replace(replace(replace(replace(
             ref, 'rank_up:', 'rank_up:'),
             ':Iron', ':Drifter'), ':Bronze', ':Tracker'), ':Silver', ':Stalker'),
             ':Gold', ':Marksman'), ':Platinum', ':Ranger'), ':Emerald', ':Ghost')
 WHERE category = 'rank_up';
UPDATE earnings SET ref = replace(ref, ':Diamond', ':Apex')
 WHERE category = 'rank_up';
