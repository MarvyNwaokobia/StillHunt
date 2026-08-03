'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Medal } from 'lucide-react'

import type { Player } from '@/types'
import { formatGDollarNumber } from '@/utils/format'
import { RANK_COLORS, xpForNextRank } from '@/lib/constants'
import { rankLabel } from '@/lib/ranks'

interface Props { currentWallet: string | undefined }

const MEDAL_COLOR = ['#FFD700', '#C0C0C0', '#CD7F32']

const CLASS_ACCENT: Record<string, string> = {
  Berserker: '#ef4444',
  Sentinel:  '#3b82f6',
  Phantom:   '#8b5cf6',
}

export default function LeaderboardTable({ currentWallet }: Props) {
  const [players,    setPlayers]    = useState<Player[]>([])
  const [myPosition, setMyPosition] = useState<number | null>(null)
  const [loading,    setLoading]    = useState(true)

  const loadLeaderboard = useCallback(async () => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/players`)
    if (!res.ok) return
    const data: Player[] = await res.json()
    setPlayers(data.slice(0, 50))
    if (currentWallet) {
      const pos = data.findIndex(p => p.wallet_address.toLowerCase() === currentWallet.toLowerCase())
      setMyPosition(pos >= 0 ? pos + 1 : null)
    }
    setLoading(false)
  }, [currentWallet])

  useEffect(() => {
    loadLeaderboard()
  }, [loadLeaderboard])

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'rgba(18,18,26,0.6)' }} />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {myPosition && myPosition > 50 && (
        <div className="p-3 rounded-xl text-sm font-black text-amber-400 text-center"
          style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)' }}>
          Your position: #{myPosition}
        </div>
      )}

      {/* Top 3 podium */}
      {players.slice(0, 3).length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-2">
          {[players[1], players[0], players[2]].map((p, podiumIdx) => {
            if (!p) return <div key={podiumIdx} />
            const rank = podiumIdx === 0 ? 2 : podiumIdx === 1 ? 1 : 3
            const accent = CLASS_ACCENT[p.character_class ?? ''] ?? '#eab308'
            const isMe = p.wallet_address.toLowerCase() === currentWallet?.toLowerCase()
            const heights = ['h-24', 'h-28', 'h-20']
            return (
              <motion.div key={p.wallet_address}
                className={`relative flex flex-col items-center justify-end p-3 rounded-xl overflow-hidden ${heights[podiumIdx]}`}
                style={{ background: `linear-gradient(180deg, ${accent}12, rgba(4,3,12,0.95))`, border: `1px solid ${accent}30` }}
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: rank * 0.08 }}>
                <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: accent }}/>
                <Medal size={22} className="mb-0.5" color={MEDAL_COLOR[rank - 1]} />
                <p className="font-black text-white text-xs text-center truncate w-full">{p.character_name}</p>
                <span className="text-[8px] uppercase tracking-wider font-bold" style={{ color: accent }}>{rankLabel(p.rank, p.prestige_level ?? 0)}</span>
                {isMe && <span className="absolute top-1.5 right-1.5 text-[7px] font-black bg-amber-400 text-black px-1 rounded-sm">YOU</span>}
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Rest of the list */}
      <AnimatePresence initial={false}>
        {players.map((player, i) => {
          const isMe        = player.wallet_address.toLowerCase() === currentWallet?.toLowerCase()
          const pos         = i + 1
          const rankColor   = RANK_COLORS[player.rank]
          const classAccent = CLASS_ACCENT[player.character_class ?? ''] ?? rankColor
          const isUpdating  = false

          return (
            <motion.div key={player.wallet_address} layout
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}>
              <Link
                href={`/card/${player.wallet_address}`}
                className="group flex items-center gap-3 px-4 py-3 rounded-xl border transition-all"
                style={{
                  background:   isMe ? `${classAccent}08` : isUpdating ? 'rgba(34,197,94,0.05)' : 'rgba(8,8,14,0.85)',
                  borderColor:  isMe ? `${classAccent}40` : isUpdating ? 'rgba(34,197,94,0.3)' : 'rgba(42,42,58,0.7)',
                }}
              >
                {/* Position */}
                <div className="w-8 text-center shrink-0">
                  {pos <= 3
                    ? <Medal size={18} className="inline" color={MEDAL_COLOR[pos - 1]} />
                    : <span className="font-black text-slate-600 text-xs">#{pos}</span>
                  }
                </div>

                {/* Class color bar */}
                <div className="w-0.5 h-8 rounded-full shrink-0" style={{ background: classAccent, opacity: 0.6 }}/>

                {/* Name + rank */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-black text-white text-sm truncate group-hover:text-amber-400 transition-colors">
                      {player.character_name}
                    </p>
                    {isMe && <span className="text-[7px] bg-amber-400 text-black font-black px-1.5 py-0.5 rounded-sm uppercase shrink-0">You</span>}
                    {isUpdating && <span className="text-[7px] bg-green-500 text-black font-black px-1.5 py-0.5 rounded-sm uppercase shrink-0 animate-pulse">Live</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-sm"
                      style={{ background: `${classAccent}15`, color: classAccent }}>
                      {player.character_class}
                    </span>
                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: rankColor }}>
                      {rankLabel(player.rank, player.prestige_level ?? 0)}
                    </span>
                    <span className="text-[9px] text-slate-600">{player.xp.toLocaleString()} XP</span>
                  </div>
                </div>

                {/* Stats */}
                <div className="text-right hidden sm:flex flex-col gap-0.5 shrink-0">
                  <p className="text-xs font-black text-amber-400">{formatGDollarNumber(player.g_earned_lifetime)}</p>
                  <p className="text-[9px] text-slate-600">
                    <span className="text-green-500 font-bold">{player.wins}W</span>
                    <span className="mx-0.5 text-slate-700">/</span>
                    <span className="text-red-500 font-bold">{player.losses}L</span>
                  </p>
                </div>

                {/* XP bar strip */}
                <div className="w-10 shrink-0 hidden md:block">
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(42,42,58,0.8)' }}>
                    <motion.div className="h-full rounded-full"
                      style={{ background: rankColor }}
                      // Bar size varies by rank on the progressive ladder. This was a
                      // hardcoded /1000, a threshold that stopped existing two changes
                      // ago, so every row past 1000 XP read as permanently full.
                      animate={{ width: `${Math.min((player.xp / xpForNextRank(player.rank)) * 100, 100)}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                </div>
              </Link>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
