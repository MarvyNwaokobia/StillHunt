'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { CharacterClass } from '@/lib/classes'

// ── Prompt engine ─────────────────────────────────────────────────────────────

const CLASS_PROMPT: Record<CharacterClass, string> = {
  Berserker: 'berserker warrior, massive battle axe, rage-fueled, scarred face, heavy fur pauldrons',
  Sentinel:  'sentinel knight in heavy plate armor, crackling blue lightning, shield raised, guardian pose',
  Phantom:   'phantom assassin, sleek dark leather armor, glowing violet eyes, shadows swirling around them',
}

const SKIN_LABEL: Record<string, string> = {
  '#fde8d5': 'fair skin',
  '#f5c9a0': 'light skin',
  '#d4935a': 'tan skin',
  '#a0612a': 'brown skin',
  '#7b4012': 'dark brown skin',
  '#3d1f0a': 'dark skin',
}

export type ArmorStyle = 'battle-worn' | 'pristine' | 'runic'

const ARMOR_LABELS: Record<ArmorStyle, string> = {
  'battle-worn': 'Battle-worn',
  'pristine':    'Pristine',
  'runic':       'Runic',
}

// Builds the Pollinations.ai image URL. The wallet seed makes each portrait
// unique per player even with identical class/gender/style selections.
export function buildPortraitUrl(
  characterClass: CharacterClass,
  gender: 'male' | 'female',
  skinTone: string,
  armorStyle: ArmorStyle,
  walletSeed: string,
): string {
  const seed = parseInt(walletSeed.slice(2, 10), 16) % 1_000_000

  const prompt = [
    CLASS_PROMPT[characterClass],
    gender === 'female' ? 'female warrior' : 'male warrior',
    SKIN_LABEL[skinTone] ?? 'medium skin',
    `${armorStyle} armor`,
    'epic fantasy game character, full body portrait, dark dramatic lighting, pure black background, photorealistic, 8k resolution, cinematic game art, highly detailed',
  ].join(', ')

  const encoded = encodeURIComponent(prompt)
  return `https://image.pollinations.ai/prompt/${encoded}?width=512&height=768&seed=${seed}&nologo=true&enhance=true`
}

// ── Component ─────────────────────────────────────────────────────────────────

const SKIN_TONES = ['#fde8d5', '#f5c9a0', '#d4935a', '#a0612a', '#7b4012', '#3d1f0a']
const ARMOR_STYLES: ArmorStyle[] = ['battle-worn', 'pristine', 'runic']

interface Props {
  characterClass: CharacterClass
  gender: 'male' | 'female'
  accentColor: string
  walletAddress: string
  onGenerated: (portraitUrl: string, skinTone: string, armorStyle: ArmorStyle) => void
}

export default function AvatarGenerator({
  characterClass,
  gender,
  accentColor,
  walletAddress,
  onGenerated,
}: Props) {
  const [skinTone,   setSkinTone]   = useState(SKIN_TONES[1])
  const [armorStyle, setArmorStyle] = useState<ArmorStyle>('battle-worn')
  const [imageUrl,   setImageUrl]   = useState<string | null>(null)
  const [loading,    setLoading]    = useState(false)
  const [generated,  setGenerated]  = useState(false)

  function generate() {
    const url = buildPortraitUrl(characterClass, gender, skinTone, armorStyle, walletAddress)
    setImageUrl(url)
    setLoading(true)
    setGenerated(false)
  }

  function handleImageLoad() {
    setLoading(false)
    setGenerated(true)
    onGenerated(imageUrl!, skinTone, armorStyle)
  }

  function handleImageError() {
    setLoading(false)
    setImageUrl(null)
  }

  return (
    <div className="flex flex-col gap-3">

      {/* Portrait preview area */}
      <AnimatePresence mode="wait">
        {imageUrl ? (
          <motion.div
            key="preview"
            className="relative w-full rounded-xl overflow-hidden flex items-center justify-center"
            style={{ height: 200, background: '#0a0a14', border: `1px solid ${accentColor}20` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {/* Hidden img that triggers the generation */}
            <img
              src={imageUrl}
              alt="Generated portrait"
              onLoad={handleImageLoad}
              onError={handleImageError}
              className={`h-full w-auto object-contain transition-opacity duration-500 ${generated ? 'opacity-100' : 'opacity-0'}`}
              style={{ filter: `drop-shadow(0 0 20px ${accentColor}66)` }}
            />

            {/* Loading overlay */}
            {loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <motion.div
                  className="w-7 h-7 rounded-full border-2 border-t-transparent"
                  style={{ borderColor: `${accentColor}40`, borderTopColor: accentColor }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
                />
                <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: accentColor }}>
                  Forging portrait...
                </p>
                <p className="text-slate-600 text-[9px]">~10 seconds</p>
              </div>
            )}

            {/* Regenerate button after success */}
            {generated && (
              <motion.button
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={generate}
                className="absolute bottom-2 right-2 text-[9px] uppercase tracking-wider font-bold px-2 py-1 rounded-lg border transition-colors"
                style={{ background: 'rgba(0,0,0,0.7)', borderColor: `${accentColor}40`, color: accentColor }}
              >
                Regenerate
              </motion.button>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            className="w-full rounded-xl flex flex-col items-center justify-center gap-1.5"
            style={{ height: 80, background: '#0a0a14', border: `1px dashed ${accentColor}25` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <p className="text-slate-600 text-[10px] uppercase tracking-wider">Portrait not generated yet</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Skin tone */}
      <div>
        <p className="text-[9px] text-slate-600 uppercase tracking-widest font-bold mb-1.5">Skin Tone</p>
        <div className="flex gap-2">
          {SKIN_TONES.map(tone => (
            <button
              key={tone}
              onClick={() => { setSkinTone(tone); setGenerated(false) }}
              className="rounded-full transition-all"
              style={{
                width: 28, height: 28, background: tone,
                outline: skinTone === tone ? `3px solid white` : `2px solid transparent`,
                outlineOffset: 2,
                boxShadow: skinTone === tone ? `0 0 0 4px ${accentColor}55` : 'none',
              }}
            />
          ))}
        </div>
      </div>

      {/* Armor style */}
      <div>
        <p className="text-[9px] text-slate-600 uppercase tracking-widest font-bold mb-1.5">Armor Style</p>
        <div className="flex gap-2">
          {ARMOR_STYLES.map(style => (
            <button
              key={style}
              onClick={() => { setArmorStyle(style); setGenerated(false) }}
              className="flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all border"
              style={{
                background:   armorStyle === style ? accentColor          : '#0c0c18',
                color:        armorStyle === style ? '#000'               : '#4a4a6a',
                borderColor:  armorStyle === style ? accentColor          : '#1e1e2e',
              }}
            >
              {ARMOR_LABELS[style]}
            </button>
          ))}
        </div>
      </div>

      {/* Generate button */}
      <motion.button
        onClick={generate}
        disabled={loading}
        whileHover={loading ? {} : { scale: 1.02 }}
        whileTap={loading ? {} : { scale: 0.97 }}
        className="w-full py-3 rounded-xl font-display font-black text-xs uppercase tracking-[0.2em] border-2 transition-all"
        style={{
          background:  loading ? 'transparent' : `${accentColor}15`,
          borderColor: loading ? `${accentColor}20` : `${accentColor}60`,
          color:       loading ? `${accentColor}40` : accentColor,
        }}
      >
        {loading ? 'Generating...' : generated ? 'Generate New Portrait' : 'Generate Portrait'}
      </motion.button>

      <p className="text-slate-700 text-[9px] text-center tracking-wider">
        Free AI generation — powered by Pollinations.ai
      </p>
    </div>
  )
}
