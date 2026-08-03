import { describe, it, expect } from 'vitest'
import { endlessLevel } from '@/engine/campaign/levels'
import { AIDifficulty } from '@/engine/combat'

describe('endlessLevel', () => {
  it('always uses the top-tier gun and Boss difficulty', () => {
    const l = endlessLevel(3)
    expect(l.enemyGun).toBe('legendary')
    expect(l.difficulty).toBe(AIDifficulty.Boss)
  })

  it('scales enemy HP up with the wave', () => {
    expect(endlessLevel(10).enemyHpMult).toBeGreaterThan(endlessLevel(1).enemyHpMult)
  })

  it('labels the wave', () => {
    expect(endlessLevel(7).name).toBe('Wave 7')
    expect(endlessLevel(7).level).toBe(7)
  })
})
