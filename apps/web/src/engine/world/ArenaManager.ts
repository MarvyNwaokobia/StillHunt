import type { StageId } from '../scene/ArenaStage';

export interface ArenaConfig {
  id: StageId;
  name: string;
  description: string;
  classAffinity: string | null;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  spawnPoints: { player: [number, number, number]; enemy: [number, number, number] };
  ambientColor: string;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  skyColor: string;
  groundColor: string;
  music?: string;
}

const ARENAS: Record<StageId, ArenaConfig> = {
  lava_arena: {
    id: 'lava_arena',
    name: 'The Crucible',
    description: 'A volcanic arena where the ground cracks with molten fury.',
    classAffinity: 'berserker',
    bounds: { minX: -10, maxX: 10, minZ: -7, maxZ: 7 },
    spawnPoints: {
      player: [-4, 0, 0],
      enemy: [4, 0, 0],
    },
    ambientColor: '#ff6622',
    fogColor: '#1a0800',
    fogNear: 15,
    fogFar: 40,
    skyColor: '#0d0200',
    groundColor: '#2a0a00',
  },
  scifi_stage: {
    id: 'scifi_stage',
    name: 'The Nexus',
    description: 'A crystalline platform suspended between dimensions.',
    classAffinity: 'phantom',
    bounds: { minX: -8, maxX: 8, minZ: -6, maxZ: 6 },
    spawnPoints: {
      player: [-3.5, 0, 0],
      enemy: [3.5, 0, 0],
    },
    ambientColor: '#6644ff',
    fogColor: '#050010',
    fogNear: 18,
    fogFar: 45,
    skyColor: '#020008',
    groundColor: '#0a0020',
  },
  battle_arena: {
    id: 'battle_arena',
    name: 'The Sanctum',
    description: 'A sacred proving ground bathed in divine light.',
    classAffinity: 'sentinel',
    bounds: { minX: -12, maxX: 12, minZ: -8, maxZ: 8 },
    spawnPoints: {
      player: [-5, 0, 0],
      enemy: [5, 0, 0],
    },
    ambientColor: '#4488ff',
    fogColor: '#020812',
    fogNear: 20,
    fogFar: 50,
    skyColor: '#040a14',
    groundColor: '#0a1525',
  },
  rpg_environment: {
    id: 'rpg_environment',
    name: 'The Outlands',
    description: 'A ruined crossroads where warriors gather to test their mettle.',
    classAffinity: null,
    bounds: { minX: -15, maxX: 15, minZ: -10, maxZ: 10 },
    spawnPoints: {
      player: [-6, 0, 0],
      enemy: [6, 0, 0],
    },
    ambientColor: '#88aa66',
    fogColor: '#0a1208',
    fogNear: 25,
    fogFar: 60,
    skyColor: '#0c1a08',
    groundColor: '#1a2a10',
  },
  industrial_hangar: {
    id: 'industrial_hangar',
    name: 'The Foundry',
    description: 'A massive abandoned factory converted into a combat zone — cracked concrete, rusted steel, dusty light.',
    classAffinity: null,
    bounds: { minX: -20, maxX: 20, minZ: -16, maxZ: 16 },
    spawnPoints: {
      player: [-10, 0, 0],
      enemy: [10, 0, 0],
    },
    ambientColor: '#c8b8a0',
    fogColor: '#8a7a68',
    fogNear: 35,
    fogFar: 90,
    skyColor: '#6b6055',
    groundColor: '#3a3028',
  },
};

export class ArenaManager {
  private currentArena: ArenaConfig;
  private onArenaChange?: (arena: ArenaConfig) => void;

  constructor(initialArena: StageId = 'lava_arena') {
    this.currentArena = ARENAS[initialArena];
  }

  get current(): ArenaConfig {
    return this.currentArena;
  }

  setOnArenaChange(cb: (arena: ArenaConfig) => void) {
    this.onArenaChange = cb;
  }

  switchArena(stageId: StageId) {
    this.currentArena = ARENAS[stageId];
    this.onArenaChange?.(this.currentArena);
  }

  getArenaForClass(classId: string): ArenaConfig {
    const match = Object.values(ARENAS).find((a) => a.classAffinity === classId);
    return match ?? ARENAS.battle_arena;
  }

  getAllArenas(): ArenaConfig[] {
    return Object.values(ARENAS);
  }

  getArena(id: StageId): ArenaConfig {
    return ARENAS[id];
  }

  getRandomArena(): ArenaConfig {
    const keys = Object.keys(ARENAS) as StageId[];
    return ARENAS[keys[Math.floor(Math.random() * keys.length)]];
  }
}
