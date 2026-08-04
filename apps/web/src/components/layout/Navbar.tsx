'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { usePlayerStore } from '@/stores/usePlayerStore'
import { useResolvedAuth } from '@/hooks/useResolvedAuth'
import { ConnectButton } from '@/components/ui/ConnectButton'
import { useGBalance } from '@/hooks/useGBalance'
import { CLASS_DEFINITIONS } from '@/lib/classes'
import { useAudio } from '@/hooks/useAudio'
import { Volume2, VolumeX, HelpCircle } from 'lucide-react'

function AudioToggle() {
  const { muted, toggleMute } = useAudio()
  return (
    <button
      onClick={toggleMute}
      className="flex items-center justify-center w-8 h-8 rounded transition-opacity opacity-50 hover:opacity-100"
      title={muted ? 'Unmute' : 'Mute'}
      style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
      aria-label={muted ? 'Unmute audio' : 'Mute audio'}
    >
      {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
    </button>
  )
}

const NAV_LINKS = [
  { to: '/',            label: 'Home',    exact: true  },
  { to: '/battle',      label: 'Fight',   exact: false },
  { to: '/profile',     label: 'Profile', exact: false },
  { to: '/marketplace', label: 'Market',  exact: false },
  { to: '/leaderboard', label: 'Ranks',   exact: false },
]

export default function Navbar() {
  const pathname  = usePathname()
  const player    = usePlayerStore(s => s.player)
  const { address } = useResolvedAuth()
  const { formatted: gBalance } = useGBalance(address)

  const classDef = player?.character_class ? CLASS_DEFINITIONS[player.character_class] : null

  // Landing page is fullscreen — navbar competes with it
  if (!address) return null

  return (
    <nav
      className="sticky top-0 z-50 glass border-b-0"
      style={{
        background: 'rgba(4,3,12,0.88)',
        backdropFilter: 'blur(16px)',
        borderBottom: `1px solid ${classDef ? `${classDef.accentColor}30` : 'rgba(42,42,58,0.8)'}`,
        boxShadow: classDef ? `0 1px 0 0 ${classDef.accentColor}20, 0 4px 24px rgba(0,0,0,0.6)` : '0 4px 24px rgba(0,0,0,0.6)',
        // Standalone PWA: keep the header below the status bar / notch while the
        // blurred background still fills up to the very top edge.
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
    >
      {/* Marksman accent line at very top */}
      <div className="h-px w-full" style={{
        background: classDef
          ? `linear-gradient(90deg, transparent 0%, ${classDef.accentColor}80 30%, ${classDef.accentColor} 50%, ${classDef.accentColor}80 70%, transparent 100%)`
          : 'linear-gradient(90deg, transparent 0%, rgba(234,179,8,0.5) 30%, rgba(234,179,8,0.8) 50%, rgba(234,179,8,0.5) 70%, transparent 100%)',
      }}/>

      <div className="container mx-auto px-4 max-w-6xl h-14 flex items-center justify-between">

        {/* LEFT — Logo + nav links */}
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="flex items-center gap-2 font-display font-black text-lg tracking-[0.12em] relative"
            style={{
              color: '#eab308',
              textShadow: '0 0 20px rgba(234,179,8,0.6)',
            }}
          >
            <img
              src="/hunt-mark.png"
              alt="StillHunt"
              className="h-7 w-auto"
              style={{ filter: 'drop-shadow(0 0 10px rgba(234,179,8,0.35))' }}
            />
            STILLHUNT
          </Link>

          <div className="hidden md:flex items-center gap-0.5">
            {NAV_LINKS.map(({ to, label, exact }) => {
              const isActive = exact ? pathname === to : pathname?.startsWith(to)
              return (
                <Link
                  key={to}
                  href={to}
                  className="relative px-3.5 py-2 text-xs font-black uppercase tracking-[0.14em] transition-colors"
                  style={{ color: isActive ? '#fff' : 'rgba(148,163,184,0.7)' }}
                >
                  {label}
                  {isActive && (
                    <span
                      className="absolute bottom-0 inset-x-2 h-0.5 rounded-full"
                      style={{ background: classDef?.accentColor ?? '#eab308' }}
                    />
                  )}
                </Link>
              )
            })}
          </div>
        </div>

        {/* RIGHT — Balance + character + connect */}
        <div className="flex items-center gap-2.5">
          {gBalance && (
            <div
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded"
              style={{
                background: 'rgba(234,179,8,0.08)',
                border: '1px solid rgba(234,179,8,0.2)',
              }}
            >
              <span className="text-[9px] font-bold text-amber-500/60 uppercase tracking-wider">TALLY</span>
              <span className="text-xs font-black text-amber-400">{gBalance}</span>
            </div>
          )}

          {player && (
            <Link
              href="/profile"
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded transition-all"
              style={{
                background: classDef ? `${classDef.accentColor}10` : 'rgba(26,26,40,0.8)',
                border: `1px solid ${classDef ? `${classDef.accentColor}30` : 'rgba(42,42,58,0.8)'}`,
              }}
            >
              <span className="text-xs font-black text-white tracking-wide">
                {player.character_name}
              </span>
              <span
                className="text-[9px] font-black px-1.5 py-0.5 rounded-sm uppercase tracking-wider"
                style={{
                  background: classDef?.accentColorDim,
                  color: classDef?.accentColor ?? '#eab308',
                }}
              >
                {player.rank}
              </span>
            </Link>
          )}

          <Link
            href="/help"
            title="Help Center"
            aria-label="Help Center"
            className="flex items-center justify-center w-8 h-8 rounded transition-opacity opacity-50 hover:opacity-100"
            style={{ color: pathname?.startsWith('/help') ? '#eab308' : undefined }}
          >
            <HelpCircle size={17} />
          </Link>
          <AudioToggle />
          <ConnectButton />
        </div>
      </div>
    </nav>
  )
}
