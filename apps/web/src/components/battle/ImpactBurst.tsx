'use client'

import { motion } from 'framer-motion'
import { useMemo } from 'react'

interface Props {
  color: string
  secondaryColor?: string
  size?: 'sm' | 'md' | 'lg'
}

const SIZES = {
  sm: { count: 6,  dist: 24, pSize: 3 },
  md: { count: 8,  dist: 36, pSize: 4 },
  lg: { count: 12, dist: 50, pSize: 5 },
}

export default function ImpactBurst({ color, secondaryColor, size = 'md' }: Props) {
  const { count, dist, pSize } = SIZES[size]
  const sec = secondaryColor ?? color

  const particles = useMemo(() =>
    Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * 360 + (i % 2 === 0 ? 15 : -10)
      const d = dist + (i % 3) * 12
      const s = pSize + (i % 2)
      const c = i % 4 === 0 ? sec : color
      return {
        id:    i,
        x:     Math.cos((angle * Math.PI) / 180) * d,
        y:     Math.sin((angle * Math.PI) / 180) * d,
        size:  s,
        color: c,
      }
    })
  , [count, dist, pSize, color, sec])

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40">
      {/* Expanding ring */}
      <motion.div
        className="absolute rounded-full border-2"
        style={{ borderColor: `${color}90`, width: 16, height: 16 }}
        initial={{ scale: 0.5, opacity: 0.9 }}
        animate={{ scale: 3.5, opacity: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      />

      {/* Secondary ring (slower) */}
      <motion.div
        className="absolute rounded-full border"
        style={{ borderColor: `${color}50`, width: 12, height: 12 }}
        initial={{ scale: 0.5, opacity: 0.6 }}
        animate={{ scale: 2.8, opacity: 0 }}
        transition={{ duration: 0.55, ease: 'easeOut', delay: 0.04 }}
      />

      {/* Particles */}
      {particles.map(p => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            width:     p.size,
            height:    p.size,
            background: p.color,
            boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
            flexShrink: 0,
          }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: p.x, y: p.y, opacity: 0, scale: 0.2 }}
          transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1], delay: 0.01 * p.id }}
        />
      ))}

    </div>
  )
}
