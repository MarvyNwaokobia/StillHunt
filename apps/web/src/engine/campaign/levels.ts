/**
 * @module campaign/levels
 * @description The PvE Campaign Ladder — 15 hand-tuned levels (expandable).
 *
 * XP BUDGET: winning all 15 levels awards exactly 1,000 XP = one rank-up.
 * Losing a level still grants scaled XP (roughly 1/3 of the win reward) so
 * players who struggle can still grind toward 1,000 XP — it just takes more
 * attempts, which drives them toward the marketplace for better guns (the
 * core economic loop).
 *
 * Difficulty ramps on four axes AT ONCE — enemy gun tier, AIDifficulty, HP
 * multiplier and class — so a higher level FEELS harder, not just bigger-
 * numbered. Bosses sit on every 5th level (5/10/15): more HP, a signature
 * gun, their own stage. TALLY comes solely from the existing rank-up at 1000 XP.
 *
 * Beyond level 15 the player unlocks Endless mode (separate module) for the
 * all-time + weekly leaderboards.
 */

import { AIDifficulty } from '../combat';
import type { GunId } from '../combat/GunStats';
import type { StageId } from '../scene/ArenaStage';
import type { ClassId } from '../sim/CombatSim';

export interface CampaignLevel {
  level: number;
  name: string;
  enemyClass: ClassId;
  enemyGun: GunId;
  enemyHpMult: number;
  difficulty: AIDifficulty;
  xpReward: number;       // XP awarded on a WIN
  lossXp: number;         // XP awarded on a LOSS (still rewards the attempt)
  isBoss: boolean;
  stageId: StageId;
}

/** Clear this level → Endless mode unlocks. */
export const ENDLESS_UNLOCK_LEVEL = 15;

//                                                           WIN  LOSS
// Zone 1 · Ashfall  (learn to shoot)     1-5  total win:  280    total loss: ~92
// Zone 2 · Proving Ground (guns ramp)    6-10 total win:  320    total loss: ~108
// Zone 3 · The Rift (endgame hardware)  11-15 total win:  400    total loss: ~140
// GRAND TOTAL WIN:                              1,000
export const CAMPAIGN_LEVELS: readonly CampaignLevel[] = [
  // ── Zone 1 · Ashfall (lava_arena) — learn to shoot & dodge ──
  { level: 1,  name: 'First Contact', enemyClass: 'sentinel',  enemyGun: 'sidearm',       enemyHpMult: 0.9, difficulty: AIDifficulty.Easy,   xpReward: 50,  lossXp: 15, isBoss: false, stageId: 'lava_arena' },
  { level: 2,  name: 'Skirmish',      enemyClass: 'phantom',   enemyGun: 'sidearm',       enemyHpMult: 1.0, difficulty: AIDifficulty.Easy,   xpReward: 52,  lossXp: 16, isBoss: false, stageId: 'lava_arena' },
  { level: 3,  name: 'Pressure',      enemyClass: 'berserker', enemyGun: 'sidearm',       enemyHpMult: 1.1, difficulty: AIDifficulty.Medium, xpReward: 54,  lossXp: 17, isBoss: false, stageId: 'lava_arena' },
  { level: 4,  name: 'Spray',         enemyClass: 'phantom',   enemyGun: 'smg',           enemyHpMult: 1.1, difficulty: AIDifficulty.Medium, xpReward: 56,  lossXp: 18, isBoss: false, stageId: 'lava_arena' },
  { level: 5,  name: 'BOSS · Cinder', enemyClass: 'berserker', enemyGun: 'smg',           enemyHpMult: 1.6, difficulty: AIDifficulty.Hard,   xpReward: 68,  lossXp: 22, isBoss: true,  stageId: 'lava_arena' },

  // ── Zone 2 · The Proving Ground (battle_arena) — guns get serious ──
  { level: 6,  name: 'Regroup',       enemyClass: 'sentinel',  enemyGun: 'smg',           enemyHpMult: 1.2, difficulty: AIDifficulty.Medium, xpReward: 58,  lossXp: 19, isBoss: false, stageId: 'battle_arena' },
  { level: 7,  name: 'Rifle Drill',   enemyClass: 'berserker', enemyGun: 'assault_rifle', enemyHpMult: 1.3, difficulty: AIDifficulty.Medium, xpReward: 60,  lossXp: 20, isBoss: false, stageId: 'battle_arena' },
  { level: 8,  name: 'Crossfire',     enemyClass: 'phantom',   enemyGun: 'assault_rifle', enemyHpMult: 1.4, difficulty: AIDifficulty.Hard,   xpReward: 62,  lossXp: 20, isBoss: false, stageId: 'battle_arena' },
  { level: 9,  name: 'No Cover',      enemyClass: 'sentinel',  enemyGun: 'assault_rifle', enemyHpMult: 1.5, difficulty: AIDifficulty.Hard,   xpReward: 65,  lossXp: 21, isBoss: false, stageId: 'battle_arena' },
  { level: 10, name: 'BOSS · Warden', enemyClass: 'sentinel',  enemyGun: 'assault_rifle', enemyHpMult: 2.0, difficulty: AIDifficulty.Hard,   xpReward: 75,  lossXp: 25, isBoss: true,  stageId: 'battle_arena' },

  // ── Zone 3 · The Rift (scifi_stage) — top-tier hardware ──
  { level: 11, name: 'Long Shots',    enemyClass: 'phantom',   enemyGun: 'marksman',      enemyHpMult: 1.5, difficulty: AIDifficulty.Hard,   xpReward: 68,  lossXp: 22, isBoss: false, stageId: 'scifi_stage' },
  { level: 12, name: 'Deadeye',       enemyClass: 'berserker', enemyGun: 'marksman',      enemyHpMult: 1.6, difficulty: AIDifficulty.Hard,   xpReward: 72,  lossXp: 24, isBoss: false, stageId: 'scifi_stage' },
  { level: 13, name: 'Prototype',     enemyClass: 'sentinel',  enemyGun: 'legendary',     enemyHpMult: 1.7, difficulty: AIDifficulty.Hard,   xpReward: 76,  lossXp: 25, isBoss: false, stageId: 'scifi_stage' },
  { level: 14, name: 'Last Stand',    enemyClass: 'phantom',   enemyGun: 'legendary',     enemyHpMult: 1.8, difficulty: AIDifficulty.Boss,   xpReward: 80,  lossXp: 27, isBoss: false, stageId: 'scifi_stage' },
  { level: 15, name: 'BOSS · StillHunt',  enemyClass: 'berserker', enemyGun: 'legendary',     enemyHpMult: 2.4, difficulty: AIDifficulty.Boss,   xpReward: 104, lossXp: 34, isBoss: true,  stageId: 'scifi_stage' },
];

export const CAMPAIGN_LENGTH = CAMPAIGN_LEVELS.length;

export function getLevel(n: number): CampaignLevel | undefined {
  return CAMPAIGN_LEVELS.find((l) => l.level === n);
}

export function getLossXp(n: number): number {
  return getLevel(n)?.lossXp ?? 15;
}

// ── Endless mode ────────────────────────────────────────────────────────────
const ENDLESS_CLASSES: ClassId[] = ['berserker', 'sentinel', 'phantom'];
const ENDLESS_STAGES: StageId[] = ['lava_arena', 'battle_arena', 'scifi_stage', 'industrial_hangar'];

/**
 * Synthetic, infinitely-scaling enemy for Endless wave `w` (1-based). Always the
 * top-tier gun + Boss AI, with HP ramping each wave. Not a Campaign level — Endless
 * tracks a leaderboard score (waves survived), not pve_level unlocks.
 */
export function endlessLevel(w: number): CampaignLevel {
  return {
    level: w,
    name: `Wave ${w}`,
    enemyClass: ENDLESS_CLASSES[w % ENDLESS_CLASSES.length],
    enemyGun: 'legendary',
    enemyHpMult: 1.8 + w * 0.22,
    difficulty: AIDifficulty.Boss,
    xpReward: 50,
    lossXp: 15,
    isBoss: w % 5 === 0,
    stageId: ENDLESS_STAGES[w % ENDLESS_STAGES.length],
  };
}
