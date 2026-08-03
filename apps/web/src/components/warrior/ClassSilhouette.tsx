import type { CharacterClass } from '@/lib/classes'
import { CLASS_DEFINITIONS } from '@/lib/classes'

interface Props {
  characterClass: CharacterClass
  /** Height of the SVG (default: 100%) */
  height?: number | string
  animated?: boolean
}

export default function ClassSilhouette({ characterClass, height = '100%', animated = false }: Props) {
  const def = CLASS_DEFINITIONS[characterClass]

  const svgProps = {
    viewBox: '-30 -55 295 550',
    style: {
      height,
      width: 'auto',
      filter: `drop-shadow(0 0 18px ${def.glowColor}) drop-shadow(0 0 6px ${def.accentColorDim.replace('0.12', '0.3')})`,
      ...(animated && { animation: 'warrior-float 3s ease-in-out infinite' }),
    } as React.CSSProperties,
  }

  return (
    <>
      {animated && (
        <style>{`
          @keyframes warrior-float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-8px); }
          }
        `}</style>
      )}
      {characterClass === 'Berserker' && <BerserkerSVG {...svgProps} />}
      {characterClass === 'Sentinel' && <SentinelSVG {...svgProps} />}
      {characterClass === 'Phantom' && <PhantomSVG {...svgProps} />}
    </>
  )
}

type SVGProps = React.SVGAttributes<SVGSVGElement>

/* ─────────────────────────────────────────
   BERSERKER — wide build, great axe, rage
───────────────────────────────────────── */
function BerserkerSVG(props: SVGProps) {
  return (
    <svg {...props}>
      <g fill="#05050c">
        {/* Torn war cloak (short, ragged) */}
        <path d="M 128 108 Q 172 130, 210 172 Q 228 215, 210 268 Q 196 318, 172 360 L 155 354 Q 178 314, 192 262 Q 208 215, 185 174 Q 156 136, 130 122 Z" />
        <path d="M 128 108 Q 148 135, 138 168 Q 132 185, 120 178 Q 108 168, 120 140 Z" />

        {/* Heavy boots */}
        <path d="M 42 444 C 33 456, 28 470, 35 481 L 90 481 L 90 465 L 50 460 Z" />
        <path d="M 158 444 C 166 456, 170 470, 163 481 L 110 481 L 110 465 L 148 460 Z" />

        {/* Wide-stance legs */}
        <path d="M 52 254 L 44 348 L 38 406 L 38 444 L 85 444 L 88 402 L 94 342 L 100 254 Z" />
        <path d="M 108 254 L 114 342 L 120 402 L 122 444 L 168 444 L 166 406 L 160 348 L 148 254 Z" />

        {/* Wide torso — berserker bulk */}
        <path d="M 46 116 L 38 170 L 36 216 L 42 254 L 158 254 L 164 216 L 162 170 L 154 116 Z" />

        {/* Massive pauldrons */}
        <path d="M 14 108 Q 32 92, 54 106 Q 62 122, 46 132 Q 28 140, 12 124 Z" />
        <path d="M 186 108 Q 168 92, 148 106 Q 140 122, 156 132 Q 172 140, 188 124 Z" />

        {/* Neck */}
        <rect x="88" y="90" width="24" height="30" rx="4" />

        {/* Rough battle helm (open face, lower brow) */}
        <path d="M 72 90 L 70 65 L 74 46 L 82 30 L 100 22 L 120 22 L 136 30 L 142 46 L 144 65 L 142 90 Z" />
        {/* Brow ridge — heavy, intimidating */}
        <path d="M 74 62 L 70 52 L 80 44 L 100 40 L 120 40 L 138 44 L 142 52 L 138 62 Z" />
        {/* Cheek guards */}
        <path d="M 72 68 L 64 78 L 68 90 L 78 90 Z" />
        <path d="M 140 68 L 148 78 L 144 90 L 134 90 Z" />
        {/* Chin bar */}
        <path d="M 78 88 L 76 96 L 84 100 L 116 100 L 124 96 L 122 88 Z" />

        {/* Right arm (upper grip on axe haft) */}
        <path d="M 154 118 L 166 95 L 174 70 L 175 48 L 166 43 L 164 68 L 154 94 L 145 115 Z" />

        {/* Left arm (lower grip) */}
        <path d="M 50 120 L 36 142 L 24 168 L 22 195 L 35 200 L 46 176 L 58 150 L 65 125 Z" />

        {/* Axe haft (thick diagonal pole) */}
        <path d="M 112 205 L 174 46 L 183 52 L 120 210 Z" />
        {/* Haft butt cap */}
        <ellipse cx="112" cy="206" rx="7" ry="5" />

        {/* GREAT AXE HEAD — double-bit crescent */}
        {/* Upper blade */}
        <path d="M 163 22 C 158 8, 178 -10, 212 4 C 240 18, 248 48, 228 64 C 212 76, 192 72, 182 60 C 198 56, 216 44, 214 26 C 210 10, 182 8, 163 22 Z" />
        {/* Lower beard */}
        <path d="M 163 22 C 152 34, 144 50, 150 65 L 162 60 C 155 50, 157 36, 168 28 Z" />
      </g>
    </svg>
  )
}

/* ─────────────────────────────────────────
   SENTINEL — full plate, tower shield, sword
───────────────────────────────────────── */
function SentinelSVG(props: SVGProps) {
  return (
    <svg {...props}>
      <g fill="#05050c">
        {/* Long surcoat/tabard (behind) */}
        <path d="M 88 248 L 82 320 L 78 380 L 80 440 L 90 440 L 92 382 L 96 322 L 100 248 Z" />
        <path d="M 112 248 L 116 322 L 120 382 L 122 440 L 132 440 L 134 380 L 130 320 L 120 248 Z" />

        {/* Heavy boots */}
        <path d="M 56 444 C 47 455, 44 469, 50 480 L 98 480 L 98 465 L 64 461 Z" />
        <path d="M 144 444 C 152 455, 154 469, 150 480 L 106 480 L 106 465 L 138 461 Z" />

        {/* Legs (greaves, heavier look) */}
        <path d="M 68 252 L 62 342 L 57 404 L 56 444 L 92 444 L 93 400 L 97 338 L 100 252 Z" />
        <path d="M 110 252 L 114 338 L 118 400 L 118 444 L 154 444 L 154 404 L 148 342 L 140 252 Z" />

        {/* Torso — broad full plate */}
        <path d="M 68 114 L 60 168 L 58 215 L 64 252 L 148 252 L 154 215 L 152 168 L 142 114 Z" />
        {/* Chest plate detail */}
        <path d="M 84 130 L 78 165 L 78 200 L 84 205 L 126 205 L 132 200 L 132 165 L 126 130 Z" />

        {/* Pauldrons — wide plate */}
        <path d="M 34 108 Q 50 94, 68 108 Q 75 122, 62 130 Q 46 138, 30 122 Z" />
        <path d="M 178 108 Q 162 94, 144 108 Q 136 122, 152 130 Q 166 138, 182 122 Z" />

        {/* Neck */}
        <rect x="88" y="90" width="24" height="28" rx="4" />

        {/* GREAT HELM — full enclosed */}
        <path d="M 74 90 L 72 64 L 75 42 L 85 26 L 100 20 L 122 20 L 134 26 L 140 42 L 142 64 L 140 90 Z" />
        {/* Helm crest */}
        <path d="M 90 22 L 88 6 L 94 2 L 107 0 L 122 2 L 126 6 L 124 22 Z" />
        {/* Visor slot */}
        <rect x="82" y="60" width="46" height="20" rx="2" fill="#0c0c1e" />
        <rect x="84" y="62" width="42" height="9" rx="1.5" fill="#080816" />
        {/* Chin guard */}
        <path d="M 78 88 L 76 97 L 84 102 L 126 102 L 134 97 L 132 88 Z" />

        {/* Right arm + sword (held at guard, diagonal) */}
        <path d="M 144 115 L 155 92 L 163 70 L 162 50 L 154 47 L 152 68 L 144 90 L 136 112 Z" />
        {/* Sword blade (angled down-forward, guard position) */}
        <path d="M 152 48 L 180 -10 L 186 -7 L 158 52 Z" />
        {/* Crossguard */}
        <rect x="142" y="44" width="32" height="8" rx="2" transform="rotate(-20, 158, 48)" />
        {/* Grip */}
        <rect x="151" y="52" width="9" height="22" rx="2" transform="rotate(-20, 155, 63)" />
        {/* Pommel */}
        <circle cx="154" cy="76" r="7" />
        <circle cx="154" cy="76" r="4" fill="#08081a" />

        {/* Left arm (holding tower shield) */}
        <path d="M 64 116 L 50 135 L 38 158 L 34 180 L 46 184 L 55 164 L 66 142 L 72 120 Z" />

        {/* TOWER SHIELD — tall, imposing */}
        {/* Main body */}
        <path d="M 4 108 L 0 115 L -4 175 L -4 290 L 2 335 L 14 362 L 30 370 L 44 358 L 52 330 L 54 280 L 54 175 L 50 115 L 46 108 Z" />
        {/* Shield face indent */}
        <path d="M 8 120 L 6 175 L 6 285 L 12 328 L 24 348 L 38 338 L 44 296 L 46 175 L 42 120 Z" fill="#09091e" />
        {/* Shield boss */}
        <circle cx="25" cy="225" r="12" />
        <circle cx="25" cy="225" r="7" fill="#0a0a1e" />
        {/* Shield cross line */}
        <line x1="25" y1="148" x2="25" y2="308" stroke="#0d0d22" strokeWidth="2" />
        <line x1="-2" y1="228" x2="52" y2="228" stroke="#0d0d22" strokeWidth="2" />
        {/* Shield rim glow */}
        <path d="M 4 108 L 0 115 L -4 175 L -4 290 L 2 335 L 14 362 L 30 370 L 44 358 L 52 330 L 54 280 L 54 175 L 50 115 L 46 108 Z"
          fill="none" stroke="rgba(59,130,246,0.22)" strokeWidth="1.5" />
      </g>
    </svg>
  )
}

/* ─────────────────────────────────────────
   PHANTOM — slim, hooded, twin daggers
───────────────────────────────────────── */
function PhantomSVG(props: SVGProps) {
  return (
    <svg {...props}>
      <g fill="#05050c">
        {/* Long flowing cloak — dominant shape */}
        <path d="M 118 100 Q 175 130, 220 178 Q 245 228, 235 310 Q 220 385, 192 445 L 172 438 Q 198 380, 210 305 Q 220 228, 192 182 Q 158 138, 120 116 Z" />
        {/* Cloak left side (wider sweep) */}
        <path d="M 94 105 Q 60 130, 44 180 Q 32 228, 42 300 Q 54 365, 76 420 L 92 414 Q 70 360, 60 296 Q 50 226, 62 180 Q 76 134, 98 118 Z" />

        {/* Light boots (pointed) */}
        <path d="M 66 446 C 60 458, 58 472, 64 480 L 102 480 L 100 466 L 72 462 Z" />
        <path d="M 134 446 C 140 458, 142 472, 136 480 L 100 480 L 102 466 L 128 462 Z" />

        {/* Slim legs (slightly bent — low stance) */}
        <path d="M 76 248 L 70 338 L 66 398 L 65 446 L 96 446 L 98 396 L 100 332 L 102 248 Z" />
        <path d="M 106 248 L 108 332 L 112 396 L 113 446 L 142 446 L 140 398 L 138 338 L 124 248 Z" />

        {/* Slim torso */}
        <path d="M 78 108 L 72 160 L 70 208 L 76 248 L 130 248 L 136 208 L 134 160 L 122 108 Z" />

        {/* Light pauldrons */}
        <path d="M 46 100 Q 60 90, 76 102 Q 82 114, 70 120 Q 56 126, 42 114 Z" />
        <path d="M 154 100 Q 140 90, 126 102 Q 120 114, 132 120 Q 146 126, 158 114 Z" />

        {/* Neck */}
        <rect x="92" y="88" width="20" height="24" rx="4" />

        {/* HOOD / COWL — curved, no flat top */}
        {/* Hood outer shape */}
        <path d="M 70 88 C 68 68, 68 45, 76 30 C 84 16, 96 8, 110 6 C 124 4, 138 10, 146 24 C 154 38, 156 60, 152 80 L 148 88 Z" />
        {/* Hood brow shadow — lower, concealing face */}
        <path d="M 72 68 C 70 56, 72 46, 80 40 C 92 32, 110 30, 126 38 C 136 44, 142 56, 140 68 Z" />
        {/* Face void (very dark, mysterious) */}
        <path d="M 78 70 C 76 60, 82 50, 92 46 C 104 42, 118 44, 126 52 C 132 60, 130 72, 122 76 L 80 74 Z" fill="#030308" />
        {/* Two faint eyes in darkness */}
        <ellipse cx="93" cy="61" rx="5" ry="3.5" fill="#0a0a1e" />
        <ellipse cx="115" cy="61" rx="5" ry="3.5" fill="#0a0a1e" />
        {/* Hood shadow line */}
        <path d="M 72 80 L 76 88 L 148 88 L 150 80" fill="none" stroke="#05050c" strokeWidth="2" />

        {/* Right arm + forward dagger (thrust) */}
        <path d="M 130 110 L 148 90 L 165 68 L 168 46 L 160 42 L 155 65 L 140 87 L 124 108 Z" />
        {/* Forward dagger blade (extended thrust) */}
        <path d="M 160 43 L 200 -18 L 205 -14 L 164 48 Z" />
        {/* Dagger guard */}
        <rect x="152" y="40" width="22" height="6" rx="2" transform="rotate(-15, 163, 43)" />
        {/* Dagger grip */}
        <rect x="158" y="46" width="7" height="18" rx="2" transform="rotate(-15, 161, 55)" />

        {/* Left arm + reverse grip dagger (drawn back) */}
        <path d="M 70 112 L 54 130 L 40 154 L 36 178 L 48 182 L 58 160 L 70 138 L 78 116 Z" />
        {/* Reverse grip blade (pointing down-back) */}
        <path d="M 38 178 L 10 230 L 16 234 L 44 183 Z" />
        {/* Reverse dagger guard */}
        <rect x="30" y="175" width="20" height="6" rx="2" transform="rotate(20, 40, 178)" />
        {/* Reverse dagger grip */}
        <rect x="36" y="181" width="7" height="16" rx="2" transform="rotate(20, 39, 189)" />
      </g>
    </svg>
  )
}
