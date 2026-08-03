import type { EnemySpawn } from '../world/ZoneSystem';
import { AIDifficulty } from '../combat';

export interface WaveConfig {
  enemies: WaveEnemy[];
  restDuration: number;
  isMiniBoss: boolean;
  isBoss: boolean;
}

export interface WaveEnemy {
  spawn: EnemySpawn;
  aiDifficulty: AIDifficulty;
  healthMultiplier: number;
  damageMultiplier: number;
  entranceDelay: number;
}

export enum WavePhase {
  Waiting = 'waiting',
  Entering = 'entering',
  Fighting = 'fighting',
  Cleared = 'cleared',
  Rest = 'rest',
  AllCleared = 'allCleared',
}

const DIFFICULTY_MAP: Record<string, AIDifficulty> = {
  easy: AIDifficulty.Easy,
  medium: AIDifficulty.Medium,
  hard: AIDifficulty.Hard,
  boss: AIDifficulty.Boss,
};

export class WaveSystem {
  private waves: WaveConfig[] = [];
  private currentWaveIdx = 0;
  private phase: WavePhase = WavePhase.Waiting;

  private activeEnemies: Set<string> = new Set();
  private defeatedCount = 0;

  private onWaveEvent?: (phase: WavePhase, waveIdx: number, totalWaves: number) => void;

  buildWaves(enemies: EnemySpawn[]): WaveConfig[] {
    const waves: WaveConfig[] = [];

    let currentWave: WaveEnemy[] = [];
    let isBossWave = false;

    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      const isBoss = enemy.difficulty === 'boss';
      const isMiniBoss = enemy.level >= 7 && !isBoss;

      if (isBoss && currentWave.length > 0) {
        waves.push({
          enemies: currentWave,
          restDuration: 2,
          isMiniBoss: false,
          isBoss: false,
        });
        currentWave = [];
      }

      const levelScale = 1 + (enemy.level - 1) * 0.15;

      currentWave.push({
        spawn: enemy,
        aiDifficulty: DIFFICULTY_MAP[enemy.difficulty] ?? AIDifficulty.Medium,
        healthMultiplier: isBoss ? 2.5 : isMiniBoss ? 1.8 : levelScale,
        damageMultiplier: isBoss ? 1.8 : isMiniBoss ? 1.4 : levelScale,
        entranceDelay: currentWave.length * 0.5,
      });

      if (isBoss || i === enemies.length - 1) {
        waves.push({
          enemies: currentWave,
          restDuration: isBoss ? 3 : 2,
          isMiniBoss: isMiniBoss,
          isBoss: isBoss || isBossWave,
        });
        currentWave = [];
        isBossWave = false;
      }
    }

    this.waves = waves;
    this.currentWaveIdx = 0;
    this.phase = WavePhase.Waiting;
    return waves;
  }

  setOnWaveEvent(cb: (phase: WavePhase, waveIdx: number, totalWaves: number) => void) {
    this.onWaveEvent = cb;
  }

  get currentWave(): WaveConfig | null {
    return this.waves[this.currentWaveIdx] ?? null;
  }

  get currentPhase(): WavePhase {
    return this.phase;
  }

  get waveNumber(): number {
    return this.currentWaveIdx + 1;
  }

  get totalWaves(): number {
    return this.waves.length;
  }

  startWave() {
    this.phase = WavePhase.Entering;
    this.activeEnemies.clear();
    this.defeatedCount = 0;

    const wave = this.currentWave;
    if (wave) {
      wave.enemies.forEach((_, i) => {
        this.activeEnemies.add(`wave_enemy_${i}`);
      });
    }

    this.emitEvent();

    setTimeout(() => {
      this.phase = WavePhase.Fighting;
      this.emitEvent();
    }, 1500);
  }

  onEnemyDefeated(enemyId: string) {
    this.activeEnemies.delete(enemyId);
    this.defeatedCount++;

    if (this.activeEnemies.size === 0) {
      this.phase = WavePhase.Cleared;
      this.emitEvent();

      const restDuration = this.currentWave?.restDuration ?? 2;

      setTimeout(() => {
        if (this.currentWaveIdx < this.waves.length - 1) {
          this.phase = WavePhase.Rest;
          this.emitEvent();

          setTimeout(() => {
            this.currentWaveIdx++;
            this.startWave();
          }, restDuration * 1000);
        } else {
          this.phase = WavePhase.AllCleared;
          this.emitEvent();
        }
      }, 500);
    }
  }

  get isComplete(): boolean {
    return this.phase === WavePhase.AllCleared;
  }

  get isBossWave(): boolean {
    return this.currentWave?.isBoss ?? false;
  }

  get remainingEnemies(): number {
    return this.activeEnemies.size;
  }

  reset() {
    this.currentWaveIdx = 0;
    this.phase = WavePhase.Waiting;
    this.activeEnemies.clear();
    this.defeatedCount = 0;
  }

  private emitEvent() {
    this.onWaveEvent?.(this.phase, this.currentWaveIdx, this.waves.length);
  }
}
