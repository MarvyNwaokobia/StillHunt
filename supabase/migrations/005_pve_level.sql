-- ============================================================
-- 005 · PvE Campaign progress
-- ============================================================
-- Tracks the highest Campaign level a player has cleared. The next playable level
-- is pve_level + 1; levels <= pve_level are replayable for XP. Advanced server-side
-- on a first clear (see complete_live_fight in apps/api).

ALTER TABLE players ADD COLUMN IF NOT EXISTS pve_level INTEGER NOT NULL DEFAULT 0;
