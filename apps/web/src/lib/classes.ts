export const CHARACTER_CLASSES = ['Berserker', 'Sentinel', 'Phantom'] as const
export type CharacterClass = (typeof CHARACTER_CLASSES)[number]

export interface ClassDefinition {
  id: CharacterClass
  name: string
  tagline: string
  description: string
  accentColor: string
  accentColorDim: string
  glowColor: string
  stats: {
    attack: number
    defense: number
    speed: number
  }
  weapon: string
  special: string
  specialDesc: string
  playStyle: string
}

/** GLB paths for 3D character models (output of scripts/fbx_to_glb.py) */
export const CHARACTER_GLB: Record<CharacterClass, string> = {
  Berserker: '/characters/glb/berserker.glb',
  Sentinel:  '/characters/glb/phantom.glb',
  Phantom:   '/characters/glb/sentinel.glb',
}

/** Fallback portrait images (used until GLBs are ready) */
export const CHARACTER_IMAGES: Record<CharacterClass, { male: string; female: string }> = {
  Berserker: {
    male:   '/characters/classes/berserker-male.jpg',
    female: '/characters/classes/berserker-female.jpg',
  },
  Sentinel: {
    male:   '/characters/classes/sentinel-male.jpg',
    female: '/characters/classes/sentinel-female.jpg',
  },
  Phantom: {
    male:   '/characters/classes/phantom-male.jpg',
    female: '/characters/classes/phantom-female.jpg',
  },
}

export const CLASS_DEFINITIONS: Record<CharacterClass, ClassDefinition> = {
  Berserker: {
    id: 'Berserker',
    name: 'Berserker',
    tagline: 'Pure power. No mercy.',
    description:
      'A rage-fueled warrior who trades armor for overwhelming offense. Berserkers hit the hardest and fall the hardest — every fight is all or nothing.',
    accentColor: '#ef4444',
    accentColorDim: 'rgba(239,68,68,0.12)',
    glowColor: 'rgba(239,68,68,0.5)',
    stats: { attack: 16, defense: 7, speed: 9 },
    weapon: 'Dual Battle Axes',
    special: 'Berserker Rage',
    specialDesc: 'Deals 3× base damage. No holding back.',
    playStyle: 'Aggressive — win fast or fall hard.',
  },

  Sentinel: {
    id: 'Sentinel',
    name: 'Sentinel',
    tagline: 'Stand your ground.',
    description:
      'An unbreakable wall who counters with every hit absorbed. Sentinels outlast any opponent — patience is their deadliest weapon.',
    accentColor: '#3b82f6',
    accentColorDim: 'rgba(59,130,246,0.12)',
    glowColor: 'rgba(59,130,246,0.5)',
    stats: { attack: 9, defense: 16, speed: 7 },
    weapon: 'Sword & Tower Shield',
    special: 'Iron Fortress',
    specialDesc: 'Absorbs the next attack and reflects 50% back.',
    playStyle: 'Defensive — outlast and punish.',
  },

  Phantom: {
    id: 'Phantom',
    name: 'Phantom',
    tagline: 'Strike fast. Vanish. Repeat.',
    description:
      "Speed is their armor. Phantoms attack before the enemy reacts — by the time you see them, they're already gone.",
    accentColor: '#8b5cf6',
    accentColorDim: 'rgba(139,92,246,0.12)',
    glowColor: 'rgba(139,92,246,0.5)',
    stats: { attack: 12, defense: 7, speed: 15 },
    weapon: 'Twin Void Blades',
    special: 'Shadow Strike',
    specialDesc: 'Always strikes first. Bypasses enemy defense.',
    playStyle: 'Evasive — speed is your armor.',
  },
}

/** Returns stat variance seeded by wallet address (±3 on each stat) */
export function statVarianceFromWallet(wallet: string): number {
  const seed = wallet.slice(-6).split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return (seed % 7) - 3
}
