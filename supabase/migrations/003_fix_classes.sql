-- StillHunt — Fix character class names
-- The frontend class system was renamed after the initial schema was written.
-- Old: Warrior, Mage, Archer, Rogue, Paladin
-- New: Berserker, Sentinel, Phantom, Warden, Specter, Vanguard
-- Players with null character_class (created before the class system) default to Sentinel.

ALTER TABLE players DROP CONSTRAINT IF EXISTS players_character_class_check;

ALTER TABLE players
  ADD CONSTRAINT players_character_class_check
  CHECK (character_class IN ('Berserker', 'Sentinel', 'Phantom', 'Warden', 'Specter', 'Vanguard'));

UPDATE players SET character_class = 'Sentinel' WHERE character_class IS NULL;
