export interface PlayerProgression {
  level: number;
  xp: number;
  xpToNextLevel: number;
  totalXP: number;
  gold: number;
  completedChapters: string[];
  completedZones: string[];
  unlockedClasses: string[];
  unlockedStages: string[];
  stats: CombatStats;
}

export interface CombatStats {
  totalFights: number;
  wins: number;
  losses: number;
  longestCombo: number;
  totalDamageDealt: number;
  totalDamageTaken: number;
  perfectWins: number;
  bossesDefeated: number;
  fastestWin: number;
}

export interface RewardSummary {
  xpGained: number;
  goldGained: number;
  leveledUp: boolean;
  newLevel: number;
  unlocks: string[];
  bonuses: { label: string; value: number }[];
}

function xpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.5, level - 1));
}

const LEVEL_UNLOCKS: Record<number, string[]> = {
  2: ['Combo Training unlocked'],
  3: ['Challenge Mode unlocked'],
  5: ['Chapter 2 unlocked', 'New arena: The Nexus'],
  7: ['Ranked PvP unlocked'],
  10: ['Prestige system unlocked'],
};

export class Progression {
  private state: PlayerProgression;
  private onUpdate?: (state: PlayerProgression) => void;

  constructor() {
    this.state = {
      level: 1,
      xp: 0,
      xpToNextLevel: xpForLevel(1),
      totalXP: 0,
      gold: 0,
      completedChapters: [],
      completedZones: [],
      unlockedClasses: ['berserker', 'sentinel', 'phantom'],
      unlockedStages: ['battle_arena'],
      stats: {
        totalFights: 0,
        wins: 0,
        losses: 0,
        longestCombo: 0,
        totalDamageDealt: 0,
        totalDamageTaken: 0,
        perfectWins: 0,
        bossesDefeated: 0,
        fastestWin: Infinity,
      },
    };
  }

  get current(): PlayerProgression {
    return { ...this.state };
  }

  setOnUpdate(cb: (state: PlayerProgression) => void) {
    this.onUpdate = cb;
  }

  awardBattleRewards(params: {
    xp: number;
    gold: number;
    won: boolean;
    comboMax: number;
    damageDealt: number;
    damageTaken: number;
    isBoss: boolean;
    fightDuration: number;
    perfectWin: boolean;
  }): RewardSummary {
    const bonuses: { label: string; value: number }[] = [];
    let totalXP = params.xp;
    let totalGold = params.gold;

    if (params.won) {
      this.state.stats.wins++;

      if (params.perfectWin) {
        const bonus = Math.floor(params.xp * 0.5);
        totalXP += bonus;
        bonuses.push({ label: 'Perfect Win', value: bonus });
        this.state.stats.perfectWins++;
      }

      if (params.comboMax >= 5) {
        const bonus = params.comboMax * 5;
        totalXP += bonus;
        bonuses.push({ label: `${params.comboMax}-Hit Combo`, value: bonus });
      }

      if (params.isBoss) {
        const bonus = Math.floor(params.xp * 0.3);
        totalXP += bonus;
        totalGold += Math.floor(params.gold * 0.5);
        bonuses.push({ label: 'Boss Slayer', value: bonus });
        this.state.stats.bossesDefeated++;
      }

      if (params.fightDuration < 30) {
        const bonus = Math.floor(params.xp * 0.2);
        totalXP += bonus;
        bonuses.push({ label: 'Speed Kill', value: bonus });
      }

      if (params.fightDuration < this.state.stats.fastestWin) {
        this.state.stats.fastestWin = params.fightDuration;
      }
    } else {
      this.state.stats.losses++;
      totalXP = Math.floor(totalXP * 0.3);
      totalGold = Math.floor(totalGold * 0.1);
    }

    this.state.stats.totalFights++;
    this.state.stats.totalDamageDealt += params.damageDealt;
    this.state.stats.totalDamageTaken += params.damageTaken;

    if (params.comboMax > this.state.stats.longestCombo) {
      this.state.stats.longestCombo = params.comboMax;
    }

    const prevLevel = this.state.level;
    this.state.totalXP += totalXP;
    this.state.xp += totalXP;
    this.state.gold += totalGold;

    const unlocks: string[] = [];
    while (this.state.xp >= this.state.xpToNextLevel) {
      this.state.xp -= this.state.xpToNextLevel;
      this.state.level++;
      this.state.xpToNextLevel = xpForLevel(this.state.level);

      const levelUnlocks = LEVEL_UNLOCKS[this.state.level];
      if (levelUnlocks) {
        unlocks.push(...levelUnlocks);
      }
    }

    const leveledUp = this.state.level > prevLevel;

    this.onUpdate?.(this.current);

    return {
      xpGained: totalXP,
      goldGained: totalGold,
      leveledUp,
      newLevel: this.state.level,
      unlocks,
      bonuses,
    };
  }

  completeZone(zoneId: string, stageId: string) {
    if (!this.state.completedZones.includes(zoneId)) {
      this.state.completedZones.push(zoneId);
    }
    if (!this.state.unlockedStages.includes(stageId)) {
      this.state.unlockedStages.push(stageId);
    }
    this.onUpdate?.(this.current);
  }

  completeChapter(chapterId: string) {
    if (!this.state.completedChapters.includes(chapterId)) {
      this.state.completedChapters.push(chapterId);
    }
    this.onUpdate?.(this.current);
  }

  save(): string {
    return JSON.stringify(this.state);
  }

  load(data: string) {
    try {
      this.state = JSON.parse(data);
      this.onUpdate?.(this.current);
    } catch {
      // corrupt save, keep current state
    }
  }
}
