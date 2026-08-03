'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ShoppingBag, Trophy, ChevronRight, Zap, Flame } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { usePlayerStore } from '@/stores/usePlayerStore'
import { useResolvedAuth } from '@/hooks/useResolvedAuth'
import LandingPage from '@/components/landing/LandingPage'
import LoadingScreen from '@/components/ui/LoadingScreen'
import { CLASS_DEFINITIONS } from '@/lib/classes'
import { xpForNextRank, nextRankReward } from '@/lib/constants'
import { rankLabel } from '@/lib/ranks'
import { formatGDollarNumber } from '@/utils/format'

const CLASS_SOLO: Record<string, string> = {
  Berserker: '/characters/Berserkers.webp',
  Sentinel:  '/characters/Sentinel.webp',
  Phantom:   '/characters/Phanthom.webp',
}

const ACTIONS: { to: string; Icon: LucideIcon; label: string; desc: string; color: string }[] = [
  { to: '/battle',      Icon: Flame,       label: 'Fight',       desc: 'Campaign · PvP · Challenge a player',       color: '#ff4422' },
  { to: '/marketplace', Icon: ShoppingBag, label: 'Armoury',     desc: 'Guns · Boosters · Player Listings',         color: '#eab308' },
  { to: '/leaderboard', Icon: Trophy,      label: 'War Board',   desc: 'Top 50 warriors ranked by tier',            color: '#3b82f6' },
]

export default function HomePage() {
  const { status, address } = useResolvedAuth()
  const player       = usePlayerStore(s => s.player)
  const playerSynced = usePlayerStore(s => s.playerSynced)
  const syncFailed   = usePlayerStore(s => s.syncFailed)
  const router       = useRouter()

  useEffect(() => {
    // Once sync confirms no player exists (and it's not a network failure),
    // send to onboarding. Only do this after sync — not during — to avoid
    // redirecting a returning user whose cached data is about to load.
    if (status !== 'ready' || !address) return
    if (playerSynced && !player && !syncFailed) {
      router.replace('/onboarding')                       // new user → onboarding
    } else if (player && player.character_confirmed === false) {
      router.replace('/onboarding')                       // reconstructed → confirm-your-class
    }
  }, [status, address, player, playerSynced, syncFailed, router])

  // Unauthenticated
  if (status === 'unauthenticated') return <LandingPage />
  // Network failure with no cache — show retry
  if (syncFailed && !player) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-32" style={{ background: '#04030c' }}>
        <p className="text-white font-display font-black text-xl">Connection issue</p>
        <p className="text-slate-500 text-sm">Check your internet and try again.</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 px-6 py-3 rounded-xl font-bold text-sm text-black"
          style={{ background: '#eab308' }}
        >
          Retry
        </button>
      </div>
    )
  }

  // Still loading the player — only ever a first-time / cache-cleared visit, since a
  // returning wallet is served instantly from the persisted cache.
  if (!player) return <LoadingScreen />

  const charClass    = player.character_class ?? 'Sentinel'
  const def          = CLASS_DEFINITIONS[charClass]
  const heroImg      = (player.character_customization as { avatar_url?: string } | null)?.avatar_url ?? CLASS_SOLO[charClass]
  const xpBar        = xpForNextRank(player.rank)
  const xpProgress   = (player.xp / xpBar) * 100
  const nextReward   = nextRankReward(player.rank)

  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-stretch min-h-[calc(100vh-7rem)]">

      {/* ── CHARACTER PORTRAIT ─────────────────────────────────────── */}
      <motion.div
        className="relative lg:w-[340px] shrink-0 rounded-2xl overflow-hidden"
        style={{ minHeight: 420, background: '#06050f' }}
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: [0.16,1,0.3,1] }}
      >
        {/* Class atmosphere behind portrait */}
        <div className="absolute inset-0" style={{
          background: `radial-gradient(ellipse 70% 80% at 50% 70%, ${def.accentColor}20 0%, transparent 70%)`,
        }}/>

        {/* Character image fills the card */}
        <img
          src={heroImg}
          alt={charClass}
          className="absolute inset-0 w-full h-full object-cover object-top select-none"
          style={{ filter: `saturate(1.05) contrast(1.05) drop-shadow(0 0 30px ${def.glowColor})` }}
        />

        {/* Bottom fade into dark */}
        <div className="absolute inset-x-0 bottom-0 h-40 pointer-events-none" style={{
          background: 'linear-gradient(0deg, rgba(4,3,12,0.98) 0%, rgba(4,3,12,0.6) 55%, transparent 100%)',
        }}/>
        {/* Top fade */}
        <div className="absolute inset-x-0 top-0 h-16 pointer-events-none" style={{
          background: 'linear-gradient(180deg, rgba(4,3,12,0.7) 0%, transparent 100%)',
        }}/>

        {/* Corner scanlines */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.04) 2px, rgba(0,0,0,0.04) 4px)',
        }}/>

        {/* Overlay: name + class + stats at bottom */}
        <div className="absolute inset-x-0 bottom-0 p-5 flex flex-col gap-2">
          <div className="flex items-end justify-between">
            <div>
              <p className="font-display font-black text-white text-xl tracking-wider leading-none">
                {player.character_name}
              </p>
              <span
                className="text-[9px] font-black uppercase tracking-[0.18em] px-2 py-0.5 rounded-sm mt-1.5 inline-block"
                style={{ background: def.accentColorDim, color: def.accentColor, border: `1px solid ${def.accentColor}40` }}
              >
                {player.character_class}
              </span>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Rank</p>
              <p className="font-display font-black text-lg" style={{ color: def.accentColor }}>{rankLabel(player.rank, player.prestige_level ?? 0)}</p>
            </div>
          </div>

          {/* XP bar */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[9px] text-slate-600 uppercase tracking-wider">
              <span>{player.xp.toLocaleString()} XP</span>
              <span>{xpBar.toLocaleString()} XP</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(42,42,58,0.8)' }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: `linear-gradient(90deg, ${def.accentColor}aa, ${def.accentColor})` }}
                initial={{ width: 0 }}
                animate={{ width: `${xpProgress}%` }}
                transition={{ duration: 0.8, delay: 0.3 }}
              />
            </div>
          </div>

          {/* Mini stat row */}
          <div className="flex gap-3 pt-0.5">
            {[
              { l: 'ATK', v: player.attack_stat,  c: '#ef4444' },
              { l: 'DEF', v: player.defense_stat, c: '#3b82f6' },
              { l: 'SPD', v: player.speed_stat,   c: '#22c55e' },
            ].map(({ l, v }) => (
              <div key={l} className="flex items-center gap-1.5">
                <span className="text-[8px] font-bold uppercase" style={{ color: 'rgba(100,116,139,0.7)' }}>{l}</span>
                <span className="text-xs font-black text-white">{v}</span>
              </div>
            ))}
            <div className="ml-auto flex items-center gap-1">
              <span className="text-[8px] text-slate-600 uppercase">G$</span>
              <span className="text-xs font-black text-amber-400">{formatGDollarNumber(player.g_earned_lifetime)}</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── RIGHT PANEL ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-4">

        {/* Welcome banner */}
        <motion.div
          className="relative overflow-hidden rounded-xl px-5 py-4"
          style={{
            background: `linear-gradient(135deg, ${def.accentColor}14 0%, rgba(4,3,12,0.95) 60%)`,
            border: `1px solid ${def.accentColor}25`,
          }}
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <div className="absolute inset-y-0 left-0 w-1 rounded-l-xl" style={{ background: def.accentColor }}/>
          <p className="text-[10px] uppercase tracking-[0.25em] font-bold mb-0.5" style={{ color: def.accentColor }}>
            Arena Status
          </p>
          <p className="text-white font-bold text-sm">
            {player.wins}W <span className="text-slate-600 font-normal mx-1">/</span> {player.losses}L
            <span className="text-slate-500 text-xs font-normal ml-3">
              Next rank reward: <span className="text-amber-400 font-bold">{formatGDollarNumber(nextReward)}</span>
            </span>
          </p>
        </motion.div>

        {/* Action cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 flex-1">
          {ACTIONS.map(({ to, Icon, label, desc, color }, i) => (
            <motion.div
              key={to}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.15 + i * 0.08 }}
            >
              <Link
                href={to}
                className="group flex flex-col gap-4 p-5 h-full rounded-xl border transition-all relative overflow-hidden"
                style={{
                  background: 'rgba(10,10,18,0.9)',
                  borderColor: 'rgba(42,42,58,0.8)',
                }}
              >
                {/* Hover fill */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{ background: `radial-gradient(ellipse 80% 80% at 30% 30%, ${color}10, transparent)` }}
                />
                {/* Left accent bar */}
                <div
                  className="absolute inset-y-0 left-0 w-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: color }}
                />

                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center transition-all"
                  style={{
                    background: `${color}14`,
                    border: `1px solid ${color}30`,
                  }}
                >
                  <Icon size={22} style={{ color }} strokeWidth={1.8} />
                </div>

                <div className="relative z-10">
                  <p className="font-display font-black text-white text-base tracking-wide group-hover:text-[#eab308] transition-colors">
                    {label}
                  </p>
                  <p className="text-xs text-slate-500 mt-1 leading-snug">{desc}</p>
                </div>

                <ChevronRight
                  size={14}
                  className="absolute bottom-4 right-4 text-slate-700 group-hover:text-white group-hover:translate-x-0.5 transition-all"
                />
              </Link>
            </motion.div>
          ))}
        </div>

        {/* Special ability card */}
        <motion.div
          className="relative overflow-hidden rounded-xl p-4"
          style={{
            background: `linear-gradient(135deg, ${def.accentColor}10, rgba(4,3,12,0.9))`,
            border: `1px solid ${def.accentColor}20`,
          }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.45 }}
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: def.accentColorDim, border: `1px solid ${def.accentColor}40` }}>
              <Zap size={18} style={{ color: def.accentColor }} strokeWidth={2} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold mb-0.5" style={{ color: def.accentColor }}>
                {charClass} Special
              </p>
              <p className="text-white font-bold text-sm">{def.special}</p>
              <p className="text-slate-500 text-xs mt-0.5">{def.specialDesc}</p>
            </div>
          </div>
        </motion.div>

      </div>
    </div>
  )
}

