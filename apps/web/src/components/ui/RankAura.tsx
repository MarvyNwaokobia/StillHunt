'use client'

import { motion } from 'framer-motion'
import { useMemo } from 'react'
import type { Rank } from '@/types/database'
import { RANK_DEFINITIONS } from '@/lib/ranks'

interface Props {
  rank: Rank
  classColor?: string
  /** 'character' wraps a 3D stage; 'badge' is a small inline badge glow */
  mode?: 'character' | 'badge'
  children?: React.ReactNode
}

const PARTICLE_COUNT = 12

export default function RankAura({ rank, classColor, mode = 'character', children }: Props) {
  const def = RANK_DEFINITIONS[rank]
  const col = classColor ?? def.color

  const particles = useMemo(() =>
    Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      id: i,
      x: -40 + (i % 6) * 16 + Math.sin(i * 1.7) * 8,
      delay: i * 0.22,
      duration: 1.8 + (i % 4) * 0.35,
      size: 2 + (i % 3),
    }))
  , [])

  if (mode === 'badge') {
    return (
      <span
        className="relative inline-flex items-center"
        style={{
          filter: def.tier >= 3 ? `drop-shadow(0 0 6px ${def.color}88)` : undefined,
        }}
      >
        {children}
      </span>
    )
  }

  // Character stage mode — wraps the warrior display area
  return (
    <div className="relative w-full h-full">
      {/* Aura ring layers — only Silver+ */}
      {def.hasAura && (
        <>
          {/* Outer slow pulse */}
          <motion.div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background: `radial-gradient(ellipse 80% 60% at 50% 80%, ${col}18 0%, transparent 70%)`,
            }}
            animate={{ opacity: [0.6, 1, 0.6], scale: [1, 1.04, 1] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Inner intensity ring */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(ellipse 50% 30% at 50% 90%, ${col}28 0%, transparent 60%)`,
            }}
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 2.1, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
          />
        </>
      )}

      {/* Armor light sweep — Gold+ */}
      {def.armorLight && (
        <motion.div
          className="absolute inset-0 pointer-events-none overflow-hidden rounded-sm"
          style={{ mixBlendMode: 'screen' }}
        >
          <motion.div
            style={{
              position: 'absolute',
              width: '30%',
              height: '100%',
              background: `linear-gradient(105deg, transparent 0%, ${col}12 45%, ${col}22 50%, ${col}12 55%, transparent 100%)`,
            }}
            animate={{ x: ['-100%', '460%'] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: 'linear', repeatDelay: 2 }}
          />
        </motion.div>
      )}

      {/* Diamond particles — rising embers */}
      {def.hasParticles && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {particles.map(p => (
            <motion.div
              key={p.id}
              className="absolute rounded-full"
              style={{
                width: p.size,
                height: p.size,
                background: col,
                boxShadow: `0 0 ${p.size * 3}px ${col}`,
                left: `calc(50% + ${p.x}px)`,
                bottom: '10%',
              }}
              animate={{
                y: [0, -(80 + p.id * 10)],
                opacity: [0, 0.9, 0],
                x: [0, Math.sin(p.id) * 16],
              }}
              transition={{
                duration: p.duration,
                repeat: Infinity,
                ease: 'easeOut',
                delay: p.delay,
              }}
            />
          ))}
        </div>
      )}

      {/* Content */}
      {children}

      {/* Bottom ground glow — all tiers, intensity scales with tier */}
      <div
        className="absolute bottom-0 inset-x-0 pointer-events-none"
        style={{
          height: 80,
          background: `radial-gradient(ellipse 70% 100% at 50% 100%, ${col}${Math.round(def.tier * 9).toString(16).padStart(2, '0')} 0%, transparent 70%)`,
        }}
      />
    </div>
  )
}
