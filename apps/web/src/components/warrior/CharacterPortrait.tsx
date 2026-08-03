'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { CLASS_DEFINITIONS, CHARACTER_IMAGES } from '@/lib/classes'
import CharacterPreview, { type CharacterConfig } from './CharacterPreview'

interface Props extends CharacterConfig {
  gender?: 'male' | 'female'
  animated?: boolean
  height?: number | string
  className?: string
}

export default function CharacterPortrait({ characterClass, skinTone, hairStyle, hairColor, gender = 'male', animated = true, height = '100%', className }: Props) {
  const def = CLASS_DEFINITIONS[characterClass]
  const src = CHARACTER_IMAGES[characterClass]?.[gender] ?? CHARACTER_IMAGES[characterClass]?.male
  const [imgFailed, setImgFailed] = useState(false)

  if (!imgFailed) {
    return (
      <motion.div
        className={`relative flex items-end justify-center ${className ?? ''}`}
        style={{ height, width: 'auto' }}
        animate={animated ? { y: [0, -7, 0] } : {}}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* Photorealistic character portrait */}
        <img
          src={src}
          alt={characterClass}
          onError={() => setImgFailed(true)}
          className="h-full w-auto object-contain object-bottom select-none"
          draggable={false}
          style={{
            filter: `drop-shadow(0 0 32px ${def.glowColor}) drop-shadow(0 20px 48px rgba(0,0,0,0.99))`,
            maxHeight: '100%',
          }}
        />
        {/* Edge vignette so character blends into background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(0deg, rgba(4,3,12,0.55) 0%, transparent 28%, transparent 75%, rgba(4,3,12,0.2) 100%)`,
          }}
        />
      </motion.div>
    )
  }

  return (
    <CharacterPreview
      characterClass={characterClass}
      skinTone={skinTone}
      hairStyle={hairStyle}
      hairColor={hairColor}
      animated={animated}
      height={height}
    />
  )
}
