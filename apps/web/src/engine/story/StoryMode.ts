import { ZoneSystem, type Zone, type Chapter } from '../world/ZoneSystem';
import type { DialogueLine, StoryScene } from './StoryPanel';

export enum StoryPhase {
  ChapterIntro = 'chapterIntro',
  PreBattleDialogue = 'preBattleDialogue',
  Combat = 'combat',
  PostBattleDialogue = 'postBattleDialogue',
  Victory = 'victory',
  Defeat = 'defeat',
  ChapterComplete = 'chapterComplete',
  GameComplete = 'gameComplete',
}

export interface StoryState {
  phase: StoryPhase;
  currentChapter: Chapter;
  currentZone: Zone;
  currentEnemyIdx: number;
  totalXPEarned: number;
  totalGoldEarned: number;
  deaths: number;
}

export type StoryEventListener = (phase: StoryPhase, state: StoryState) => void;

export class StoryMode {
  private zoneSystem: ZoneSystem;
  private state: StoryState;
  private listeners: StoryEventListener[] = [];

  constructor() {
    this.zoneSystem = new ZoneSystem();
    this.state = {
      phase: StoryPhase.ChapterIntro,
      currentChapter: this.zoneSystem.currentChapter,
      currentZone: this.zoneSystem.currentZone,
      currentEnemyIdx: 0,
      totalXPEarned: 0,
      totalGoldEarned: 0,
      deaths: 0,
    };
  }

  get currentState(): StoryState {
    return { ...this.state };
  }

  get zones(): ZoneSystem {
    return this.zoneSystem;
  }

  onPhaseChange(listener: StoryEventListener) {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  startChapter() {
    this.setPhase(StoryPhase.ChapterIntro);
  }

  onChapterIntroComplete() {
    this.syncZone();
    if (this.state.currentZone.dialogueBefore) {
      this.setPhase(StoryPhase.PreBattleDialogue);
    } else {
      this.setPhase(StoryPhase.Combat);
    }
  }

  onPreBattleDialogueComplete() {
    this.setPhase(StoryPhase.Combat);
  }

  onBattleWon() {
    this.state.totalXPEarned += this.state.currentZone.rewardXP;
    this.state.totalGoldEarned += this.state.currentZone.rewardGold;

    const zone = this.state.currentZone;

    if (this.state.currentEnemyIdx < zone.enemies.length - 1) {
      this.state.currentEnemyIdx++;
      this.setPhase(StoryPhase.Combat);
      return;
    }

    this.zoneSystem.completeZone(zone.id);

    if (zone.dialogueAfter) {
      this.setPhase(StoryPhase.PostBattleDialogue);
    } else {
      this.advanceAfterVictory();
    }
  }

  onPostBattleDialogueComplete() {
    this.advanceAfterVictory();
  }

  onBattleLost() {
    this.state.deaths++;
    this.setPhase(StoryPhase.Defeat);
  }

  onRetry() {
    this.state.currentEnemyIdx = 0;
    this.setPhase(StoryPhase.Combat);
  }

  getPreBattleScene(): StoryScene | null {
    const zone = this.state.currentZone;
    if (!zone.dialogueBefore) return null;

    return {
      id: `${zone.id}_pre`,
      lines: this.parseDialogue(zone.dialogueBefore, zone),
    };
  }

  getPostBattleScene(): StoryScene | null {
    const zone = this.state.currentZone;
    if (!zone.dialogueAfter) return null;

    return {
      id: `${zone.id}_post`,
      lines: this.parseDialogue(zone.dialogueAfter, zone),
    };
  }

  getCurrentEnemy() {
    return this.state.currentZone.enemies[this.state.currentEnemyIdx] ?? null;
  }

  private advanceAfterVictory() {
    this.setPhase(StoryPhase.Victory);

    setTimeout(() => {
      if (this.zoneSystem.advanceToNextZone()) {
        this.syncZone();
        this.state.currentEnemyIdx = 0;

        if (this.state.currentZone.dialogueBefore) {
          this.setPhase(StoryPhase.PreBattleDialogue);
        } else {
          this.setPhase(StoryPhase.Combat);
        }
      } else if (this.zoneSystem.advanceToNextChapter()) {
        this.syncZone();
        this.state.currentEnemyIdx = 0;
        this.setPhase(StoryPhase.ChapterComplete);
      } else {
        this.setPhase(StoryPhase.GameComplete);
      }
    }, 2000);
  }

  private syncZone() {
    this.state.currentChapter = this.zoneSystem.currentChapter;
    this.state.currentZone = this.zoneSystem.currentZone;
  }

  private setPhase(phase: StoryPhase) {
    this.state.phase = phase;
    for (const listener of this.listeners) {
      listener(phase, { ...this.state });
    }
  }

  private parseDialogue(text: string, zone: Zone): DialogueLine[] {
    const enemy = zone.enemies[0];
    const lines = text.split('\n').filter((l) => l.trim());

    return lines.map((line) => {
      const trimmed = line.trim();

      if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        return {
          speaker: enemy?.name ?? 'Unknown',
          text: trimmed.slice(1, -1),
          speakerColor: this.getClassColor(enemy?.classId),
        };
      }

      return { text: trimmed };
    });
  }

  private getClassColor(classId?: string): string {
    switch (classId) {
      case 'berserker': return '#ff4422';
      case 'sentinel': return '#4488ff';
      case 'phantom': return '#aa44ff';
      default: return '#ffffff';
    }
  }
}
