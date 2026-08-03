'use client'

import { motion } from 'framer-motion'
import type { CharacterClass } from '@/lib/classes'
import { CLASS_DEFINITIONS } from '@/lib/classes'

export interface CharacterConfig {
  characterClass: CharacterClass
  skinTone: string
  hairStyle: number
  hairColor: string
}

interface Props extends CharacterConfig {
  animated?: boolean
  height?: number | string
}

function dk(hex: string, f: number) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
  return `rgb(${Math.round(r*f)},${Math.round(g*f)},${Math.round(b*f)})`
}
function lt(hex: string, f: number) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
  return `rgb(${Math.min(255,Math.round(r+(255-r)*f))},${Math.min(255,Math.round(g+(255-g)*f))},${Math.min(255,Math.round(b+(255-b)*f))})`
}

interface BP { id: string; skin: string; hs: number; hc: string; acc: string }

export default function CharacterPreview({ characterClass, skinTone, hairStyle, hairColor, animated=true, height='100%' }: Props) {
  const def = CLASS_DEFINITIONS[characterClass]
  const id = `cp${characterClass[0].toLowerCase()}`

  return (
    <motion.svg
      viewBox="0 0 240 520"
      style={{ height, width:'auto', overflow:'visible',
        filter:`drop-shadow(0 0 28px ${def.glowColor}) drop-shadow(0 16px 40px rgba(0,0,0,0.99))` }}
      animate={animated ? {y:[0,-7,0]} : {}}
      transition={{duration:3.5, repeat:Infinity, ease:'easeInOut'}}
    >
      <defs>
        <radialGradient id={`${id}-sk`} cx="40%" cy="30%" r="70%">
          <stop offset="0%" stopColor={lt(skinTone,.38)} />
          <stop offset="55%" stopColor={skinTone} />
          <stop offset="100%" stopColor={dk(skinTone,.52)} />
        </radialGradient>
        <linearGradient id={`${id}-hr`} x1="30%" y1="0%" x2="70%" y2="100%">
          <stop offset="0%" stopColor={lt(hairColor,.28)} />
          <stop offset="100%" stopColor={dk(hairColor,.62)} />
        </linearGradient>
        <linearGradient id={`${id}-ir`} x1="15%" y1="5%" x2="85%" y2="95%">
          <stop offset="0%" stopColor="#7e8e9e"/>
          <stop offset="28%" stopColor="#3c4c5a"/>
          <stop offset="68%" stopColor="#1e2a36"/>
          <stop offset="100%" stopColor="#0c1418"/>
        </linearGradient>
        <linearGradient id={`${id}-id`} x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#2a3848"/>
          <stop offset="100%" stopColor="#080e14"/>
        </linearGradient>
        <linearGradient id={`${id}-ac`} x1="10%" y1="5%" x2="85%" y2="90%">
          <stop offset="0%" stopColor={lt(def.accentColor,.5)}/>
          <stop offset="50%" stopColor={def.accentColor}/>
          <stop offset="100%" stopColor={dk(def.accentColor,.45)}/>
        </linearGradient>
        <linearGradient id={`${id}-lt`} x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#3c2a1a"/>
          <stop offset="100%" stopColor="#160e08"/>
        </linearGradient>
        <linearGradient id={`${id}-fr`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#554030"/>
          <stop offset="100%" stopColor="#201510"/>
        </linearGradient>
        <linearGradient id={`${id}-sl`} x1="15%" y1="5%" x2="75%" y2="90%">
          <stop offset="0%" stopColor="#c8d8e8"/>
          <stop offset="35%" stopColor="#8898a8"/>
          <stop offset="100%" stopColor="#283848"/>
        </linearGradient>
        <linearGradient id={`${id}-bl`} x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#1e2030"/>
          <stop offset="100%" stopColor="#08080e"/>
        </linearGradient>
        <linearGradient id={`${id}-rim`} x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor={def.accentColor} stopOpacity="0.52"/>
          <stop offset="22%" stopColor={def.accentColor} stopOpacity="0.07"/>
          <stop offset="100%" stopColor="transparent" stopOpacity="0"/>
        </linearGradient>
        <linearGradient id={`${id}-shd`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="transparent"/>
          <stop offset="65%" stopColor="rgba(0,0,0,0)"/>
          <stop offset="100%" stopColor="rgba(0,0,0,0.55)"/>
        </linearGradient>
        <filter id={`${id}-gf`} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="3" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {characterClass === 'Berserker' && <BerserkerBody id={id} skin={skinTone} hs={hairStyle} hc={hairColor} acc={def.accentColor} />}
      {characterClass === 'Sentinel'  && <SentinelBody  id={id} skin={skinTone} hs={hairStyle} hc={hairColor} acc={def.accentColor} />}
      {characterClass === 'Phantom'   && <PhantomBody   id={id} skin={skinTone} hs={hairStyle} hc={hairColor} acc={def.accentColor} />}
    </motion.svg>
  )
}

// ─── BERSERKER ────────────────────────────────────────────────────────────────
function BerserkerBody({ id, skin, hs, hc: _hc, acc }: BP) {
  return (
    <g>
      {/* Back war cloak */}
      <path d="M 112,110 Q 165,138 202,185 Q 224,232 215,318 Q 202,388 178,442 L 160,434 Q 182,382 193,312 Q 201,228 175,186 Q 148,145 115,126 Z" fill={`url(#${id}-lt)`} opacity="0.85"/>
      <path d="M 112,110 Q 72,138 56,185 Q 40,232 48,316 Q 58,384 80,438 L 96,430 Q 74,378 65,312 Q 58,228 74,186 Q 90,148 115,126 Z" fill={`url(#${id}-lt)`} opacity="0.85"/>

      {/* LEGS */}
      <path d="M 68,283 L 55,345 L 46,400 L 42,452 L 44,480 L 92,480 L 94,450 L 98,396 L 102,340 L 106,283 Z" fill={`url(#${id}-ir)`}/>
      <path d="M 134,283 L 142,340 L 145,396 L 146,450 L 148,480 L 196,480 L 196,452 L 192,400 L 182,345 L 168,283 Z" fill={`url(#${id}-ir)`}/>
      <path d="M 55,362 Q 73,352 92,362 Q 98,374 84,381 Q 65,386 50,374 Z" fill={`url(#${id}-id)`}/>
      <path d="M 148,358 Q 165,348 182,358 Q 188,370 174,377 Q 156,382 142,370 Z" fill={`url(#${id}-id)`}/>

      {/* BOOTS */}
      <path d="M 28,456 C 20,470 18,488 28,498 L 98,498 L 98,476 L 46,474 Z" fill={`url(#${id}-id)`}/>
      <path d="M 212,456 C 220,470 222,488 212,498 L 148,498 L 148,476 L 192,474 Z" fill={`url(#${id}-id)`}/>
      <rect x="34" y="486" width="56" height="7" rx="3" fill={`url(#${id}-ac)`} opacity="0.75"/>
      <rect x="152" y="486" width="54" height="7" rx="3" fill={`url(#${id}-ac)`} opacity="0.75"/>

      {/* FUR MANTLE */}
      <path d="M 48,112 Q 58,94 82,108 L 84,145 Q 65,136 50,128 Z" fill={`url(#${id}-fr)`}/>
      <path d="M 190,110 Q 178,92 152,108 L 150,145 Q 170,136 188,126 Z" fill={`url(#${id}-fr)`}/>

      {/* TORSO — iron breastplate */}
      <path d="M 40,118 L 30,145 L 26,194 L 32,248 L 48,279 L 75,288 L 162,288 L 188,278 L 204,246 L 208,192 L 200,142 L 184,116 L 40,118 Z" fill={`url(#${id}-ir)`}/>
      <path d="M 54,130 L 46,168 L 44,232 L 52,262 L 74,274 L 162,274 L 184,262 L 190,232 L 188,168 L 178,130 Z" fill={`url(#${id}-id)`}/>
      <circle cx="116" cy="195" r="24" fill={`url(#${id}-ac)`}/>
      <circle cx="116" cy="195" r="17" fill={`url(#${id}-id)`}/>
      <path d="M 109,188 L 116,181 L 123,188 L 124,199 L 116,207 L 108,199 Z" fill={`url(#${id}-ac)`} filter={`url(#${id}-gf)`}/>
      <line x1="58" y1="165" x2="174" y2="165" stroke="rgba(80,100,120,0.45)" strokeWidth="1.5"/>
      <line x1="54" y1="202" x2="178" y2="202" stroke="rgba(80,100,120,0.35)" strokeWidth="1.5"/>
      <line x1="50" y1="240" x2="180" y2="240" stroke="rgba(80,100,120,0.3)" strokeWidth="1.5"/>

      {/* SPIKED PAULDRONS */}
      <path d="M 8,105 Q 26,88 50,105 Q 58,124 42,134 Q 22,142 4,124 Z" fill={`url(#${id}-ir)`}/>
      <polygon points="10,105 2,84 18,93" fill={`url(#${id}-ac)`}/>
      <polygon points="30,96 24,72 38,82" fill={`url(#${id}-ac)`}/>
      <path d="M 232,103 Q 215,86 190,103 Q 182,122 198,132 Q 218,140 236,122 Z" fill={`url(#${id}-ir)`}/>
      <polygon points="232,103 240,82 224,91" fill={`url(#${id}-ac)`}/>
      <polygon points="212,94 218,70 204,80" fill={`url(#${id}-ac)`}/>

      {/* LEFT ARM — lower axe grip */}
      <path d="M 38,120 L 14,152 L 6,188 L 20,198 L 44,164 L 58,128 Z" fill={`url(#${id}-ir)`}/>
      <ellipse cx="12" cy="193" rx="11" ry="9" fill={`url(#${id}-id)`}/>
      <path d="M 6,188 L 2,222 L 6,238 L 28,244 L 38,232 L 32,198 Z" fill={`url(#${id}-lt)`}/>
      <rect x="2" y="214" width="30" height="22" rx="5" fill={`url(#${id}-ir)`}/>
      <ellipse cx="14" cy="246" rx="13" ry="10" fill={`url(#${id}-sk)`}/>

      {/* RIGHT ARM — upper axe grip, raised */}
      <path d="M 188,118 L 210,84 L 224,56 L 212,46 L 196,74 L 174,110 Z" fill={`url(#${id}-ir)`}/>
      <ellipse cx="217" cy="68" rx="11" ry="9" fill={`url(#${id}-id)`}/>
      <path d="M 224,56 L 230,28 L 226,14 L 208,12 L 200,26 L 208,54 Z" fill={`url(#${id}-lt)`}/>
      <rect x="198" y="18" width="30" height="24" rx="5" fill={`url(#${id}-ir)`}/>
      <ellipse cx="218" cy="13" rx="12" ry="9" fill={`url(#${id}-sk)`}/>

      {/* NECK */}
      <path d="M 101,90 L 98,114 L 124,118 L 130,114 L 130,88 Z" fill={`url(#${id}-sk)`}/>

      {/* HEAD */}
      <ellipse cx="80" cy="58" rx="5" ry="8" fill={`url(#${id}-sk)`}/>
      <ellipse cx="144" cy="56" rx="5" ry="8" fill={`url(#${id}-sk)`}/>
      <ellipse cx="112" cy="52" rx="34" ry="40" fill={`url(#${id}-sk)`}/>
      <ellipse cx="112" cy="76" rx="28" ry="18" fill={dk(skin,.6)} opacity="0.35"/>
      {/* FACE */}
      <path d="M 86,33 Q 112,26 138,33 L 140,40 Q 112,33 84,40 Z" fill={dk(skin,.52)}/>
      <path d="M 88,50 L 100,63" stroke={acc} fill="none" strokeWidth="2.5" strokeLinecap="round" opacity="0.9"/>
      <ellipse cx="98" cy="49" rx="8.5" ry="6" fill="rgba(255,255,255,0.92)"/>
      <ellipse cx="126" cy="49" rx="8.5" ry="6" fill="rgba(255,255,255,0.92)"/>
      <ellipse cx="98" cy="49" rx="5.5" ry="4.5" fill="#200a04"/>
      <ellipse cx="126" cy="49" rx="5.5" ry="4.5" fill="#200a04"/>
      <circle cx="100" cy="47" r="1.6" fill="rgba(255,255,255,0.9)"/>
      <circle cx="128" cy="47" r="1.6" fill="rgba(255,255,255,0.9)"/>
      <path d="M 112,57 L 107,67 Q 112,70 117,67" stroke={dk(skin,.5)} fill="none" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M 100,78 Q 112,75 124,78" stroke={dk(skin,.48)} fill="none" strokeWidth="2.2" strokeLinecap="round"/>
      <path d="M 130,54 L 137,70" stroke={dk(skin,.44)} fill="none" strokeWidth="1.8" strokeLinecap="round" opacity="0.7"/>

      {/* PARTIAL BATTLE HELM */}
      <path d="M 84,18 L 80,6 L 90,0 L 112,-2 L 134,0 L 142,6 L 138,18 Q 112,12 84,18 Z" fill={`url(#${id}-ir)`}/>
      <path d="M 80,22 L 76,46 L 78,64 L 84,68 L 90,60 L 88,38 L 84,22 Z" fill={`url(#${id}-ir)`}/>
      <path d="M 144,22 L 148,46 L 146,64 L 140,68 L 134,60 L 136,38 L 140,22 Z" fill={`url(#${id}-ir)`}/>

      {/* HAIR */}
      {hs !== 4 && (
        <g fill={`url(#${id}-hr)`}>
          {hs === 0 && <path d="M 84,20 Q 112,12 140,20 L 140,28 Q 112,20 84,28 Z"/>}
          {hs === 1 && <>
            <path d="M 84,20 Q 112,14 140,20 L 140,27 Q 112,20 84,27 Z"/>
            {([90,102,114,126,138] as number[]).map((x,i) => <polygon key={i} points={`${x-5},22 ${x},${2-(i===2?10:i===1||i===3?5:0)} ${x+5},22`}/>)}
          </>}
          {hs === 2 && <>
            <path d="M 84,22 Q 112,14 140,22 L 140,30 Q 112,20 84,30 Z"/>
            <path d="M 80,28 C 70,52 68,95 74,120 L 85,118 C 79,94 82,52 90,28 Z"/>
            <path d="M 144,28 C 154,52 152,95 146,120 L 135,118 C 141,94 138,52 132,28 Z"/>
          </>}
          {hs === 3 && <>
            <path d="M 84,20 Q 112,14 140,20 L 140,28 Q 112,20 84,28 Z"/>
            <rect x="106" y="-10" width="12" height="32" rx="5"/>
            <ellipse cx="112" cy="-10" rx="13" ry="10"/>
          </>}
        </g>
      )}

      {/* GREAT AXE */}
      <path d="M 14,244 L 220,14 L 228,22 L 22,252 Z" fill="#5c3c14"/>
      {([.18,.38,.58,.78] as number[]).map((t,i) => (
        <line key={i} x1={14+t*206} y1={244-t*230} x2={14+t*206+9} y2={244-t*230+9} stroke="#8c5c22" strokeWidth="3.5" strokeLinecap="round"/>
      ))}
      <ellipse cx="16" cy="247" rx="9" ry="6" fill={`url(#${id}-ir)`}/>
      <path d="M 207,12 C 200,-6 226,-28 262,-12 C 290,4 298,42 273,62 C 253,77 228,72 215,56 C 234,50 258,34 254,12 C 250,-6 226,-6 207,12 Z" fill={`url(#${id}-ir)`}/>
      <path d="M 207,12 C 194,28 184,48 192,68 L 208,60 C 200,48 205,30 216,20 Z" fill={`url(#${id}-ir)`}/>
      <path d="M 262,-12 C 290,4 298,42 273,62 C 262,70 248,72 238,68" stroke="rgba(200,225,245,0.7)" fill="none" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M 224,16 C 245,8 264,18 270,36" stroke={acc} fill="none" strokeWidth="2.2" strokeLinecap="round" opacity="0.65" filter={`url(#${id}-gf)`}/>

      <rect x="0" y="0" width="240" height="520" fill={`url(#${id}-rim)`}/>
      <rect x="0" y="0" width="240" height="520" fill={`url(#${id}-shd)`}/>
    </g>
  )
}

// ─── SENTINEL ─────────────────────────────────────────────────────────────────
function SentinelBody({ id, skin: _skin, hs: _hs, hc: _hc, acc }: BP) {
  return (
    <g>
      {/* Surcoat behind legs */}
      <path d="M 88,242 L 82,320 L 78,388 L 82,462 L 95,462 L 97,388 L 100,320 L 106,242 Z" fill={`url(#${id}-lt)`} opacity="0.8"/>
      <path d="M 148,242 L 150,320 L 153,388 L 155,462 L 140,462 L 142,388 L 140,320 L 138,242 Z" fill={`url(#${id}-lt)`} opacity="0.8"/>

      {/* LEGS */}
      <path d="M 72,245 L 62,330 L 55,392 L 52,448 L 55,475 L 99,475 L 102,446 L 104,388 L 108,328 L 112,245 Z" fill={`url(#${id}-ir)`}/>
      <path d="M 128,245 L 132,328 L 136,388 L 138,446 L 142,475 L 186,475 L 183,448 L 180,392 L 174,330 L 165,245 Z" fill={`url(#${id}-ir)`}/>
      <rect x="60" y="278" width="44" height="6" rx="3" fill={`url(#${id}-id)`}/>
      <rect x="60" y="330" width="44" height="5" rx="2.5" fill={`url(#${id}-id)`}/>
      <rect x="136" y="278" width="44" height="6" rx="3" fill={`url(#${id}-id)`}/>
      <rect x="136" y="330" width="44" height="5" rx="2.5" fill={`url(#${id}-id)`}/>
      <path d="M 56,354 Q 76,342 96,354 Q 102,368 86,376 Q 66,382 50,368 Z" fill={`url(#${id}-id)`}/>
      <path d="M 144,354 Q 163,342 182,354 Q 188,368 172,376 Q 152,382 138,368 Z" fill={`url(#${id}-id)`}/>

      {/* SABATONS */}
      <path d="M 36,454 C 26,468 24,486 36,498 L 106,498 L 106,474 L 56,472 Z" fill={`url(#${id}-id)`}/>
      <path d="M 202,454 C 212,468 214,486 202,498 L 136,498 L 136,474 L 182,472 Z" fill={`url(#${id}-id)`}/>
      <line x1="42" y1="474" x2="98" y2="474" stroke={acc} strokeWidth="2.5" opacity="0.45"/>
      <line x1="140" y1="474" x2="196" y2="474" stroke={acc} strokeWidth="2.5" opacity="0.45"/>

      {/* TORSO */}
      <path d="M 58,108 L 46,145 L 42,198 L 48,248 L 64,270 L 80,280 L 160,280 L 176,270 L 192,248 L 198,198 L 193,142 L 180,106 L 58,108 Z" fill={`url(#${id}-ir)`}/>
      <path d="M 68,120 L 60,158 L 56,210 L 62,252 L 74,268 L 80,274 L 160,274 L 166,268 L 178,252 L 184,210 L 180,158 L 170,120 Z" fill={`url(#${id}-id)`}/>
      <rect x="104" y="148" width="30" height="6" rx="3" fill={`url(#${id}-ac)`}/>
      <rect x="116" y="130" width="6" height="42" rx="3" fill={`url(#${id}-ac)`}/>
      <circle cx="119" cy="155" r="18" fill="none" stroke={acc} strokeWidth="1.5" opacity="0.4" filter={`url(#${id}-gf)`}/>
      <rect x="60" y="258" width="118" height="14" rx="4" fill={`url(#${id}-lt)`}/>
      <rect x="112" y="254" width="14" height="22" rx="3" fill={`url(#${id}-ir)`}/>

      {/* PAULDRONS */}
      <path d="M 15,100 Q 36,82 58,100 Q 66,120 50,130 Q 28,140 10,120 Z" fill={`url(#${id}-ir)`}/>
      <path d="M 15,100 L 10,108 L 8,120" fill="none" stroke={acc} strokeWidth="2" opacity="0.4"/>
      <path d="M 224,100 Q 202,82 180,100 Q 172,120 188,130 Q 210,140 228,120 Z" fill={`url(#${id}-ir)`}/>
      <path d="M 224,100 L 228,108 L 230,120" fill="none" stroke={acc} strokeWidth="2" opacity="0.4"/>

      {/* RIGHT ARM + SWORD */}
      <path d="M 180,110 L 198,82 L 210,54 L 208,30 L 198,24 L 192,52 L 180,80 L 168,108 Z" fill={`url(#${id}-ir)`}/>
      <ellipse cx="208" cy="43" rx="11" ry="9" fill={`url(#${id}-id)`}/>
      <path d="M 200,28 L 230,-38 L 238,-34 L 208,36 Z" fill={`url(#${id}-sl)`}/>
      <path d="M 208,-28 L 230,-30" stroke="rgba(255,255,255,0.55)" fill="none" strokeWidth="2" strokeLinecap="round"/>
      <rect x="192" y="24" width="34" height="10" rx="3" transform="rotate(-24,209,29)" fill={`url(#${id}-sl)`}/>
      <rect x="197" y="34" width="12" height="26" rx="3" transform="rotate(-24,203,47)" fill={`url(#${id}-lt)`}/>
      <ellipse cx="196" cy="62" rx="11" ry="8" fill={`url(#${id}-sl)`}/>
      <ellipse cx="196" cy="62" rx="6" ry="4.5" fill={`url(#${id}-id)`}/>

      {/* LEFT ARM — shield arm */}
      <path d="M 58,110 L 38,135 L 24,162 L 20,188 L 36,196 L 50,168 L 64,140 L 70,118 Z" fill={`url(#${id}-ir)`}/>
      <ellipse cx="22" cy="192" rx="11" ry="9" fill={`url(#${id}-id)`}/>
      <path d="M 20,188 L 14,215 L 18,228 L 38,234 L 46,222 L 40,196 Z" fill={`url(#${id}-ir)`}/>

      {/* TOWER SHIELD */}
      <path d="M -22,88 L -28,98 L -32,182 L -32,310 L -24,358 L -10,388 L 8,396 L 30,386 L 44,356 L 48,310 L 48,182 L 42,98 L 36,88 Z" fill={`url(#${id}-id)`} opacity="0.55" transform="translate(6,6)"/>
      <path d="M -22,88 L -28,98 L -32,182 L -32,310 L -24,358 L -10,388 L 8,396 L 30,386 L 44,356 L 48,310 L 48,182 L 42,98 L 36,88 Z" fill={`url(#${id}-ir)`}/>
      <path d="M -18,100 L -22,182 L -22,308 L -14,350 L -2,376 L 8,382 L 22,374 L 34,350 L 38,308 L 38,182 L 32,100 Z" fill={`url(#${id}-id)`}/>
      <circle cx="8" cy="232" r="22" fill={`url(#${id}-ir)`}/>
      <circle cx="8" cy="232" r="15" fill={`url(#${id}-id)`}/>
      <circle cx="8" cy="232" r="8" fill={`url(#${id}-ac)`} filter={`url(#${id}-gf)`}/>
      <line x1="8" y1="155" x2="8" y2="318" stroke={acc} strokeWidth="3" opacity="0.35"/>
      <line x1="-22" y1="236" x2="38" y2="236" stroke={acc} strokeWidth="3" opacity="0.35"/>
      <path d="M -22,88 L -28,98 L -32,182 L -32,310 L -24,358 L -10,388 L 8,396 L 30,386 L 44,356 L 48,310 L 48,182 L 42,98 L 36,88 Z" fill="none" stroke={acc} strokeWidth="2" opacity="0.28"/>

      {/* NECK */}
      <rect x="99" y="84" width="20" height="26" rx="5" fill={`url(#${id}-ir)`}/>

      {/* FULL PLATE HELM */}
      <path d="M 72,88 L 70,62 L 74,40 L 85,23 L 106,16 L 128,23 L 136,40 L 138,62 L 136,88 Z" fill={`url(#${id}-ir)`}/>
      <path d="M 92,20 L 90,2 L 98,-2 L 110,-4 L 124,-2 L 130,2 L 128,20 Z" fill={`url(#${id}-ac)`} filter={`url(#${id}-gf)`}/>
      <rect x="108" y="-4" width="6" height="26" rx="2.5" fill={`url(#${id}-ir)`}/>
      {/* T-visor face plates */}
      <path d="M 76,54 L 74,72 L 76,88 L 78,90 L 98,90 L 98,74 L 96,60 L 76,54 Z" fill={`url(#${id}-id)`}/>
      <path d="M 140,54 L 142,72 L 140,88 L 138,90 L 118,90 L 118,74 L 120,60 L 140,54 Z" fill={`url(#${id}-id)`}/>
      <rect x="82" y="60" width="54" height="10" rx="2" fill="#040408"/>
      {/* Glowing eyes */}
      <ellipse cx="97" cy="65" rx="7" ry="5.5" fill={acc} opacity="0.85" filter={`url(#${id}-gf)`}/>
      <ellipse cx="121" cy="65" rx="7" ry="5.5" fill={acc} opacity="0.85" filter={`url(#${id}-gf)`}/>
      <ellipse cx="97" cy="65" rx="4" ry="3" fill="rgba(255,255,255,0.5)"/>
      <ellipse cx="121" cy="65" rx="4" ry="3" fill="rgba(255,255,255,0.5)"/>
      <path d="M 76,88 L 74,98 L 82,104 L 130,104 L 138,98 L 136,88 Z" fill={`url(#${id}-ir)`}/>
      <path d="M 72,88 L 70,62 L 74,40 L 85,23" fill="none" stroke="rgba(150,180,220,0.35)" strokeWidth="2"/>
      <path d="M 136,88 L 138,62 L 134,40 L 124,23" fill="none" stroke="rgba(150,180,220,0.35)" strokeWidth="2"/>

      <rect x="0" y="0" width="240" height="520" fill={`url(#${id}-rim)`}/>
      <rect x="0" y="0" width="240" height="520" fill={`url(#${id}-shd)`}/>
    </g>
  )
}

// ─── PHANTOM ──────────────────────────────────────────────────────────────────
function PhantomBody({ id, skin: _skin, hs: _hs, hc: _hc, acc }: BP) {
  return (
    <g>
      {/* Tactical coat, behind */}
      <path d="M 120,98 Q 175,128 214,176 Q 238,226 228,318 Q 215,388 188,440 L 170,432 Q 196,382 207,312 Q 216,224 188,180 Q 158,138 122,114 Z" fill={`url(#${id}-bl)`}/>
      <path d="M 116,98 Q 72,130 55,178 Q 38,230 46,318 Q 58,388 82,438 L 99,430 Q 75,380 64,312 Q 56,228 72,180 Q 90,140 118,114 Z" fill={`url(#${id}-bl)`}/>

      {/* LEGS */}
      <path d="M 80,258 L 70,335 L 63,392 L 60,448 L 63,475 L 104,475 L 106,446 L 108,388 L 112,330 L 115,258 Z" fill={`url(#${id}-bl)`}/>
      <path d="M 125,258 L 128,330 L 132,388 L 134,446 L 136,475 L 176,475 L 173,448 L 170,392 L 162,335 L 152,258 Z" fill={`url(#${id}-bl)`}/>
      <rect x="65" y="310" width="28" height="20" rx="3" fill={`url(#${id}-id)`} opacity="0.8"/>
      <rect x="148" y="310" width="28" height="20" rx="3" fill={`url(#${id}-id)`} opacity="0.8"/>
      <path d="M 64,360 Q 80,350 96,360 Q 100,372 86,378 Q 68,383 56,370 Z" fill={`url(#${id}-id)`}/>
      <path d="M 144,360 Q 160,350 174,360 Q 178,372 165,378 Q 148,383 138,370 Z" fill={`url(#${id}-id)`}/>

      {/* BOOTS */}
      <path d="M 44,452 C 36,466 34,483 44,494 L 110,494 L 110,473 L 64,471 Z" fill={`url(#${id}-id)`}/>
      <path d="M 196,452 C 204,466 206,483 196,494 L 132,494 L 132,473 L 174,471 Z" fill={`url(#${id}-id)`}/>
      <rect x="48" y="478" width="54" height="10" rx="4" fill="#141420"/>
      <rect x="140" y="478" width="52" height="10" rx="4" fill="#141420"/>

      {/* TORSO — tactical vest */}
      <path d="M 68,106 L 55,148 L 50,205 L 56,258 L 74,275 L 82,280 L 158,280 L 166,275 L 184,258 L 190,205 L 185,145 L 172,104 L 68,106 Z" fill={`url(#${id}-bl)`}/>
      <path d="M 78,118 L 70,158 L 68,215 L 74,258 L 82,272 L 158,272 L 166,258 L 172,215 L 170,158 L 162,118 Z" fill={`url(#${id}-id)`}/>
      {/* MOLLE webbing lines */}
      {([130,152,174,196,218] as number[]).map((y,i) => (
        <line key={i} x1="80" y1={y} x2="160" y2={y} stroke="rgba(48,54,70,0.8)" strokeWidth="2"/>
      ))}
      {/* Pouches */}
      <rect x="80" y="148" width="22" height="18" rx="3" fill={`url(#${id}-ir)`} opacity="0.7"/>
      <rect x="138" y="148" width="22" height="18" rx="3" fill={`url(#${id}-ir)`} opacity="0.7"/>
      <rect x="85" y="192" width="16" height="14" rx="2" fill={`url(#${id}-ir)`} opacity="0.6"/>
      <rect x="140" y="192" width="16" height="14" rx="2" fill={`url(#${id}-ir)`} opacity="0.6"/>
      {/* Star emblem */}
      <path d="M 119,226 L 122,217 L 129,217 L 124,222 L 126,231 L 119,226 L 112,231 L 114,222 L 109,217 L 116,217 Z" fill={acc} filter={`url(#${id}-gf)`}/>

      {/* SHOULDER PIECES */}
      <path d="M 36,98 Q 52,84 70,98 Q 76,114 62,122 Q 44,130 28,112 Z" fill={`url(#${id}-id)`}/>
      <path d="M 200,98 Q 186,84 168,98 Q 162,114 176,122 Q 194,130 210,112 Z" fill={`url(#${id}-id)`}/>

      {/* RIGHT ARM — forward thrust */}
      <path d="M 170,106 L 188,80 L 200,52 L 200,28 L 190,22 L 185,50 L 174,78 L 162,104 Z" fill={`url(#${id}-bl)`}/>
      <ellipse cx="200" cy="38" rx="10" ry="8" fill={`url(#${id}-id)`}/>
      <path d="M 200,28 L 206,8 L 202,-4 L 192,-6 L 186,6 L 192,26 Z" fill={`url(#${id}-id)`}/>
      <ellipse cx="197" cy="-2" rx="12" ry="9" fill={`url(#${id}-id)`}/>
      {/* Forward dagger */}
      <path d="M 194,0 L 224,-58 L 232,-54 L 200,6 Z" fill={`url(#${id}-sl)`}/>
      <path d="M 196,-2 L 230,-56" stroke={acc} fill="none" strokeWidth="1.5" opacity="0.5" filter={`url(#${id}-gf)`}/>
      <path d="M 214,-40 L 228,-36" stroke="rgba(255,255,255,0.55)" fill="none" strokeWidth="2" strokeLinecap="round"/>
      <rect x="188" y="-2" width="22" height="8" rx="2.5" transform="rotate(-14,199,2)" fill={`url(#${id}-sl)`}/>
      <rect x="194" y="4" width="9" height="22" rx="2.5" transform="rotate(-14,198,15)" fill="#1a0a28"/>

      {/* LEFT ARM — reverse grip */}
      <path d="M 70,108 L 50,132 L 36,158 L 32,184 L 48,190 L 60,166 L 74,138 L 82,116 Z" fill={`url(#${id}-bl)`}/>
      <ellipse cx="34" cy="188" rx="10" ry="8" fill={`url(#${id}-id)`}/>
      <path d="M 32,184 L 26,210 L 30,222 L 48,226 L 56,214 L 50,188 Z" fill={`url(#${id}-id)`}/>
      <ellipse cx="36" cy="226" rx="12" ry="9" fill={`url(#${id}-id)`}/>
      {/* Reverse grip dagger */}
      <path d="M 38,224 L 6,282 L 15,288 L 48,232 Z" fill={`url(#${id}-sl)`}/>
      <path d="M 40,226 L 8,282" stroke={acc} fill="none" strokeWidth="1.5" opacity="0.45" filter={`url(#${id}-gf)`}/>
      <rect x="30" y="220" width="20" height="8" rx="2.5" transform="rotate(16,40,224)" fill={`url(#${id}-sl)`}/>

      {/* NECK */}
      <rect x="100" y="86" width="22" height="22" rx="4" fill={`url(#${id}-bl)`}/>

      {/* HOOD */}
      <path d="M 70,90 C 68,68 72,45 82,28 C 90,14 103,6 120,6 C 137,6 150,14 158,28 C 168,45 170,68 168,90 L 164,95 Z" fill={`url(#${id}-bl)`}/>
      <path d="M 76,90 C 74,70 78,50 86,36 C 93,24 104,16 120,16 C 136,16 146,24 153,36 C 160,50 162,70 160,90 Z" fill="#080410"/>

      {/* SKULL BALACLAVA */}
      <ellipse cx="120" cy="56" rx="30" ry="36" fill="#c8ccd0"/>
      <ellipse cx="116" cy="44" rx="24" ry="20" fill="#e0e4e8" opacity="0.7"/>
      <ellipse cx="96" cy="62" rx="10" ry="6" fill="#d8dce0" opacity="0.8"/>
      <ellipse cx="144" cy="62" rx="10" ry="6" fill="#d8dce0" opacity="0.8"/>
      {/* Nasal cavity */}
      <path d="M 115,65 L 112,72 L 119,74 L 126,72 L 123,65 Q 120,62 115,65 Z" fill="#3a3a44"/>
      {/* Deep eye sockets */}
      <ellipse cx="102" cy="54" rx="14" ry="11" fill="#14141c"/>
      <ellipse cx="138" cy="54" rx="14" ry="11" fill="#14141c"/>
      {/* Glowing eyes */}
      <ellipse cx="102" cy="54" rx="8" ry="7" fill={acc} opacity="0.9" filter={`url(#${id}-gf)`}/>
      <ellipse cx="138" cy="54" rx="8" ry="7" fill={acc} opacity="0.9" filter={`url(#${id}-gf)`}/>
      <ellipse cx="102" cy="54" rx="4.5" ry="4" fill="rgba(255,255,255,0.5)"/>
      <ellipse cx="138" cy="54" rx="4.5" ry="4" fill="rgba(255,255,255,0.5)"/>
      {/* Teeth */}
      <path d="M 98,76 Q 120,72 142,76 L 142,82 Q 138,86 134,86 L 126,78 L 119,86 L 112,78 L 104,86 L 98,82 Z" fill="#c8ccd0"/>
      <line x1="112" y1="76" x2="112" y2="86" stroke="#5a5a60" strokeWidth="1.5" opacity="0.6"/>
      <line x1="119" y1="76" x2="119" y2="86" stroke="#5a5a60" strokeWidth="1.5" opacity="0.6"/>
      <line x1="126" y1="76" x2="126" y2="86" stroke="#5a5a60" strokeWidth="1.5" opacity="0.6"/>
      {/* Tactical X marks on cheeks */}
      <line x1="88" y1="60" x2="96" y2="70" stroke="#505058" strokeWidth="2.5" opacity="0.6"/>
      <line x1="96" y1="60" x2="88" y2="70" stroke="#505058" strokeWidth="2.5" opacity="0.6"/>
      <line x1="144" y1="60" x2="152" y2="70" stroke="#505058" strokeWidth="2.5" opacity="0.6"/>
      <line x1="152" y1="60" x2="144" y2="70" stroke="#505058" strokeWidth="2.5" opacity="0.6"/>
      {/* Hood chin wrap */}
      <path d="M 76,88 C 80,96 98,102 120,102 C 142,102 160,96 164,88" fill="none" stroke="#10101a" strokeWidth="12" strokeLinecap="round"/>
      {/* Hood shadow cast */}
      <path d="M 78,40 Q 120,28 162,40 L 160,52 Q 120,38 80,52 Z" fill="#060408" opacity="0.55"/>
      {/* Hair peeking from hood sides */}
      <g fill={`url(#${id}-hr)`} opacity="0.7">
        <path d="M 74,58 C 72,44 76,30 84,22 L 88,28 C 82,36 78,50 80,60 Z"/>
        <path d="M 166,58 C 168,44 164,30 156,22 L 152,28 C 158,36 162,50 160,60 Z"/>
      </g>

      <rect x="0" y="0" width="240" height="520" fill={`url(#${id}-rim)`}/>
      <rect x="0" y="0" width="240" height="520" fill={`url(#${id}-shd)`}/>
    </g>
  )
}
