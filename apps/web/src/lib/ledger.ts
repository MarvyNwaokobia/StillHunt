/**
 * @module lib/ledger
 * @description The Ledger — the campaign as the camp screen presents it.
 *
 * This is a PRESENTATION layer over engine/fps/campaign.ts and nothing more. That
 * module is the campaign the game actually boots: fifteen missions with rooms,
 * objectives, enemy rosters and an extraction, grouped into three zones with a boss
 * closing each one. Nothing here redefines any of it — the Ledger only re-reads it
 * for a screen that isn't the Operations list.
 *
 * INDEXING, because it is the easy thing to get wrong: a contract's `op` is the
 * ZERO-BASED index into CAMPAIGN, which is exactly what `/fight?op=N` expects and
 * what `player.pve_level` counts (pve_level = missions cleared, so it doubles as the
 * index of the next one). Do not confuse it with engine/campaign/levels.ts, a
 * separate ONE-BASED ladder used by the older arena duel flow.
 */

import { CAMPAIGN, type Mission } from '@/engine/fps/campaign'

export interface Contract {
  /** Zero-based index into CAMPAIGN. Drives /fight?op=N. */
  op: number
  /** Stable mission id, e.g. 'ash-5'. */
  id: string
  /** Mission title as the briefing shows it, e.g. 'CINDER'. */
  name: string
  /** One-line briefing subtitle. */
  brief: string
  /** Narrative lead-in, where the mission has one. */
  story?: string
  /** Engine zone key — 'ASHFALL' | 'PROVING GROUND' | 'THE RIFT'. */
  zone: string
  isBoss: boolean
}

export interface ZoneMeta {
  /** Engine zone key, as it appears on a Mission. */
  key: string
  /** How the camp screen says it. */
  name: string
  /** One line of colour under the name. */
  subtitle: string
  accent: string
}

/**
 * Display metadata per zone. The keys must match the `zone` strings in
 * engine/fps/campaign.ts, which also drive ZONE_THEMES (lighting and fog) — so the
 * keys are engine data and only the copy here is ours. Accents match the Operations
 * board so the two screens read as the same game.
 */
export const ZONE_META: readonly ZoneMeta[] = [
  { key: 'ASHFALL',        name: 'Ashfall',            subtitle: 'The village that burned',        accent: '#ff9d5c' },
  { key: 'PROVING GROUND', name: 'The Proving Ground', subtitle: 'Where they trained the crew',    accent: '#8fc8e6' },
  { key: 'THE RIFT',       name: 'The Rift',           subtitle: 'Where his channel goes quiet',   accent: '#9a6bff' },
]

const FALLBACK_ZONE: ZoneMeta = { key: '', name: 'Unknown', subtitle: '', accent: '#5a7184' }

/** The fifteen contracts, in campaign order, derived from the missions themselves. */
export const CONTRACTS: readonly Contract[] = CAMPAIGN.map((m: Mission, op: number) => ({
  op,
  id: m.id,
  name: m.name,
  brief: m.brief,
  story: m.story,
  zone: m.zone,
  isBoss: m.boss === true,
}))

export const LEDGER_LENGTH = CONTRACTS.length

export function getContract(op: number): Contract | undefined {
  return CONTRACTS[op]
}

export function zoneMeta(key: string): ZoneMeta {
  return ZONE_META.find((z) => z.key === key) ?? FALLBACK_ZONE
}

/** Display metadata for the zone a contract belongs to. */
export function zoneOf(contract: Contract): ZoneMeta {
  return zoneMeta(contract.zone)
}

/**
 * The next contract on the board — the first one not yet cleared.
 * `pveLevel` is the count of missions cleared, so it IS the index of the next one.
 * Returns undefined once the whole Ledger is done.
 */
export function nextContract(pveLevel: number): Contract | undefined {
  return CONTRACTS[pveLevel]
}

export function isCleared(contract: Contract, pveLevel: number): boolean {
  return contract.op < pveLevel
}

/**
 * Locked = further out than the next open contract. The board shows locked
 * contracts face-down: you can see there is work there without being told what.
 */
export function isLocked(contract: Contract, pveLevel: number): boolean {
  return contract.op > pveLevel
}

/** Contracts cleared — what fills the wall. */
export function contractsTaken(pveLevel: number): Contract[] {
  return CONTRACTS.filter((c) => isCleared(c, pveLevel))
}

/** Bosses taken. These are the ones that get their own hook on the wall. */
export function bossTrophies(pveLevel: number): Contract[] {
  return CONTRACTS.filter((c) => c.isBoss && isCleared(c, pveLevel))
}

/** The boss that closes a zone, whether or not it has been taken. */
export function zoneBoss(zoneKey: string): Contract | undefined {
  return CONTRACTS.find((c) => c.zone === zoneKey && c.isBoss)
}

/** Cleared/total for one zone, clamped so a zone never bleeds into its neighbours. */
export function zoneProgress(zoneKey: string, pveLevel: number): { cleared: number; total: number } {
  const ops = CONTRACTS.filter((c) => c.zone === zoneKey)
  return {
    cleared: ops.filter((c) => isCleared(c, pveLevel)).length,
    total: ops.length,
  }
}

/** True once the player has reached this zone at all — used to seal the later ones. */
export function zoneReached(zoneKey: string, pveLevel: number): boolean {
  const first = CONTRACTS.find((c) => c.zone === zoneKey)
  return first ? first.op <= pveLevel : false
}
