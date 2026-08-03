import { useEffect } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import type { Rank } from '@/types'
import { RANK_COLORS } from '@/lib/constants'

interface Props {
  xp: number
  max: number
  rank: Rank
}

export default function XpMeter({ xp, max, rank }: Props) {
  const pct = Math.min(100, (xp / max) * 100)
  const rankColor = RANK_COLORS[rank]

  const motionPct = useMotionValue(0)
  const springPct = useSpring(motionPct, { stiffness: 60, damping: 18 })

  useEffect(() => {
    motionPct.set(pct)
  }, [pct])

  const widthPct = useTransform(springPct, (v) => `${v}%`)

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">XP</span>
        <span className="text-xs font-bold text-slate-300">
          {xp.toLocaleString()}
          <span className="text-slate-600"> / {max.toLocaleString()}</span>
        </span>
      </div>

      <div className="h-3 bg-hunt-surface-2 rounded-full overflow-hidden border border-hunt-border/50 relative">
        <motion.div
          className="h-full rounded-full relative overflow-hidden"
          style={{
            width: widthPct,
            background: `linear-gradient(90deg, ${rankColor}88 0%, ${rankColor} 100%)`,
          }}
        >
          {/* Shimmer effect */}
          <motion.div
            className="absolute inset-0 opacity-40"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, white 50%, transparent 100%)',
              backgroundSize: '200% 100%',
            }}
            animate={{ backgroundPosition: ['200% 0', '-200% 0'] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
          />
        </motion.div>

        {/* Rank-up pulse at 100% */}
        {pct >= 99 && (
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ background: rankColor }}
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
        )}
      </div>

      {pct >= 99 && (
        <motion.p
          className="text-xs font-bold text-center"
          style={{ color: rankColor }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          ✦ Rank up ready — collect your G$!
        </motion.p>
      )}
    </div>
  )
}
