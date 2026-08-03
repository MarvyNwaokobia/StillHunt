import type { Player } from '@/types'
import { DECAY_WARNING_HOURS, DECAY_PENALIZE_HOURS } from '@/lib/constants'

export type DecayStatus = 'none' | 'warning' | 'active'

export function getDecayStatus(lastActive: string, frozenUntil: string | null): DecayStatus {
  if (frozenUntil && new Date(frozenUntil) > new Date()) return 'none'

  const hoursSince = (Date.now() - new Date(lastActive).getTime()) / (1000 * 60 * 60)

  if (hoursSince >= DECAY_PENALIZE_HOURS) return 'active'
  if (hoursSince >= DECAY_WARNING_HOURS) return 'warning'
  return 'none'
}

export function getDecayTimeRemaining(lastActive: string): number {
  const hoursSince = (Date.now() - new Date(lastActive).getTime()) / (1000 * 60 * 60)
  return Math.max(0, DECAY_WARNING_HOURS - hoursSince)
}

export function getRankDowngrade(rank: Player['rank']): Player['rank'] | null {
  const ranks: Player['rank'][] = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond']
  const idx = ranks.indexOf(rank)
  return idx > 0 ? ranks[idx - 1] : null
}

export function getRankUpgrade(rank: Player['rank']): Player['rank'] | null {
  const ranks: Player['rank'][] = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond']
  const idx = ranks.indexOf(rank)
  return idx < ranks.length - 1 ? ranks[idx + 1] : null
}
