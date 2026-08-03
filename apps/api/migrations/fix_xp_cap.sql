-- Remove the 999-XP ceiling on players.xp.
--
-- init.sql declared `xp INTEGER NOT NULL CHECK (xp >= 0 AND xp <= 999)`. That was safe
-- only while XP_PER_RANK was 1000: the bar was consumed at 1000, so xp could never
-- legally reach the ceiling. The kill-driven-XP redesign raised XP_PER_RANK to 5000
-- without migrating the constraint, so the first op that carried a player past 999
-- made award_player's main UPDATE (xp / wins / losses / rank / last_active) violate the
-- check and abort. The error was discarded, so the op looked like it counted: the
-- battle row, ranked_xp_lifetime, pve_level and the first-clear bounty all landed
-- (separate statements), while the player's rank progress silently froze forever.
--
-- The ceiling is dropped rather than raised to XP_PER_RANK: the threshold is a game
-- constant that will move again, and the DB should not be a second place to keep it in
-- sync. `xp >= 0` is the only invariant the schema actually needs.
--
-- Idempotent; safe to re-run. Run this BEFORE (or with) any deploy that carries an
-- XP_PER_RANK above 1000.

ALTER TABLE players DROP CONSTRAINT IF EXISTS players_xp_check;
ALTER TABLE players ADD CONSTRAINT players_xp_check CHECK (xp >= 0);
