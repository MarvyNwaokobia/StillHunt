'use client'

import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Swords, Bot, Crosshair, ExternalLink } from 'lucide-react'
import { formatTallyNumber } from '@/utils/format'
import { ChainBadge } from '@/components/ui/ChainBadge'
import { CAMPAIGN } from '@/engine/fps/campaign'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

interface BattleRow {
  id: string
  challenger_wallet: string
  opponent_wallet: string
  winner_wallet: string
  xp_awarded_challenger: number
  xp_awarded_opponent: number
  is_bot: boolean
  created_at: string
  game_record_tx: string | null
  rounds_data?: { kind?: string; level?: number; won?: boolean } | unknown
  /** REAL TALLY this fight paid (the one-time first-clear bounty). 0 for a replay. */
  g_awarded?: number
  /**
   * Which mode wrote this row. An `endless` row is NOT a defeat — dying is how an
   * Endless row is either a cleared wave or a DEATH INSIDE a run — see endlessInfo.
   * Neither touches the W/L record (`counts_result = false` on both), so neither may
   * be drawn as a plain WIN/LOSS.
   */
  mode?: string | null
}

/**
 * An Endless row carries {mode:"endless", wave, result} — read it rather than inferring
 * from winner_wallet, because "the bot won" means something specific here.
 *
 * A DEATH DOES NOT END THE RUN. record_death leaves the stored wave untouched: you
 * respawn and retry the same wave, so one run can contain many deaths before it is
 * finally cleared. Labelling a death "RUN ENDED" was simply wrong — the run carried on.
 */
function endlessInfo(rounds: BattleRow['rounds_data']): { wave: number; died: boolean } | null {
  if (!rounds || Array.isArray(rounds) || typeof rounds !== 'object') return null
  const r = rounds as { mode?: string; wave?: number; result?: string }
  if (r.mode !== 'endless') return null
  return { wave: typeof r.wave === 'number' ? r.wave : 0, died: r.result === 'death' }
}

/** A campaign fight carries {kind:"mission", level}; resolve its display label. */
function missionInfo(rounds: BattleRow['rounds_data']): { op: number; name: string } | null {
  if (!rounds || Array.isArray(rounds) || typeof rounds !== 'object') return null
  const r = rounds as { kind?: string; level?: number }
  if (r.kind !== 'mission' || typeof r.level !== 'number') return null
  return { op: r.level, name: CAMPAIGN[r.level - 1]?.name ?? 'OPERATION' }
}

interface Props {
  walletAddress: string
}

function shortAddr(addr: string) {
  if (addr === 'bot') return 'Bot'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function timeAgo(iso: string) {
  const ms   = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function BattleHistory({ walletAddress }: Props) {
  const { data: battles = [], isLoading, isError } = useQuery<BattleRow[]>({
    queryKey: ['battles', walletAddress],
    queryFn: async () => {
      const res = await fetch(`${API}/players/${walletAddress}/battles`)
      if (!res.ok) throw new Error(`${res.status}`)
      return res.json()
    },
    staleTime: 60_000,
    retry: 1,
  })

  if (isLoading) {
    return (
      <div className="bg-hunt-surface border border-hunt-border rounded-xl p-5">
        <h3 className="font-display font-bold text-white mb-4">Battle History</h3>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg animate-pulse" style={{ background: 'rgba(18,18,26,0.6)' }} />
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="bg-hunt-surface border border-hunt-border rounded-xl p-6 text-center">
        <Swords size={28} className="text-red-800 mx-auto mb-2" strokeWidth={1.2} />
        <p className="text-slate-500 text-sm">Could not load battle history.</p>
      </div>
    )
  }

  if (battles.length === 0) {
    return (
      <div className="bg-hunt-surface border border-hunt-border rounded-xl p-6 text-center">
        <Swords size={28} className="text-slate-600 mx-auto mb-2" strokeWidth={1.2} />
        <p className="text-slate-500 text-sm">No battles yet. Hit the arena.</p>
      </div>
    )
  }

  return (
    <div className="bg-hunt-surface border border-hunt-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-bold text-white">Battle History</h3>
        <span className="text-[9px] uppercase tracking-widest text-slate-600 font-bold">Last 10</span>
      </div>

      <div className="flex flex-col gap-2">
        {battles.map((battle, i) => {
          const isChallenger = battle.challenger_wallet.toLowerCase() === walletAddress.toLowerCase()
          const won          = battle.winner_wallet.toLowerCase() === walletAddress.toLowerCase()
          const opponent     = isChallenger ? battle.opponent_wallet : battle.challenger_wallet
          const xpEarned     = isChallenger ? battle.xp_awarded_challenger : battle.xp_awarded_opponent
          // The server's real number. This used to be the player's CURRENT rank
          // bonus painted onto every won row, which invented money nobody was paid.
          const gEarned      = battle.g_awarded ?? 0
          const mission      = missionInfo(battle.rounds_data)
          // An Endless row records the END of a run, not a loss. It carries no W/L
          // weight on the server, so it must not be dressed as a defeat here: neutral
          // colour, honest label, and no red bar implying the player did badly.
          const endless      = endlessInfo(battle.rounds_data)
          const isEndless    = endless !== null || battle.mode === 'endless'
          // A death is a real setback and should read as one — it just isn't a LOSS on
          // the record. Kept red, renamed honestly, and stamped with the wave it
          // happened on so a run's story is readable.
          const died         = endless?.died ?? (isEndless && !won)

          return (
            <motion.div
              key={battle.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg border"
              style={{
                background:   won && !died ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.04)',
                borderColor:  won && !died ? 'rgba(34,197,94,0.2)'  : 'rgba(239,68,68,0.15)',
              }}
            >
              {/* Win/loss indicator */}
              <div
                className="w-1 h-8 rounded-full shrink-0"
                style={{ background: won && !died ? '#22c55e' : '#ef4444' }}
              />

              {/* Opponent — a campaign op shows the mission, else the wallet/bot */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {mission ? <Crosshair size={10} className="text-cyan-400 shrink-0" />
                    : battle.is_bot && <Bot size={10} className="text-slate-500 shrink-0" />}
                  {mission
                    ? <p className="text-xs font-bold text-white truncate"><span className="text-slate-500">OP {mission.op} · </span>{mission.name}</p>
                    : isEndless
                      ? <p className="text-xs font-bold text-white truncate">
                          <span className="text-slate-500">ENDLESS · </span>WAVE {endless?.wave ?? '?'}
                        </p>
                      : <p className="text-xs font-bold text-white truncate">{shortAddr(opponent)}</p>}
                  <span
                    className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-sm shrink-0"
                    style={{
                      background: won && !died ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                      color:       won && !died ? '#22c55e' : '#ef4444',
                    }}
                  >
                    {isEndless ? (died ? 'DIED' : 'WAVE CLEARED')
                      : mission ? (won ? 'CLEARED' : 'FAILED')
                      : (won ? 'WIN' : 'LOSS')}
                  </span>
                </div>
                <p className="text-[9px] text-slate-600 mt-0.5">{timeAgo(battle.created_at)}</p>
              </div>

              {/* Rewards */}
              <div className="text-right shrink-0">
                <p className="text-xs font-black" style={{ color: won && !died ? '#22c55e' : '#64748b' }}>
                  +{xpEarned} XP
                </p>
                {gEarned > 0 && (
                  <p className="text-[10px] font-bold text-amber-400">
                    +{formatTallyNumber(gEarned)} TALLY
                    <span className="text-slate-600 font-normal ml-1">first clear</span>
                  </p>
                )}
              </div>

              {/* On-chain record badge */}
              {battle.game_record_tx && (
                <ChainBadge txHash={battle.game_record_tx} className="shrink-0" />
              )}
            </motion.div>
          )
        })}
      </div>

      {/* Lifetime TALLY summary */}
      <div className="mt-4 pt-4 border-t border-hunt-border flex items-center justify-between">
        {/* Counts only rows that are actually a win on the player's record. An
            Endless row is excluded for the same reason it is not drawn as a loss:
            the server does not count it either. */}
        <p className="text-[9px] uppercase tracking-widest text-slate-600 font-bold">
          From {battles.filter(b =>
            b.mode !== 'endless' && b.winner_wallet.toLowerCase() === walletAddress.toLowerCase(),
          ).length} wins
        </p>
        <a
          href={`https://celoscan.io/address/${walletAddress}#tokentxns`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-[9px] text-slate-600 hover:text-amber-400 transition-colors"
        >
          View on Celoscan <ExternalLink size={9} />
        </a>
      </div>
    </div>
  )
}
