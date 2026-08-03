'use client'

import { motion } from 'framer-motion'

interface Props {
  value:     number
  isSpecial: boolean
  side:      'player' | 'bot'
  id:        number
}

export default function DamageNumber({ value, isSpecial, side }: Props) {
  const isBig = value >= 16
  const isMed = value >= 9

  const color = isSpecial
    ? '#f97316'                               // orange — special
    : isBig ? '#ef4444'                       // red — heavy
    : isMed ? '#fbbf24'                       // amber — medium
    : '#e2e8f0'                               // white — light

  const size = isSpecial ? 'text-3xl' : isBig ? 'text-2xl' : isMed ? 'text-xl' : 'text-lg'
  const xDrift = side === 'player' ? -18 : 18 // drift toward center

  return (
    <motion.div
      className={`absolute pointer-events-none z-50 font-display font-black select-none ${size}`}
      style={{
        color,
        textShadow: `0 0 12px ${color}, 0 2px 4px rgba(0,0,0,0.8)`,
        left: '50%',
        top:  '35%',
        transform: 'translateX(-50%)',
        willChange: 'transform, opacity',
      }}
      initial={{ opacity: 1, y: 0,   x: xDrift,       scale: isSpecial ? 1.4 : 1.1 }}
      animate={{ opacity: 0, y: -58, x: xDrift * 1.6, scale: 0.8 }}
      transition={{ duration: isSpecial ? 0.75 : 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      -{value}
      {isSpecial && (
        <span className="text-xs ml-1 font-black tracking-widest uppercase"
          style={{ color: '#fdba74', textShadow: 'none' }}>
          !!
        </span>
      )}
    </motion.div>
  )
}
