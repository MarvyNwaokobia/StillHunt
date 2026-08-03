import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTutorialBattle, TUTORIAL_HINTS } from '@/hooks/useTutorialBattle'
import type { Player } from '@/types'

const mockPlayer: Player = {
  wallet_address:          '0xtest',
  play_style:              'Fighter',
  avatar:                  '⚔️',
  character_name:          'TestWarrior',
  username:                null,
  display_name:            null,
  character_class:         'Berserker',
  character_customization: {},
  rank:                    'Bronze',
  xp:                      0,
  attack_stat:             16,
  defense_stat:            7,
  speed_stat:              9,
  g_earned_lifetime:       0,
  last_active:             new Date().toISOString(),
  decay_status:            'none',
  decay_frozen_until:      null,
  wins:                    0,
  losses:                  0,
  pve_level:               0,
  character_claim_tx:      null,
  created_at:              new Date().toISOString(),
}

describe('useTutorialBattle', () => {
  it('starts in idle phase', () => {
    const { result } = renderHook(() => useTutorialBattle(mockPlayer))
    expect(result.current.phase).toBe('idle')
  })

  it('transitions to fighting after startBattle', () => {
    const { result } = renderHook(() => useTutorialBattle(mockPlayer))
    act(() => result.current.startBattle())
    expect(result.current.phase).toBe('fighting')
    expect(result.current.playerHp).toBe(100)
    expect(result.current.botHp).toBe(100)
    expect(result.current.round).toBe(1)
  })

  it('increments round on each move', () => {
    const { result } = renderHook(() => useTutorialBattle(mockPlayer))
    act(() => result.current.startBattle())
    act(() => result.current.handleMove('attack'))
    expect(result.current.round).toBe(2)
    act(() => result.current.handleMove('attack'))
    expect(result.current.round).toBe(3)
  })

  it('special can only be used once', () => {
    const { result } = renderHook(() => useTutorialBattle(mockPlayer))
    act(() => result.current.startBattle())
    act(() => result.current.handleMove('special'))
    expect(result.current.specialUsed).toBe(true)
    // Second special is ignored
    act(() => result.current.handleMove('special'))
    // Round does not advance (move was rejected)
    expect(result.current.round).toBe(2)
  })

  it('reaches result phase after 5 moves', () => {
    const { result } = renderHook(() => useTutorialBattle(mockPlayer))
    act(() => result.current.startBattle())
    for (let i = 0; i < 5; i++) {
      act(() => result.current.handleMove('attack'))
    }
    expect(result.current.phase).toBe('result')
  })

  it('tutorial always results in a win', () => {
    const { result } = renderHook(() => useTutorialBattle(mockPlayer))
    act(() => result.current.startBattle())
    for (let i = 0; i < 5; i++) {
      act(() => result.current.handleMove('attack'))
    }
    expect(result.current.result?.won).toBe(true)
  })

  it('awards tutorial XP on completion', () => {
    const { result } = renderHook(() => useTutorialBattle(mockPlayer))
    act(() => result.current.startBattle())
    for (let i = 0; i < 5; i++) {
      act(() => result.current.handleMove('attack'))
    }
    expect(result.current.result?.xpAwarded).toBe(50)
    expect(result.current.result?.newXp).toBe(50)
  })

  it('reset returns to idle', () => {
    const { result } = renderHook(() => useTutorialBattle(mockPlayer))
    act(() => result.current.startBattle())
    act(() => result.current.handleMove('attack'))
    act(() => result.current.reset())
    expect(result.current.phase).toBe('idle')
    expect(result.current.result).toBeNull()
  })

  it('player HP never goes below 0', () => {
    const { result } = renderHook(() => useTutorialBattle(mockPlayer))
    act(() => result.current.startBattle())
    for (let i = 0; i < 5; i++) {
      act(() => result.current.handleMove('attack'))
    }
    for (const entry of result.current.log) {
      expect(entry.playerHp).toBeGreaterThanOrEqual(0)
      expect(entry.botHp).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('TUTORIAL_HINTS', () => {
  it('has exactly 5 hints (one per round)', () => {
    expect(TUTORIAL_HINTS).toHaveLength(5)
  })

  it('each hint has a unique round number 1-5', () => {
    const rounds = TUTORIAL_HINTS.map(h => h.round)
    expect(new Set(rounds).size).toBe(5)
    expect(Math.min(...rounds)).toBe(1)
    expect(Math.max(...rounds)).toBe(5)
  })

  it('has a hint pointing to special ability', () => {
    expect(TUTORIAL_HINTS.some(h => h.targetMove === 'special')).toBe(true)
  })

  it('has a hint pointing to defend', () => {
    expect(TUTORIAL_HINTS.some(h => h.targetMove === 'defend')).toBe(true)
  })
})
