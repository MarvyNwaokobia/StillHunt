-- Way 2 rank-up anti-farm: a "refereed XP" tally.
--
-- Rank-up pays a flat 500 G$ (see add_rank_up_rewards.sql). Ranking up is driven
-- by the `xp` counter, which is fed by EVERY mode — including the honor-system flat
-- / Endless path where the server trusts the client's "I won". That let a scripter
-- forge flat wins to farm the rank-up bonus (~2000 G$ / wallet, once).
--
-- This column accumulates XP earned ONLY from server-verified (refereed) fights:
-- session-backed Campaign fights, bot fights, and PvP. A rank-up's G$ bonus is paid
-- only when this tally justifies the rank (reaching the Nth rank needs N*1000). A
-- pure-flat scripter stays at 0 and never earns a bonus; honest progress is never
-- denied, because the counter tracks exactly the XP we can verify.
--
-- Backfill grandfathers existing players: credit them up to their current rank's
-- threshold so the new gate never retroactively withholds a rank they already hold.
-- (Only touches freshly-added rows — ranked_xp_lifetime = 0 — so it is safe to re-run.)

ALTER TABLE players ADD COLUMN IF NOT EXISTS ranked_xp_lifetime INTEGER NOT NULL DEFAULT 0;

UPDATE players SET ranked_xp_lifetime = CASE rank
    WHEN 'Silver'   THEN 1000
    WHEN 'Gold'     THEN 2000
    WHEN 'Platinum' THEN 3000
    WHEN 'Diamond'  THEN 4000
    ELSE 0
  END
  WHERE ranked_xp_lifetime = 0;
