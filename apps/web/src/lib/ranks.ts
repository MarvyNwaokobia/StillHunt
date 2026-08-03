import type { Rank } from '@/types/database'

export interface RankDefinition {
  rank: Rank
  label: string
  tier: number           // 1–5
  /** Base color for rank badge + accents */
  color: string
  /** Glow shadow string (CSS box-shadow fragment) */
  glow: string
  /** Aura enabled above this tier */
  hasAura: boolean
  /** Floating particles (Diamond only) */
  hasParticles: boolean
  /** Pulsing armor-light effect */
  armorLight: boolean
  badgeBg: string
  badgeText: string
}

export const RANK_DEFINITIONS: Record<Rank, RankDefinition> = {
  Iron: {
    rank: 'Iron',
    label: 'IRON',
    tier: 1,
    color: '#8a8f98',
    glow: '0 0 10px rgba(138,143,152,0.20)',
    hasAura: false,
    hasParticles: false,
    armorLight: false,
    badgeBg: 'rgba(138,143,152,0.12)',
    badgeText: '#a9afb8',
  },
  Bronze: {
    rank: 'Bronze',
    label: 'BRONZE',
    tier: 2,
    color: '#cd7f32',
    glow: '0 0 12px rgba(205,127,50,0.25)',
    hasAura: false,
    hasParticles: false,
    armorLight: false,
    badgeBg: 'rgba(205,127,50,0.12)',
    badgeText: '#cd7f32',
  },
  Silver: {
    rank: 'Silver',
    label: 'SILVER',
    tier: 3,
    color: '#c0c0c0',
    glow: '0 0 18px rgba(192,192,192,0.30), 0 0 40px rgba(192,192,192,0.10)',
    hasAura: true,
    hasParticles: false,
    armorLight: false,
    badgeBg: 'rgba(192,192,192,0.10)',
    badgeText: '#d0d0d0',
  },
  Gold: {
    rank: 'Gold',
    label: 'GOLD',
    tier: 4,
    color: '#eab308',
    glow: '0 0 24px rgba(234,179,8,0.50), 0 0 56px rgba(234,179,8,0.20)',
    hasAura: true,
    hasParticles: false,
    armorLight: true,
    badgeBg: 'rgba(234,179,8,0.15)',
    badgeText: '#fbbf24',
  },
  Platinum: {
    rank: 'Platinum',
    label: 'PLATINUM',
    tier: 5,
    color: '#e2e8f0',
    glow: '0 0 30px rgba(226,232,240,0.55), 0 0 70px rgba(226,232,240,0.25), 0 0 120px rgba(148,163,184,0.12)',
    hasAura: true,
    hasParticles: false,
    armorLight: true,
    badgeBg: 'rgba(226,232,240,0.12)',
    badgeText: '#f1f5f9',
  },
  Emerald: {
    rank: 'Emerald',
    label: 'EMERALD',
    tier: 6,
    color: '#34d399',
    glow: '0 0 30px rgba(52,211,153,0.55), 0 0 72px rgba(52,211,153,0.25), 0 0 120px rgba(16,185,129,0.12)',
    hasAura: true,
    hasParticles: false,
    armorLight: true,
    badgeBg: 'rgba(52,211,153,0.13)',
    badgeText: '#6ee7b7',
  },
  Diamond: {
    rank: 'Diamond',
    label: 'DIAMOND',
    tier: 7,
    color: '#7dd3fc',
    glow: '0 0 40px rgba(125,211,252,0.65), 0 0 90px rgba(125,211,252,0.30), 0 0 160px rgba(125,211,252,0.12)',
    hasAura: true,
    hasParticles: true,
    armorLight: true,
    badgeBg: 'rgba(125,211,252,0.14)',
    badgeText: '#bae6fd',
  },
}

/** 1 → "I", 2 → "II", … Small values only; prestige never runs high enough to worry. */
export function romanNumeral(n: number): string {
  if (n <= 0) return ''
  const table: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ]
  let out = ''
  for (const [v, s] of table) { while (n >= v) { out += s; n -= v } }
  return out
}

/**
 * Display label for a rank. Past Diamond, players prestige: a prestige_level of N shows
 * "DIAMOND N" (Roman), e.g. "DIAMOND II". Below that it's just the tier name.
 */
export function rankLabel(rank: Rank, prestigeLevel = 0): string {
  const base = RANK_DEFINITIONS[rank]?.label ?? rank.toUpperCase()
  if (rank === 'Diamond' && prestigeLevel > 0) return `${base} ${romanNumeral(prestigeLevel)}`
  return base
}

/** Returns the CSS box-shadow string combining rank glow with class glow */
export function combinedGlow(rankColor: string, classGlow: string, tier: number): string {
  if (tier <= 1) return classGlow
  return `${classGlow}, ${RANK_DEFINITIONS[rankColor as Rank]?.glow ?? ''}`
}
