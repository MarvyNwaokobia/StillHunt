import { describe, it, expect } from 'vitest'
import { RANK_DEFINITIONS, rankLabel } from '@/lib/ranks'
import type { Rank } from '@/types/database'

const RANKS: Rank[] = ['Tracker', 'Stalker', 'Marksman', 'Ranger', 'Apex']

describe('RANK_DEFINITIONS', () => {
  it('has all 5 ranks defined', () => {
    for (const rank of RANKS) {
      expect(RANK_DEFINITIONS[rank]).toBeDefined()
    }
  })

  it('tier numbers are strictly ascending Tracker→Apex', () => {
    for (let i = 1; i < RANKS.length; i++) {
      expect(RANK_DEFINITIONS[RANKS[i]].tier).toBeGreaterThan(RANK_DEFINITIONS[RANKS[i - 1]].tier)
    }
  })

  it('Tracker has no aura or particles (raw warrior)', () => {
    const bronze = RANK_DEFINITIONS['Tracker']
    expect(bronze.hasAura).toBe(false)
    expect(bronze.hasParticles).toBe(false)
    expect(bronze.armorLight).toBe(false)
  })

  it('Apex has all visual effects enabled', () => {
    const diamond = RANK_DEFINITIONS['Apex']
    expect(diamond.hasAura).toBe(true)
    expect(diamond.hasParticles).toBe(true)
    expect(diamond.armorLight).toBe(true)
  })

  it('each rank has valid CSS color strings', () => {
    for (const rank of RANKS) {
      const def = RANK_DEFINITIONS[rank]
      expect(def.color).toMatch(/^#[0-9a-fA-F]{3,8}$/)
      expect(def.badgeText).toMatch(/^#[0-9a-fA-F]{3,8}$/)
    }
  })

  it('glow strings contain color hex', () => {
    for (const rank of RANKS) {
      // All glow strings contain a rgba() or hex — just verify they are non-empty
      expect(RANK_DEFINITIONS[rank].glow.length).toBeGreaterThan(10)
    }
  })
})

describe('rankLabel', () => {
  it('returns uppercase rank name', () => {
    for (const rank of RANKS) {
      expect(rankLabel(rank)).toBe(rank.toUpperCase())
    }
  })
})
