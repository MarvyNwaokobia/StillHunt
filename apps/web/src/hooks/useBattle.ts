import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePlayerStore } from '@/stores/usePlayerStore'
import { useAchievements } from '@/hooks/useAchievements'
import type { Player, BattleMove, Item } from '@/types'
import type { CharacterClass } from '@/lib/classes'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

export type BattlePhase = 'idle' | 'fighting' | 'result'

export interface BattleRoundResult {
  round:      number
  playerMove: BattleMove
  botMove:    BattleMove
  playerDmg:  number
  botDmg:     number
  playerHp:   number
  botHp:      number
}

export interface BattleResultState {
  won:        boolean
  xpAwarded:  number
  newXp:      number
  rankedUp:   boolean
  newRank:    Player['rank'] | null
  gAwarded:   number
  rounds:     BattleRoundResult[]
}

export function useBattle(player: Player, walletAddress: string) {
  const updatePlayer              = usePlayerStore((s) => s.updatePlayer)
  const { checkAchievements, checkDecayRecovery } = useAchievements()
  const inventory = usePlayerStore((s) => s.inventory)
  const itemIds   = inventory.map(i => i.item_id)

  const { data: items = [] } = useQuery({
    queryKey: ['items', itemIds],
    queryFn: async () => {
      if (itemIds.length === 0) return []
      const res = await fetch(`${API}/items`)
      if (!res.ok) return []
      const all = await res.json()
      // /items is trusted to be a list by the type annotation alone. A 200 carrying
      // anything else made .filter throw inside the queryFn, which React Query
      // reports as a failed query — so the player silently owns nothing and fights
      // with none of their stat boosts, with no error anywhere.
      if (!Array.isArray(all)) return []
      return (all as Item[]).filter(i => itemIds.includes(i.id))
    },
    enabled: itemIds.length > 0,
    staleTime: 60_000,
  })

  const itemMap      = new Map(items.map(i => [i.id, i]))
  const equipped     = inventory.filter(i => i.equipped).map(i => itemMap.get(i.item_id)).filter(Boolean) as Item[]
  const attackBoost  = equipped.filter(i => i.category === 'weapon').reduce((s, i) => s + i.stat_boost, 0)
  const defenseBoost = equipped.filter(i => i.category === 'shield').reduce((s, i) => s + i.stat_boost, 0)
  const hasXpBooster = equipped.some(i => i.category === 'booster')
  const effectiveAttack  = player.attack_stat  + attackBoost
  const effectiveDefense = player.defense_stat + defenseBoost

  const [phase,         setPhase]         = useState<BattlePhase>('idle')
  const [playerHp,      setPlayerHp]      = useState(100)
  const [botHp,         setBotHp]         = useState(100)
  const [round,         setRound]         = useState(1)
  const [log,           setLog]           = useState<BattleRoundResult[]>([])
  const [specialUsed,   setSpecialUsed]   = useState(false)
  const [result,        setResult]        = useState<BattleResultState | null>(null)
  const [saveError,     setSaveError]     = useState<string | null>(null)
  const [sessionId,     setSessionId]     = useState<string | null>(null)
  const [botClass,      setBotClass]      = useState<CharacterClass | null>(null)
  const [starting,      setStarting]      = useState(false)
  const [submitting,    setSubmitting]    = useState(false)

  async function startBattle() {
    if (starting) return
    setStarting(true)
    setSaveError(null)
    try {
      const res = await fetch(`${API}/battles/bot/start`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ wallet: walletAddress }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? `API error ${res.status}`)
      }

      const data = await res.json()

      setSessionId(data.session_id)
      setBotClass(data.bot_class as CharacterClass)
      setPlayerHp(100)
      setBotHp(100)
      setRound(1)
      setLog([])
      setSpecialUsed(false)
      setResult(null)
      setPhase('fighting')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to start battle')
    } finally {
      setStarting(false)
    }
  }

  async function handleMove(move: BattleMove) {
    if (phase !== 'fighting' || submitting) return
    if (move === 'special' && specialUsed) return
    if (!sessionId) return

    setSubmitting(true)
    setSaveError(null)

    try {
      const res = await fetch(`${API}/battles/bot/round`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ session_id: sessionId, player_move: move }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const msg = (err as { error?: string }).error ?? `API error ${res.status}`
        // The server already marked special as used for a prior request whose
        // response we may have lost — keep the client in sync either way.
        if (msg === 'Special already used') setSpecialUsed(true)
        throw new Error(msg)
      }

      const data = await res.json()

      const roundEntry: BattleRoundResult = {
        round:      data.round,
        playerMove: data.player_move as BattleMove,
        botMove:    data.bot_move    as BattleMove,
        playerDmg:  data.player_dmg,
        botDmg:     data.bot_dmg,
        playerHp:   data.player_hp,
        botHp:      data.bot_hp,
      }

      const newLog = [...log, roundEntry]
      setLog(newLog)
      setPlayerHp(data.player_hp)
      setBotHp(data.bot_hp)
      if (data.player_move === 'special') setSpecialUsed(true)

      if (data.is_final) {
        const finalResult: BattleResultState = {
          won:       data.won,
          xpAwarded: data.xp_awarded,
          newXp:     data.new_xp,
          rankedUp:  data.ranked_up,
          newRank:   data.new_rank ?? null,
          gAwarded:  data.g_awarded,
          rounds:    newLog,
        }

        // ── Sync player store from server response ───────────────────
        const storeUpdates: Partial<Player> = {
          xp:           data.new_xp,
          wins:         data.won ? player.wins + 1 : player.wins,
          losses:       data.won ? player.losses : player.losses + 1,
          decay_status: 'none',
        }
        if (data.ranked_up && data.new_rank) {
          storeUpdates.rank             = data.new_rank
          storeUpdates.g_earned_lifetime = player.g_earned_lifetime + data.g_awarded
        }
        updatePlayer(storeUpdates)

        // ── Fire-and-forget side effects ─────────────────────────────
        if (player.decay_status === 'active') {
          checkDecayRecovery(walletAddress).catch(console.error)
        }
        checkAchievements(walletAddress).catch(console.error)

        setResult(finalResult)
        setPhase('result')
      } else {
        setRound(data.round + 1)
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to resolve round')
    } finally {
      setSubmitting(false)
    }
  }

  function reset() {
    setPhase('idle')
    setResult(null)
    setSaveError(null)
    setSessionId(null)
    setBotClass(null)
  }

  return {
    phase,
    playerHp,
    botHp,
    round,
    log,
    specialUsed,
    result,
    saveError,
    botClass,
    starting,
    submitting,
    attackBoost,
    defenseBoost,
    hasXpBooster,
    effectiveAttack,
    effectiveDefense,
    startBattle,
    handleMove,
    reset,
  }
}
