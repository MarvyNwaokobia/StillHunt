import type { StageId } from '../scene/ArenaStage';

export enum ZoneType {
  Combat = 'combat',
  Exploration = 'exploration',
  Boss = 'boss',
  Cutscene = 'cutscene',
  Hub = 'hub',
}

export interface EnemySpawn {
  classId: 'berserker' | 'sentinel' | 'phantom';
  difficulty: 'easy' | 'medium' | 'hard' | 'boss';
  name: string;
  level: number;
}

export interface Zone {
  id: string;
  name: string;
  type: ZoneType;
  stageId: StageId;
  enemies: EnemySpawn[];
  nextZoneId: string | null;
  prevZoneId: string | null;
  unlockCondition?: string;
  rewardXP: number;
  rewardGold: number;
  dialogueBefore?: string;
  dialogueAfter?: string;
  isBoss: boolean;
}

export interface Chapter {
  id: string;
  name: string;
  description: string;
  zones: Zone[];
  unlockCondition?: string;
}

const CHAPTER_1: Chapter = {
  id: 'ch1',
  name: 'The Awakening',
  description: 'You awaken in the Sanctum with no memory. Only your fists and instinct remain.',
  zones: [
    {
      id: 'ch1_z1',
      name: 'Training Grounds',
      type: ZoneType.Combat,
      stageId: 'battle_arena',
      enemies: [
        { classId: 'sentinel', difficulty: 'easy', name: 'Training Sentinel', level: 1 },
      ],
      nextZoneId: 'ch1_z2',
      prevZoneId: null,
      rewardXP: 50,
      rewardGold: 10,
      dialogueBefore: 'A figure stands before you. "Show me what you remember."',
      dialogueAfter: '"Not bad. But the real fights are ahead."',
      isBoss: false,
    },
    {
      id: 'ch1_z2',
      name: 'The Burning Path',
      type: ZoneType.Combat,
      stageId: 'lava_arena',
      enemies: [
        { classId: 'berserker', difficulty: 'easy', name: 'Rogue Berserker', level: 2 },
        { classId: 'berserker', difficulty: 'medium', name: 'Fire Marauder', level: 3 },
      ],
      nextZoneId: 'ch1_z3',
      prevZoneId: 'ch1_z1',
      rewardXP: 100,
      rewardGold: 25,
      dialogueBefore: 'The ground trembles. Something lurks in the molten depths.',
      isBoss: false,
    },
    {
      id: 'ch1_z3',
      name: 'Shadow Crossing',
      type: ZoneType.Combat,
      stageId: 'scifi_stage',
      enemies: [
        { classId: 'phantom', difficulty: 'medium', name: 'Void Stalker', level: 3 },
        { classId: 'phantom', difficulty: 'medium', name: 'Shadow Dancer', level: 4 },
      ],
      nextZoneId: 'ch1_boss',
      prevZoneId: 'ch1_z2',
      rewardXP: 150,
      rewardGold: 40,
      dialogueBefore: 'The air shimmers. You are not alone in this dimension.',
      isBoss: false,
    },
    {
      id: 'ch1_boss',
      name: 'The Warden',
      type: ZoneType.Boss,
      stageId: 'rpg_environment',
      enemies: [
        { classId: 'sentinel', difficulty: 'boss', name: 'Warden Kael', level: 5 },
      ],
      nextZoneId: null,
      prevZoneId: 'ch1_z3',
      rewardXP: 300,
      rewardGold: 100,
      dialogueBefore: '"You\'ve come far, warrior. But no one passes the Warden."',
      dialogueAfter: '"Impossible... You are the one the prophecy spoke of."',
      isBoss: true,
    },
  ],
};

const CHAPTER_2: Chapter = {
  id: 'ch2',
  name: 'The Fracture',
  description: 'The world cracks. New enemies emerge from the rift between realms.',
  unlockCondition: 'ch1_complete',
  zones: [
    {
      id: 'ch2_z1',
      name: 'Rift Gate',
      type: ZoneType.Combat,
      stageId: 'scifi_stage',
      enemies: [
        { classId: 'phantom', difficulty: 'medium', name: 'Rift Walker', level: 5 },
        { classId: 'berserker', difficulty: 'medium', name: 'Rift Breaker', level: 6 },
      ],
      nextZoneId: 'ch2_z2',
      prevZoneId: null,
      rewardXP: 200,
      rewardGold: 50,
      dialogueBefore: 'The rift tears open. Creatures pour through.',
      isBoss: false,
    },
    {
      id: 'ch2_z2',
      name: 'The Forge',
      type: ZoneType.Combat,
      stageId: 'lava_arena',
      enemies: [
        { classId: 'berserker', difficulty: 'hard', name: 'Forge Master', level: 7 },
        { classId: 'sentinel', difficulty: 'hard', name: 'Iron Guardian', level: 7 },
      ],
      nextZoneId: 'ch2_z3',
      prevZoneId: 'ch2_z1',
      rewardXP: 250,
      rewardGold: 65,
      isBoss: false,
    },
    {
      id: 'ch2_z3',
      name: 'Throne of Echoes',
      type: ZoneType.Combat,
      stageId: 'battle_arena',
      enemies: [
        { classId: 'sentinel', difficulty: 'hard', name: 'Echo Knight', level: 8 },
        { classId: 'phantom', difficulty: 'hard', name: 'Echo Phantom', level: 8 },
      ],
      nextZoneId: 'ch2_boss',
      prevZoneId: 'ch2_z2',
      rewardXP: 300,
      rewardGold: 80,
      isBoss: false,
    },
    {
      id: 'ch2_boss',
      name: 'The Rift Lord',
      type: ZoneType.Boss,
      stageId: 'scifi_stage',
      enemies: [
        { classId: 'phantom', difficulty: 'boss', name: 'Rift Lord Vex', level: 10 },
      ],
      nextZoneId: null,
      prevZoneId: 'ch2_z3',
      rewardXP: 500,
      rewardGold: 200,
      dialogueBefore: '"You dare challenge a lord of the rift? Amusing."',
      dialogueAfter: '"The rift... closes. But what opens in its place?"',
      isBoss: true,
    },
  ],
};

export const CHAPTERS: Chapter[] = [CHAPTER_1, CHAPTER_2];

export class ZoneSystem {
  private chapters = CHAPTERS;
  private currentChapterIdx = 0;
  private currentZoneIdx = 0;
  private completedZones: Set<string> = new Set();
  private completedChapters: Set<string> = new Set();

  private onZoneChange?: (zone: Zone, chapter: Chapter) => void;

  get currentChapter(): Chapter {
    return this.chapters[this.currentChapterIdx];
  }

  get currentZone(): Zone {
    return this.currentChapter.zones[this.currentZoneIdx];
  }

  get currentEnemyIndex(): number {
    return 0;
  }

  setOnZoneChange(cb: (zone: Zone, chapter: Chapter) => void) {
    this.onZoneChange = cb;
  }

  completeZone(zoneId: string) {
    this.completedZones.add(zoneId);

    const chapter = this.currentChapter;
    const allComplete = chapter.zones.every((z) => this.completedZones.has(z.id));
    if (allComplete) {
      this.completedChapters.add(chapter.id);
    }
  }

  advanceToNextZone(): boolean {
    const chapter = this.currentChapter;
    if (this.currentZoneIdx < chapter.zones.length - 1) {
      this.currentZoneIdx++;
      this.onZoneChange?.(this.currentZone, this.currentChapter);
      return true;
    }
    return false;
  }

  advanceToNextChapter(): boolean {
    if (this.currentChapterIdx < this.chapters.length - 1) {
      this.currentChapterIdx++;
      this.currentZoneIdx = 0;
      this.onZoneChange?.(this.currentZone, this.currentChapter);
      return true;
    }
    return false;
  }

  isZoneCompleted(zoneId: string): boolean {
    return this.completedZones.has(zoneId);
  }

  isChapterCompleted(chapterId: string): boolean {
    return this.completedChapters.has(chapterId);
  }

  getProgress(): { chapter: number; zone: number; total: number; completed: number } {
    const total = this.chapters.reduce((sum, ch) => sum + ch.zones.length, 0);
    return {
      chapter: this.currentChapterIdx + 1,
      zone: this.currentZoneIdx + 1,
      total,
      completed: this.completedZones.size,
    };
  }

  getAllChapters(): Chapter[] {
    return this.chapters;
  }

  reset() {
    this.currentChapterIdx = 0;
    this.currentZoneIdx = 0;
    this.completedZones.clear();
    this.completedChapters.clear();
  }
}
