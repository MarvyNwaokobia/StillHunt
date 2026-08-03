'use client'

import { motion } from 'framer-motion'
import { Trophy } from 'lucide-react'
import LeaderboardTable from '@/components/leaderboard/LeaderboardTable'
import { useResolvedAuth } from '@/hooks/useResolvedAuth'

export default function LeaderboardPage() {
  const { address } = useResolvedAuth()

  return (
    <div className="flex flex-col gap-6">

      {/* ── War Board header ── */}
      <motion.div
        className="relative overflow-hidden rounded-2xl p-6"
        style={{ background: 'rgba(8,8,14,0.95)', border: '1px solid rgba(59,130,246,0.2)' }}
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
      >
        <div className="absolute inset-y-0 left-0 w-1 rounded-l-2xl" style={{ background: 'linear-gradient(180deg, #60a5fa, #3b82f6, #1d4ed8)' }}/>
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse 60% 100% at 0% 50%, rgba(59,130,246,0.06), transparent)',
        }}/>
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.04) 2px, rgba(0,0,0,0.04) 4px)',
        }}/>

        <div className="relative z-10 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)' }}>
            <Trophy size={22} style={{ color: '#3b82f6' }} strokeWidth={1.8}/>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-[0.3em] font-bold mb-0.5" style={{ color: 'rgba(96,165,250,0.6)' }}>StillHunt Rankings</p>
            <h1 className="font-display font-black text-white text-2xl tracking-wide">War Board</h1>
            <p className="text-slate-500 text-xs mt-0.5">Top 50 warriors · Live updates · Ranked by tier &amp; XP</p>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.12 }}
      >
        <LeaderboardTable currentWallet={address} />
      </motion.div>
    </div>
  )
}
