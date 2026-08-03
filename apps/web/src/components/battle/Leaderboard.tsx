'use client'

import { useState } from 'react'
import { Trophy } from 'lucide-react'
import { useLeaderboard, type LeaderScope } from '@/hooks/useLeaderboard'

interface Props {
  /** Highlight this wallet's row (the current player). */
  highlightWallet?: string
}

const short = (w: string) => `${w.slice(0, 6)}…${w.slice(-4)}`
const RANK_COLOR = ['#ffd700', '#c0c0c0', '#cd7f32'] // gold / silver / bronze

export default function Leaderboard({ highlightWallet }: Props) {
  const [scope, setScope] = useState<LeaderScope>('weekly')
  const { data: entries = [], isLoading } = useLeaderboard(scope)
  const me = highlightWallet?.toLowerCase()

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="flex items-center gap-2 mb-3">
        <Trophy size={16} className="text-amber-400" />
        <h3 className="font-display font-black text-white text-lg">Endless Leaderboard</h3>
      </div>

      <div className="flex gap-1 mb-3 p-1 rounded-lg" style={{ background: 'rgba(8,8,14,0.9)' }}>
        {(['weekly', 'all'] as LeaderScope[]).map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            className="flex-1 text-xs font-bold uppercase tracking-wider py-1.5 rounded-md transition-colors"
            style={scope === s
              ? { background: '#eab308', color: '#000' }
              : { color: '#94a3b8' }}
          >
            {s === 'weekly' ? 'This Week' : 'All Time'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-slate-500 text-sm text-center py-6">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-6">No runs yet — be the first.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {entries.map((e, i) => {
            const isMe = me && e.wallet_address.toLowerCase() === me
            return (
              <div
                key={e.wallet_address}
                className="flex items-center gap-3 px-3 py-2 rounded-lg border"
                style={{
                  background: isMe ? 'rgba(234,179,8,0.12)' : 'rgba(8,8,14,0.9)',
                  borderColor: isMe ? 'rgba(234,179,8,0.5)' : 'rgba(42,42,58,0.8)',
                }}
              >
                <span className="w-6 text-center font-display font-black text-sm"
                  style={{ color: RANK_COLOR[i] ?? '#64748b' }}>
                  {i + 1}
                </span>
                <span className="flex-1 truncate text-sm text-white font-bold">
                  {e.username || short(e.wallet_address)}
                  {isMe && <span className="ml-1.5 text-[10px] text-amber-400">YOU</span>}
                </span>
                <span className="font-display font-black text-white text-sm">{e.best}</span>
                <span className="text-[10px] text-slate-500 uppercase">waves</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
