'use client'

import { motion } from 'framer-motion'
import type { ShakeLevel } from '@/hooks/useCombatFeel'

interface Props {
  color: string
  level: ShakeLevel
}

const SPIKES = 8

export default function HitSpark({ color, level }: Props) {
  const coreSize = level >= 3 ? 36 : level >= 2 ? 26 : 18
  const spikeLen = level >= 3 ? 64 : level >= 2 ? 48 : 34
  const duration = level >= 3 ? 0.26 : level >= 2 ? 0.21 : 0.17

  return (
    <div className="absolute pointer-events-none z-40">
      {/* White core flash — the "snap" of impact */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: coreSize, height: coreSize,
          left: -coreSize / 2, top: -coreSize / 2,
          background: '#fff',
          boxShadow: `0 0 ${coreSize * 0.8}px #fff, 0 0 ${coreSize * 2}px ${color}`,
        }}
        initial={{ scale: 0, opacity: 1 }}
        animate={{ scale: [0, 1, 0.3], opacity: [1, 1, 0] }}
        transition={{ duration, ease: 'easeOut' }}
      />
      {/* Star-burst spikes radiating from the point of contact */}
      {Array.from({ length: SPIKES }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{
            width: 3, height: spikeLen,
            left: -1.5, top: -spikeLen,
            background: `linear-gradient(to top, ${color}, transparent)`,
            transformOrigin: '50% 100%',
            rotate: `${(i * 360) / SPIKES + (level >= 3 ? 0 : 22.5)}deg`,
          }}
          initial={{ scaleY: 0, opacity: 1 }}
          animate={{ scaleY: [0, 1, 0.4], opacity: [1, 1, 0] }}
          transition={{ duration: duration + 0.05, ease: [0.16, 1, 0.3, 1], delay: i % 2 === 0 ? 0 : 0.015 }}
        />
      ))}
    </div>
  )
}
