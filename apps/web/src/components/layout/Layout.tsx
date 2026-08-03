'use client'

import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Navbar from './Navbar'
import MobileNav from './MobileNav'
import { usePlayerStore } from '@/stores/usePlayerStore'

// Ghost character art that bleeds into background of every page
const CLASS_BG: Record<string, { img: string; accent: string; glow: string }> = {
  Berserker: { img: '/characters/Berserkers.webp',  accent: '#ef4444', glow: 'rgba(239,68,68,0.12)' },
  Sentinel:  { img: '/characters/Sentinel.webp',    accent: '#3b82f6', glow: 'rgba(59,130,246,0.12)' },
  Phantom:   { img: '/characters/Phanthom.webp',    accent: '#8b5cf6', glow: 'rgba(139,92,246,0.12)' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const player = usePlayerStore(s => s.player)
  const theme  = player?.character_class ? CLASS_BG[player.character_class] : null

  const sparks = useMemo(() =>
    Array.from({ length: 8 }, (_, i) => ({
      id: i, left: 60 + (i * 4.5) % 36,
      delay: i * 0.9, dur: 4 + (i % 3),
      size: 1.2 + (i % 3) * 0.5,
    }))
  , [])

  return (
    <div className="min-h-screen bg-[#04030c] flex flex-col relative overflow-hidden">

      {/* ── Atmospheric ghost art — player's class bleeds through every page ── */}
      <AnimatePresence>
        {theme && (
          <motion.div
            key={player?.character_class}
            className="fixed inset-0 pointer-events-none z-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2 }}
          >
            {/* Character ghost — right side */}
            <img
              src={theme.img}
              alt=""
              aria-hidden
              className="absolute right-0 bottom-0 h-full w-auto select-none"
              style={{
                objectFit: 'contain',
                objectPosition: 'right bottom',
                opacity: 0.08,
                filter: 'blur(0.8px) saturate(0.85)',
                maskImage:
                  'linear-gradient(to left, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.3) 35%, transparent 62%)',
                WebkitMaskImage:
                  'linear-gradient(to left, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.3) 35%, transparent 62%)',
              }}
            />
            {/* Faction color glow — ties the ghost to the screen's color grammar */}
            <div className="absolute right-0 inset-y-0 w-1/2 pointer-events-none" style={{
              background: `radial-gradient(ellipse 68% 95% at 88% 58%, ${theme.glow}, transparent)`,
            }} />
            {/* Subtle faction accent at the very bottom — ground light */}
            <div className="absolute inset-x-0 bottom-0 pointer-events-none" style={{
              height: '28%',
              background: `radial-gradient(ellipse 60% 100% at 80% 100%, ${theme.glow.replace('0.12', '0.09')}, transparent)`,
            }} />
            {/* Left edge dark — content zone stays readable */}
            <div className="absolute inset-y-0 left-0 w-1/2 pointer-events-none" style={{
              background: 'linear-gradient(to right, rgba(4,3,12,0.96) 0%, rgba(4,3,12,0.4) 60%, transparent 100%)',
            }} />
            {/* Scanlines */}
            <div className="absolute inset-0 pointer-events-none" style={{
              backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
            }}/>
            {/* Floating sparks from bottom-right — character's aura */}
            {sparks.map(s => (
              <motion.div
                key={s.id}
                className="absolute rounded-full"
                style={{
                  left: `${s.left}%`, bottom: '8%',
                  width: s.size, height: s.size,
                  background: theme.accent,
                  boxShadow: `0 0 4px ${theme.accent}`,
                }}
                animate={{ y: [0, -120], opacity: [0, 0.7, 0], x: [0, (s.id % 2 === 0 ? 1 : -1) * 12] }}
                transition={{ duration: s.dur, delay: s.delay, repeat: Infinity, ease: 'easeOut' }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── UI layers ── */}
      <div className="app-shell relative z-10 flex flex-col min-h-screen">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 py-6 max-w-6xl">
          {children}
        </main>
        <MobileNav />
      </div>
    </div>
  )
}
