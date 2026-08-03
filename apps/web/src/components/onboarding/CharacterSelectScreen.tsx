'use client'

import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CHARACTER_CLASSES, CLASS_DEFINITIONS, CHARACTER_GLB } from '@/lib/classes'
import type { CharacterClass } from '@/lib/classes'
import CharacterViewer from '@/components/warrior/CharacterViewer'

interface Props {
  onSelect: (characterClass: CharacterClass) => void
}

const STAT_LABELS = [
  { key: 'attack',  label: 'ATK', color: '#ef4444' },
  { key: 'defense', label: 'DEF', color: '#3b82f6' },
  { key: 'speed',   label: 'SPD', color: '#22c55e' },
] as const

const TOTAL_CLASSES = CHARACTER_CLASSES.length

export default function CharacterSelectScreen({ onSelect }: Props) {
  const [index, setIndex] = useState(0)

  const selectedClass = CHARACTER_CLASSES[index]
  const def           = CLASS_DEFINITIONS[selectedClass]

  const navigate = useCallback((direction: 1 | -1) => {
    setIndex(i => (i + direction + TOTAL_CLASSES) % TOTAL_CLASSES)
  }, [])

  // Preload adjacent GLBs for smooth transitions
  useEffect(() => {
    const next = CHARACTER_CLASSES[(index + 1) % TOTAL_CLASSES]
    const prev = CHARACTER_CLASSES[(index - 1 + TOTAL_CLASSES) % TOTAL_CLASSES]
    CharacterViewer.preload(CHARACTER_GLB[next])
    CharacterViewer.preload(CHARACTER_GLB[prev])
  }, [index])

  return (
    <div className="fixed inset-0 overflow-hidden z-60" style={{ background: '#04030c' }}>

      {/* ── ATMOSPHERE — faction color shifts with selected class ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={selectedClass}
          className="absolute inset-0 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
        >
          {/* Ground bloom */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2" style={{
            width: '80%', height: '50%',
            background: `radial-gradient(ellipse at 50% 100%, ${def.accentColor}28 0%, transparent 65%)`,
          }} />
          {/* Top vignette */}
          <div className="absolute inset-x-0 top-0" style={{
            height: '35%',
            background: 'linear-gradient(180deg, rgba(4,3,12,0.92) 0%, transparent 100%)',
          }} />
          {/* Bottom panel gradient */}
          <div className="absolute inset-x-0 bottom-0" style={{
            height: '42%',
            background: 'linear-gradient(0deg, rgba(4,3,12,0.98) 0%, rgba(4,3,12,0.85) 55%, transparent 100%)',
          }} />
          {/* Side rim lights */}
          <div className="absolute inset-y-0 left-0" style={{
            width: '18%',
            background: `linear-gradient(to right, ${def.accentColor}10, transparent)`,
          }} />
          <div className="absolute inset-y-0 right-0" style={{
            width: '18%',
            background: `linear-gradient(to left, ${def.accentColor}10, transparent)`,
          }} />
        </motion.div>
      </AnimatePresence>

      {/* ── HEADER ── */}
      <div className="char-select-header absolute inset-x-0 top-0 z-20 flex items-start justify-between px-5 pt-5">
        <div>
          <p className="font-display font-bold uppercase" style={{
            fontSize: '9px', letterSpacing: '0.42em', color: 'rgba(234,179,8,0.5)',
          }}>
            STILLHUNT
          </p>
          <h1 className="font-display font-black text-white leading-none" style={{
            fontSize: 'clamp(1.1rem, 3vw, 1.6rem)', letterSpacing: '0.08em',
          }}>
            CHOOSE YOUR <span style={{ color: def.accentColor }}>WARRIOR</span>
          </h1>
        </div>

      </div>

      {/* ── CHARACTER — 3D viewer ── */}
      <CharacterViewer
        glbPath={CHARACTER_GLB[selectedClass]}
        accentColor={def.accentColor}
        animationName="idle"
        modelKey={selectedClass}
      />

      {/* ── LEFT / RIGHT NAVIGATION ── */}
      <button
        onClick={() => navigate(-1)}
        className="char-select-nav absolute left-3 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center rounded-full transition-all active:scale-90"
        style={{
          width: 44, height: 44,
          background: 'rgba(255,255,255,0.05)',
          border: `1px solid rgba(255,255,255,0.1)`,
        }}
      >
        <ChevronLeft color={def.accentColor} />
      </button>
      <button
        onClick={() => navigate(1)}
        className="absolute right-3 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center rounded-full transition-all active:scale-90"
        style={{
          width: 44, height: 44,
          background: 'rgba(255,255,255,0.05)',
          border: `1px solid rgba(255,255,255,0.1)`,
        }}
      >
        <ChevronRight color={def.accentColor} />
      </button>

      {/* ── BOTTOM PANEL ── */}
      <div className="char-select-panel absolute inset-x-0 bottom-0 z-20 flex flex-col px-5 gap-3"
        style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom, 24px))' }}>

        {/* Class name + tagline */}
        <AnimatePresence mode="wait">
          <motion.div
            key={selectedClass}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col gap-0.5"
          >
            <div className="flex items-center gap-3">
              <h2 className="font-display font-black leading-none" style={{
                fontSize: 'clamp(2rem, 6vw, 3.2rem)',
                letterSpacing: '0.06em',
                color: def.accentColor,
                textShadow: `0 0 32px ${def.accentColor}`,
              }}>
                {def.name.toUpperCase()}
              </h2>
              {/* Dot indicator */}
              <div className="flex gap-1.5 pb-1">
                {CHARACTER_CLASSES.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setIndex(i)}
                    style={{
                      width: i === index ? 20 : 6,
                      height: 6,
                      borderRadius: 3,
                      background: i === index ? def.accentColor : 'rgba(255,255,255,0.15)',
                      transition: 'all 0.3s ease',
                    }}
                  />
                ))}
              </div>
            </div>
            <p className="font-display font-bold uppercase" style={{
              fontSize: '10px', letterSpacing: '0.28em', color: 'rgba(255,255,255,0.4)',
            }}>
              {def.tagline}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* Stats */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`stats-${selectedClass}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, delay: 0.05 }}
            className="flex gap-2"
          >
            {STAT_LABELS.map(({ key, label, color }) => {
              const val = def.stats[key]
              const pct = (val / 20) * 100
              return (
                <div key={key} className="flex-1 flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <span className="font-display font-black" style={{ fontSize: '9px', letterSpacing: '0.18em', color }}>
                      {label}
                    </span>
                    <span className="font-black text-white" style={{ fontSize: '11px' }}>{val}</span>
                  </div>
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
                    />
                  </div>
                </div>
              )
            })}
          </motion.div>
        </AnimatePresence>

        {/* Class description — hidden in landscape compact mode */}
        <AnimatePresence mode="wait">
          <motion.p
            key={`desc-${selectedClass}`}
            className="char-select-desc"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, delay: 0.08 }}
            style={{ fontSize: '11px', color: 'rgba(255,255,255,0.42)', lineHeight: 1.55 }}
          >
            {def.description}
          </motion.p>
        </AnimatePresence>

        {/* Weapon + Special */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`info-${selectedClass}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, delay: 0.1 }}
            className="flex gap-2"
          >
            <div className="flex-1 rounded-xl px-3 py-2 border" style={{
              background: def.accentColorDim,
              borderColor: `${def.accentColor}25`,
            }}>
              <p style={{ fontSize: '8px', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)' }} className="uppercase font-bold mb-0.5">Weapon</p>
              <p className="font-display font-black text-white" style={{ fontSize: '11px' }}>{def.weapon}</p>
            </div>
            <div className="flex-1 rounded-xl px-3 py-2 border" style={{
              background: def.accentColorDim,
              borderColor: `${def.accentColor}25`,
            }}>
              <p style={{ fontSize: '8px', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)' }} className="uppercase font-bold mb-0.5">Special</p>
              <p className="font-display font-black" style={{ fontSize: '11px', color: def.accentColor }}>{def.special}</p>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Permanence stamp */}
        <div className="permanence-stamp justify-center py-1">
          ⬡ This warrior is your permanent identity
        </div>

        {/* CTA */}
        <motion.button
          onClick={() => onSelect(selectedClass)}
          whileHover={{ scale: 1.02, filter: 'brightness(1.12)' }}
          whileTap={{ scale: 0.97 }}
          className="relative overflow-hidden font-display font-black uppercase w-full"
          style={{
            fontSize: 'clamp(12px, 2.4vw, 15px)',
            letterSpacing: '0.24em',
            color: '#080610',
            padding: 'clamp(14px, 2.8vw, 18px) 0',
            background: `linear-gradient(135deg, ${def.accentColor}ee, ${def.accentColor})`,
            clipPath: 'polygon(12px 0%, 100% 0%, calc(100% - 12px) 100%, 0% 100%)',
            boxShadow: `0 0 36px ${def.accentColor}55, 0 6px 24px rgba(0,0,0,0.9)`,
          }}
        >
          {/* Shimmer */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(108deg, transparent 28%, rgba(255,255,255,0.25) 50%, transparent 72%)' }}
            animate={{ x: ['-140%', '220%'] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'linear', repeatDelay: 2.8 }}
          />
          Claim {def.name}
        </motion.button>

      </div>
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function ChevronLeft({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M15 18l-6-6 6-6" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChevronRight({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M9 18l6-6-6-6" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
