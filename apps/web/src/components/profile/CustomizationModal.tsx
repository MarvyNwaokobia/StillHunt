'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePlayerStore } from '@/stores/usePlayerStore'
import type { CharacterCustomization } from '@/types/database'

interface Props {
  walletAddress: string
  current: CharacterCustomization
  onClose: () => void
}

const SKIN_TONES = [
  '#fde8d5', '#f5c9a0', '#d4935a',
  '#a0612a', '#7b4012', '#3d1f0a',
]

const HAIR_COLORS = [
  '#0a0805', '#3d2210', '#6b2a12',
  '#c8901a', '#c8c0a8', '#e8e4f0',
]

const HAIR_STYLES = [
  { id: 'crop',    label: 'Crop'    },
  { id: 'spiky',   label: 'Spiky'   },
  { id: 'long',    label: 'Long'    },
  { id: 'topknot', label: 'Topknot' },
  { id: 'bald',    label: 'Bald'    },
]

export default function CustomizationModal({ walletAddress, current, onClose }: Props) {
  const updatePlayer = usePlayerStore(s => s.updatePlayer)
  const [skin,      setSkin]      = useState(current.skin      ?? SKIN_TONES[0])
  const [hairColor, setHairColor] = useState(current.hair      ?? HAIR_COLORS[0])
  const [hairStyle, setHairStyle] = useState(current.outfit    ?? 'crop')
  const [pending,   setPending]   = useState(false)
  const [saved,     setSaved]     = useState(false)

  async function handleSave() {
    if (pending) return
    setPending(true)
    const customization: CharacterCustomization = {
      skin:    skin,
      hair:    hairColor,
      outfit:  hairStyle,
    }
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/players/${walletAddress}`,
        {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ character_customization: customization }),
        },
      )
      if (!res.ok) return
      updatePlayer({ character_customization: customization })
      setSaved(true)
      setTimeout(onClose, 900)
    } finally {
      setPending(false)
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <motion.div
        className="relative w-full max-w-sm rounded-2xl border border-hunt-border bg-hunt-surface p-6 flex flex-col gap-5"
        initial={{ scale: 0.92, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 16 }}
      >
        <div>
          <h2 className="font-display font-black text-white text-xl">Customize Warrior</h2>
          <p className="text-slate-400 text-sm mt-1">
            Visual identity. Permanent to your warrior's soul.
          </p>
        </div>

        {/* Preview swatch */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-hunt-surface-2 border border-hunt-border">
          <div
            className="w-12 h-12 rounded-full border-2 border-hunt-border shrink-0"
            style={{ background: skin }}
          />
          <div className="flex flex-col gap-1">
            <div
              className="w-20 h-3 rounded-full"
              style={{ background: hairColor }}
            />
            <p className="text-xs text-slate-500">{HAIR_STYLES.find(s => s.id === hairStyle)?.label} cut</p>
          </div>
        </div>

        {/* Skin tone */}
        <div>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2">Skin Tone</p>
          <div className="flex gap-2 flex-wrap">
            {SKIN_TONES.map(tone => (
              <button
                key={tone}
                onClick={() => setSkin(tone)}
                className="w-8 h-8 rounded-full border-2 transition-all"
                style={{
                  background: tone,
                  borderColor: skin === tone ? '#fff' : 'transparent',
                  boxShadow:   skin === tone ? '0 0 0 2px rgba(255,255,255,0.3)' : 'none',
                }}
                aria-label={tone}
              />
            ))}
          </div>
        </div>

        {/* Hair color */}
        <div>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2">Hair Color</p>
          <div className="flex gap-2 flex-wrap">
            {HAIR_COLORS.map(color => (
              <button
                key={color}
                onClick={() => setHairColor(color)}
                className="w-8 h-8 rounded-full border-2 transition-all"
                style={{
                  background: color,
                  borderColor: hairColor === color ? '#fff' : 'transparent',
                  boxShadow:   hairColor === color ? '0 0 0 2px rgba(255,255,255,0.3)' : 'none',
                }}
                aria-label={color}
              />
            ))}
          </div>
        </div>

        {/* Hair style */}
        <div>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2">Style</p>
          <div className="flex gap-2 flex-wrap">
            {HAIR_STYLES.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setHairStyle(id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                  hairStyle === id
                    ? 'bg-hunt-gold/20 border-hunt-gold/60 text-hunt-gold'
                    : 'bg-hunt-surface-2 border-hunt-border text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {saved ? (
            <motion.div
              key="saved"
              className="flex items-center justify-center gap-2 py-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 font-bold text-sm"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <span>✓</span> Saved!
            </motion.div>
          ) : (
            <motion.button
              key="save"
              onClick={handleSave}
              disabled={pending}
              className="w-full py-3 rounded-xl font-display font-black uppercase tracking-widest text-sm text-black transition-all disabled:opacity-40"
              style={{ background: 'var(--color-hunt-gold, #c8a94b)' }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {pending ? 'Saving…' : 'Save Look'}
            </motion.button>
          )}
        </AnimatePresence>

        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-600 hover:text-slate-300 transition-colors"
          aria-label="Close"
        >
          ✕
        </button>
      </motion.div>
    </motion.div>
  )
}
