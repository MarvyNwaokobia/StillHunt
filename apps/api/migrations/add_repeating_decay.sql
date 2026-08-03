-- Decay that keeps going, and a leaderboard that rewards showing up.
--
-- The old sweep demoted a player ONE rank and then never touched them again: its WHERE
-- clause excluded `decay_status = 'active'`, which is the very status the demotion sets.
-- Live proof before this change: every inactive player sat at 'active' having dropped
-- exactly one rank, some idle for over 8 days. A Diamond who walked away stayed
-- Platinum forever and kept sitting at the top of the War Board.
--
-- Decay is now a repeating step: one rank per DECAY_STEP_HOURS of continued absence.
-- `last_decay_at` is what makes that safe. Without it the sweep has no memory, so
-- running it twice in one hour (the cron is duplicated + drifts, and it can be triggered
-- by hand) would demote twice. With it, a step is taken only when the previous step is
-- itself older than the interval, so the sweep is safe to run as often as you like.
--
-- NULL means "never decayed", which correctly allows a first step as soon as the grace
-- period has passed.
--
-- Idempotent; safe to re-run.

ALTER TABLE players ADD COLUMN IF NOT EXISTS last_decay_at TIMESTAMPTZ;

-- Existing decayed players: treat their last known activity as the moment they last
-- stepped down. That way the very next sweep does not instantly punish everyone who was
-- stuck at 'active' under the old one-shot rule for a second time in the same instant;
-- they resume stepping on the normal schedule from where they actually stopped.
UPDATE players
   SET last_decay_at = last_active
 WHERE last_decay_at IS NULL
   AND decay_status = 'active';

-- The leaderboard sorts active players above idle ones and reads last_active for every
-- row, so give it an index rather than a full scan on every War Board load.
CREATE INDEX IF NOT EXISTS idx_players_last_active_rank
    ON players (last_active DESC, rank, xp DESC);
