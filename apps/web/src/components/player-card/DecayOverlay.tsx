import { motion } from 'framer-motion'
import { AlertTriangle, Skull } from 'lucide-react'
import type { DecayStatus } from '@/utils/decay'

interface Props {
  status: DecayStatus
}

export default function DecayOverlay({ status }: Props) {
  if (status === 'none') return null

  if (status === 'warning') {
    return (
      <motion.div
        className="absolute top-3 right-3 z-20 flex items-center gap-1.5 bg-orange-500/15 border border-orange-500/40 text-orange-400 text-xs font-bold px-2.5 py-1 rounded-lg"
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
      >
        <motion.span
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          <AlertTriangle size={14} />
        </motion.span>
        Decay Warning
      </motion.div>
    )
  }

  // Active decay — cracked frame effect
  return (
    <>
      <motion.div
        className="absolute top-3 right-3 z-20 flex items-center gap-1.5 bg-red-500/15 border border-red-500/40 text-red-400 text-xs font-bold px-2.5 py-1 rounded-lg"
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
      >
        <motion.span
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 0.8, repeat: Infinity }}
        >
          <Skull size={14} />
        </motion.span>
        Decaying
      </motion.div>

      {/* Crack overlay */}
      <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden rounded-2xl">
        <svg
          className="w-full h-full opacity-25"
          viewBox="0 0 100 200"
          preserveAspectRatio="none"
        >
          <polyline
            points="15,0 22,20 13,24 28,55 18,62 32,95 22,108 36,140 24,160 38,200"
            fill="none"
            stroke="#ef4444"
            strokeWidth="0.8"
          />
          <polyline
            points="82,0 76,18 85,22 70,54 80,58 66,92 76,98 62,132 74,152 60,200"
            fill="none"
            stroke="#ef4444"
            strokeWidth="0.8"
          />
          <line x1="22" y1="24" x2="10" y2="30" stroke="#ef4444" strokeWidth="0.5" />
          <line x1="28" y1="55" x2="40" y2="50" stroke="#ef4444" strokeWidth="0.5" />
          <line x1="76" y1="22" x2="90" y2="28" stroke="#ef4444" strokeWidth="0.5" />
        </svg>
      </div>
    </>
  )
}
