import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getDecayStatus, getDecayTimeRemaining, getRankDowngrade, getRankUpgrade } from '@/utils/decay'
import { DECAY_WARNING_HOURS, DECAY_PENALIZE_HOURS } from '@/lib/constants'

describe('getDecayStatus', () => {
  const NOW = new Date('2026-06-05T12:00:00Z')
  const h = (hours: number) => new Date(NOW.getTime() - hours * 3600 * 1000).toISOString()

  beforeEach(() => { vi.setSystemTime(NOW) })
  afterEach(() => { vi.useRealTimers() })

  it('returns "none" when well within warning threshold', () => {
    expect(getDecayStatus(h(10), null)).toBe('none')
  })

  it('returns "warning" between warning and penalize thresholds', () => {
    const justOverWarning = h(DECAY_WARNING_HOURS + 1)
    expect(getDecayStatus(justOverWarning, null)).toBe('warning')
  })

  it('returns "active" past penalize threshold', () => {
    const longAgo = h(DECAY_PENALIZE_HOURS + 1)
    expect(getDecayStatus(longAgo, null)).toBe('active')
  })

  it('returns "none" when frozen_until is in the future regardless of last_active age', () => {
    const frozenUntil = new Date(NOW.getTime() + 3600 * 1000).toISOString()
    const longAgo = h(DECAY_PENALIZE_HOURS + 10)
    expect(getDecayStatus(longAgo, frozenUntil)).toBe('none')
  })

  it('respects expired freeze — returns "active" if freeze is past', () => {
    const expiredFreeze = h(24)  // frozenUntil was 24h ago
    const longAgo = h(DECAY_PENALIZE_HOURS + 1)
    expect(getDecayStatus(longAgo, expiredFreeze)).toBe('active')
  })

  it('returns "none" at exactly 0 hours since last active', () => {
    expect(getDecayStatus(h(0), null)).toBe('none')
  })
})

describe('getDecayTimeRemaining', () => {
  const NOW = new Date('2026-06-05T12:00:00Z')
  const h = (hours: number) => new Date(NOW.getTime() - hours * 3600 * 1000).toISOString()

  beforeEach(() => { vi.setSystemTime(NOW) })
  afterEach(() => { vi.useRealTimers() })

  it('returns DECAY_WARNING_HOURS when just active', () => {
    expect(getDecayTimeRemaining(h(0))).toBeCloseTo(DECAY_WARNING_HOURS, 1)
  })

  it('returns 0 or less past warning threshold', () => {
    expect(getDecayTimeRemaining(h(DECAY_WARNING_HOURS + 5))).toBe(0)
  })

  it('decrements as last_active ages', () => {
    const t10 = getDecayTimeRemaining(h(10))
    const t20 = getDecayTimeRemaining(h(20))
    expect(t10).toBeGreaterThan(t20)
  })
})

describe('getRankDowngrade', () => {
  it('returns the rank below', () => {
    expect(getRankDowngrade('Silver')).toBe('Bronze')
    expect(getRankDowngrade('Gold')).toBe('Silver')
    expect(getRankDowngrade('Platinum')).toBe('Gold')
    expect(getRankDowngrade('Diamond')).toBe('Platinum')
  })

  it('returns null for Bronze (already lowest)', () => {
    expect(getRankDowngrade('Bronze')).toBeNull()
  })
})

describe('getRankUpgrade', () => {
  it('returns the rank above', () => {
    expect(getRankUpgrade('Bronze')).toBe('Silver')
    expect(getRankUpgrade('Silver')).toBe('Gold')
    expect(getRankUpgrade('Gold')).toBe('Platinum')
    expect(getRankUpgrade('Platinum')).toBe('Diamond')
  })

  it('returns null for Diamond (already highest)', () => {
    expect(getRankUpgrade('Diamond')).toBeNull()
  })
})
