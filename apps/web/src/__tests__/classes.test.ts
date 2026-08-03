import { describe, it, expect } from 'vitest'
import { CLASS_DEFINITIONS, CHARACTER_CLASSES, statVarianceFromWallet } from '@/lib/classes'

describe('CLASS_DEFINITIONS', () => {
  it('has all 3 classes', () => {
    expect(Object.keys(CLASS_DEFINITIONS)).toHaveLength(3)
    for (const cls of CHARACTER_CLASSES) {
      expect(CLASS_DEFINITIONS[cls]).toBeDefined()
    }
  })

  it('Berserker has highest attack stat', () => {
    expect(CLASS_DEFINITIONS.Berserker.stats.attack).toBeGreaterThan(CLASS_DEFINITIONS.Sentinel.stats.attack)
    expect(CLASS_DEFINITIONS.Berserker.stats.attack).toBeGreaterThan(CLASS_DEFINITIONS.Phantom.stats.attack)
  })

  it('Sentinel has highest defense stat', () => {
    expect(CLASS_DEFINITIONS.Sentinel.stats.defense).toBeGreaterThan(CLASS_DEFINITIONS.Berserker.stats.defense)
    expect(CLASS_DEFINITIONS.Sentinel.stats.defense).toBeGreaterThan(CLASS_DEFINITIONS.Phantom.stats.defense)
  })

  it('Phantom has highest speed stat', () => {
    expect(CLASS_DEFINITIONS.Phantom.stats.speed).toBeGreaterThan(CLASS_DEFINITIONS.Berserker.stats.speed)
    expect(CLASS_DEFINITIONS.Phantom.stats.speed).toBeGreaterThan(CLASS_DEFINITIONS.Sentinel.stats.speed)
  })

  it('each class has valid accent color hex', () => {
    for (const cls of CHARACTER_CLASSES) {
      expect(CLASS_DEFINITIONS[cls].accentColor).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })

  it('class IDs match their keys', () => {
    for (const cls of CHARACTER_CLASSES) {
      expect(CLASS_DEFINITIONS[cls].id).toBe(cls)
    }
  })
})

describe('statVarianceFromWallet', () => {
  it('returns a value in range [-3, 3]', () => {
    const wallets = [
      '0xabc123def456789012345678901234567890abcd',
      '0x0000000000000000000000000000000000000001',
      '0xffffffffffffffffffffffffffffffffffffffff',
      '0x1234567890abcdef1234567890abcdef12345678',
    ]
    for (const w of wallets) {
      const v = statVarianceFromWallet(w)
      expect(v).toBeGreaterThanOrEqual(-3)
      expect(v).toBeLessThanOrEqual(3)
    }
  })

  it('returns deterministic values for the same wallet', () => {
    const wallet = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
    expect(statVarianceFromWallet(wallet)).toBe(statVarianceFromWallet(wallet))
  })

  it('returns different values for different wallets', () => {
    const results = new Set(['0xaaaa', '0xbbbb', '0xcccc', '0xdddd'].map(statVarianceFromWallet))
    expect(results.size).toBeGreaterThan(1)
  })
})
