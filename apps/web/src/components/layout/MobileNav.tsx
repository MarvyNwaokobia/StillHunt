'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Crosshair, User, ShoppingBag, Trophy } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { usePlayerStore } from '@/stores/usePlayerStore'
import { useResolvedAuth } from '@/hooks/useResolvedAuth'
import { CLASS_DEFINITIONS } from '@/lib/classes'

const NAV_ITEMS: { to: string; Icon: LucideIcon; label: string; exact: boolean }[] = [
  { to: '/',            Icon: Home,        label: 'Home',    exact: true  },
  { to: '/battle',      Icon: Crosshair,   label: 'Fight',   exact: false },
  { to: '/profile',     Icon: User,        label: 'Profile', exact: false },
  { to: '/marketplace', Icon: ShoppingBag, label: 'Market',  exact: false },
  { to: '/leaderboard', Icon: Trophy,      label: 'Ranks',   exact: false },
]

export default function MobileNav() {
  const { address } = useResolvedAuth()
  const pathname    = usePathname()
  const player      = usePlayerStore(s => s.player)
  const classDef    = player?.character_class ? CLASS_DEFINITIONS[player.character_class] : null
  const accent      = classDef?.accentColor ?? '#eab308'

  if (!address) return null

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden"
      style={{
        background: 'rgba(4,3,12,0.96)',
        backdropFilter: 'blur(16px)',
        borderTop: `1px solid ${accent}25`,
        boxShadow: `0 -4px 24px rgba(0,0,0,0.8), 0 -1px 0 ${accent}15`,
        // Standalone PWA: lift the tab bar above the home indicator, with the
        // blurred background still filling down to the bottom edge.
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
    >
      {/* Top accent line */}
      <div className="h-px w-full" style={{
        background: `linear-gradient(90deg, transparent, ${accent}60 30%, ${accent} 50%, ${accent}60 70%, transparent)`,
      }}/>

      <div className="flex items-center justify-around h-14 px-1">
        {NAV_ITEMS.map(({ to, Icon, label, exact }) => {
          const isActive = exact ? pathname === to : !!pathname?.startsWith(to)
          return (
            <Link
              key={to}
              href={to}
              className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-all relative"
            >
              {isActive && (
                <span
                  className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full"
                  style={{ background: accent }}
                />
              )}
              <Icon
                size={18}
                strokeWidth={isActive ? 2.5 : 1.6}
                style={{ color: isActive ? accent : 'rgba(100,116,139,0.7)' }}
              />
              <span
                className="text-[9px] font-black uppercase tracking-wider leading-none"
                style={{ color: isActive ? accent : 'rgba(71,85,105,0.8)' }}
              >
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
