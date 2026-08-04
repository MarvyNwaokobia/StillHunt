import { useCallback, useRef, useState } from 'react'
import { usePlayerStore } from '@/stores/usePlayerStore'
import { useAchievements } from '@/hooks/useAchievements'
import type { Player } from '@/types'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

export interface FightReward {
  won:           boolean
  xpAwarded:     number
  newXp:         number
  rankedUp:      boolean
  newRank:       Player['rank'] | null
  gAwarded:      number
  bountyAwarded: number  // one-time first-clear TALLY bounty (0 unless a new op cleared)
  firstClear:    boolean
  prestiged:     boolean // true when this fight prestiged past Apex
  prestigeLevel: number  // prestige level after this fight
}

/** Per-run performance the client reports for the skill bonus. The server caps it
 *  (max_rewardable_kills), so an inflated count can never mint XP. */
export interface FightTelemetry {
  kills:     number
  headshots: number
}

/**
 * Records a finished real-time fight with the server, which is authoritative over
 * all rewards — the client only reports whether it won and how long the fight ran.
 * Mirrors the turn-based `useBattle` finalize: applies XP/rank/TALLY to the player
 * store and fires achievement + decay-recovery checks. This is what moves the
 * earn loop onto the live fighter so the turn-based "Classic" mode can retire.
 */
export function useFightRewards() {
  const player       = usePlayerStore((s) => s.player)
  const updatePlayer = usePlayerStore((s) => s.updatePlayer)
  const { checkAchievements, checkDecayRecovery } = useAchievements()

  const [reward,  setReward]  = useState<FightReward | null>(null)
  const [pending, setPending] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  // The server-issued fight token for the current run. Obtained at fight START via
  // startFight() and consumed by submitResult(). Campaign rewards (XP / first-clear
  // TALLY / pve advance) are only granted when a valid token backs the completion, so
  // the client can no longer forge an outcome or skip ops.
  const sessionIdRef = useRef<string | null>(null)

  // Open a server-authoritative fight session. Call this when a fight BEGINS. For a
  // Campaign op pass its 1-based level; the server enforces sequential unlock and
  // records the real start time. A failure here (offline) just leaves no token —
  // submitResult then falls back to the flat, no-reward-money path.
  // Returns TRUE once a session is confirmed (or there's nothing to open, i.e. a
  // signed-out player) and the fight is safe to begin, FALSE when the server can't be
  // reached. The readiness gate uses this: a FALSE keeps the player out of a run that
  // would silently not count (the old code played on regardless and dropped the reward).
  const startFight = useCallback(
    async (level?: number): Promise<boolean> => {
      // Signed out: no session to open, nothing to wait on — let the fight play (it just
      // earns nothing). Only a signed-in player is gated on a real token.
      if (!player) { sessionIdRef.current = null; return true }
      sessionIdRef.current = null
      try {
        // A cold (asleep) free-tier server can take ~30-60s to boot and answer, so allow
        // for that; past the window we fail and the gate offers Retry instead of hanging.
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 60_000)
        const res = await fetch(`${API}/battles/fight/start`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ wallet: player.wallet_address, level }),
          signal:  ctrl.signal,
        })
        clearTimeout(timer)
        if (res.ok) {
          const data = await res.json()
          sessionIdRef.current = data.session_id ?? null
        }
        return sessionIdRef.current != null
      } catch {
        // offline / aborted / server down — no token; the gate shows Retry.
        return false
      }
    },
    [player]
  )

  const submitResult = useCallback(
    async (won: boolean, telemetry?: FightTelemetry): Promise<FightReward | null> => {
      if (!player) return null
      const wallet = player.wallet_address

      // Consume the token (single-use). Its presence marks this as a Campaign run;
      // its absence a flat, non-Campaign fight (Endless) that can never earn TALLY.
      const sessionId = sessionIdRef.current
      sessionIdRef.current = null

      // Per-run performance for the skill bonus (server-capped). Non-negative ints only.
      const kills     = Math.max(0, Math.round(telemetry?.kills ?? 0))
      const headshots = Math.max(0, Math.round(telemetry?.headshots ?? 0))

      setPending(true)
      setError(null)
      try {
        const res = await fetch(`${API}/battles/fight/complete`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(sessionId ? { session_id: sessionId, won, kills, headshots } : { won, wallet, kills, headshots }),
        })

        if (!res.ok) {
          const e = await res.json().catch(() => ({}))
          throw new Error((e as { error?: string }).error ?? `API error ${res.status}`)
        }

        const data = await res.json()

        // ── Sync the player store from the server's authoritative result ──
        // B0: ranking up is pure progression (no TALLY); TALLY now comes from the
        // one-time first-clear bounty, which is what bumps the lifetime stat.
        const bountyAwarded: number = data.bounty_awarded ?? 0
        const storeUpdates: Partial<Player> = {
          xp:           data.new_xp,
          wins:         won ? player.wins + 1 : player.wins,
          losses:       won ? player.losses : player.losses + 1,
          decay_status: 'none',
        }
        if (data.ranked_up && data.new_rank) {
          storeUpdates.rank = data.new_rank
        }
        // Prestige leaves rank as Apex but bumps the prestige counter — the server
        // is authoritative, so mirror whatever level it reports.
        if (typeof data.prestige_level === 'number') {
          storeUpdates.prestige_level = data.prestige_level
        }
        if (bountyAwarded > 0) {
          storeUpdates.g_earned_lifetime = (player.g_earned_lifetime ?? 0) + bountyAwarded
        }
        if (data.first_clear && data.level) {
          storeUpdates.pve_level = Math.max(player.pve_level ?? 0, data.level)
        }
        updatePlayer(storeUpdates)

        // ── Fire-and-forget side effects ─────────────────────────────────
        if (player.decay_status === 'active') {
          checkDecayRecovery(wallet).catch(console.error)
        }
        checkAchievements(wallet).catch(console.error)

        const result: FightReward = {
          won,
          xpAwarded:     data.xp_awarded,
          newXp:         data.new_xp,
          rankedUp:      data.ranked_up,
          newRank:       data.new_rank ?? null,
          gAwarded:      data.g_awarded,
          bountyAwarded,
          firstClear:    data.first_clear ?? false,
          prestiged:     data.prestiged ?? false,
          prestigeLevel: data.prestige_level ?? 0,
        }
        setReward(result)
        return result
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to record fight')
        return null
      } finally {
        setPending(false)
      }
    },
    [player, updatePlayer, checkAchievements, checkDecayRecovery]
  )

  // Record a DEATH (a lost run) with the server. Unlike submitResult this goes through
  // the sessionless flat path ON PURPOSE: it must NOT consume the campaign token (the
  // op auto-restarts in place, and the eventual clear still needs that token to earn
  // TALLY / advance the level). A loss never pays, so it needs no session anti-cheat. The
  // server still writes the on-chain StillHuntRecord (player as loser). Fire-and-forget.
  const reportLoss = useCallback(
    async (telemetry?: FightTelemetry): Promise<void> => {
      if (!player) return
      const wallet    = player.wallet_address
      const kills     = Math.max(0, Math.round(telemetry?.kills ?? 0))
      const headshots = Math.max(0, Math.round(telemetry?.headshots ?? 0))
      try {
        const res = await fetch(`${API}/battles/fight/complete`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          // No session_id → flat path → level forced None → records the loss, pays nothing.
          body:    JSON.stringify({ won: false, wallet, kills, headshots }),
        })
        if (!res.ok) return
        const data = await res.json()
        // Mirror the server: bump the loss tally (and any XP it awarded).
        updatePlayer({
          losses: player.losses + 1,
          ...(typeof data.new_xp === 'number' ? { xp: data.new_xp } : {}),
        })
      } catch {
        // offline / server down — the death simply doesn't record; play continues.
      }
    },
    [player, updatePlayer]
  )

  return { startFight, submitResult, reportLoss, reward, pending, error }
}
