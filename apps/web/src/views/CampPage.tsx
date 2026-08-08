'use client'

import Link from 'next/link'
import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ShoppingBag, Trophy, ChevronRight, Swords, Crosshair, Lock, Radio, Skull } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { usePlayerStore } from '@/stores/usePlayerStore'
import { useResolvedAuth } from '@/hooks/useResolvedAuth'
import LandingPage from '@/components/landing/LandingPage'
import LoadingScreen from '@/components/ui/LoadingScreen'
import { CLASS_DEFINITIONS } from '@/lib/classes'
import { xpForNextRank } from '@/lib/constants'
import { rankLabel } from '@/lib/ranks'
import { gunFromItemId } from '@/lib/guns'
import {
  LEDGER_LENGTH, ZONE_META, nextContract, bossTrophies, contractsTaken,
  zoneOf, zoneBoss, zoneProgress, zoneReached,
} from '@/lib/ledger'
import { formatTallyNumber } from '@/utils/format'

const CLASS_SOLO: Record<string, string> = {
  Berserker: '/characters/Berserkers.webp',
  Sentinel:  '/characters/Sentinel.webp',
  Phantom:   '/characters/Phanthom.webp',
}

/**
 * What a first clear actually pays, from apps/api handlers/battles.rs
 * (FIRST_CLEAR_BOUNTY_G). Flat, and deliberately small — the board must not quote a
 * number the server will not settle.
 */
const FIRST_CLEAR_TALLY = 10

/**
 * Ember on the radio. She is the handler for the whole Ledger and the last name
 * on it, so her line tracks how far along the player is — and goes quiet once
 * they've taken her.
 */
function radioLine(pveLevel: number, nextName: string | undefined): string {
  if (pveLevel === 0) return "Radio check. There's one contract on the board — take it when you're ready."
  if (!nextName) return 'Board’s clear. Every op on the Ledger is behind you.'
  if (pveLevel === LEDGER_LENGTH - 1) return `Last one. ${nextName}. You know where.`
  if (pveLevel % 5 === 0) return `New zone, new board. ${nextName} is the one worth your time.`
  return `Board’s been updated. ${nextName} is next if you want the work.`
}

export default function CampPage() {
  const { status, address } = useResolvedAuth()
  const player       = usePlayerStore(s => s.player)
  const inventory    = usePlayerStore(s => s.inventory)
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

  const pveLevel = player?.pve_level ?? 0
  const next     = useMemo(() => nextContract(pveLevel), [pveLevel])
  // The rack is every gun the player actually owns — marketplace items that join
  // to an engine gun id. Duplicates collapse; the starter sidearm is always there.
  const gunsOwned = useMemo(
    () => new Set(inventory.map(i => gunFromItemId(i.item_id)).filter(Boolean)).size + 1,
    [inventory],
  )

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

  const charClass  = player.character_class ?? 'Sentinel'
  const def        = CLASS_DEFINITIONS[charClass]
  const heroImg    = (player.character_customization as { avatar_url?: string } | null)?.avatar_url ?? CLASS_SOLO[charClass]
  const xpBar      = xpForNextRank(player.rank)
  const xpProgress = Math.min(100, (player.xp / xpBar) * 100)
  const zone       = next ? zoneOf(next) : ZONE_META[ZONE_META.length - 1]
  const bosses     = bossTrophies(pveLevel)
  const taken      = contractsTaken(pveLevel).length
  const longHuntOpen = pveLevel >= LEDGER_LENGTH

  return (
    <div className="flex flex-col gap-4 min-h-[calc(100vh-7rem)]">

      {/* ── THE RADIO ───────────────────────────────────────────────
          Ember, before she is a name on the board. Sets the register for
          everything under it. */}
      <motion.div
        className="flex items-start gap-3 px-4 py-3 rounded-lg"
        style={{ background: 'rgba(10,10,18,0.75)', border: '1px solid rgba(42,42,58,0.7)' }}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
      >
        <Radio size={14} className="shrink-0 mt-0.5" style={{ color: '#c2410c' }} strokeWidth={2} />
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-[0.22em] font-bold" style={{ color: '#c2410c' }}>Ember</p>
          <p className="text-sm text-slate-300 leading-snug">{radioLine(pveLevel, next?.name)}</p>
        </div>
      </motion.div>

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 items-stretch flex-1">

        {/* ── THE HUNTER ────────────────────────────────────────────
            Who you are, on the table where you left it. */}
        <motion.div
          className="relative lg:w-[300px] shrink-0 rounded-2xl overflow-hidden"
          style={{ minHeight: 400, background: '#06050f' }}
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="absolute inset-0" style={{
            background: `radial-gradient(ellipse 70% 80% at 50% 70%, ${def.accentColor}20 0%, transparent 70%)`,
          }}/>
          <img
            src={heroImg}
            alt={charClass}
            className="absolute inset-0 w-full h-full object-cover object-top select-none"
            style={{ filter: `saturate(1.05) contrast(1.05) drop-shadow(0 0 30px ${def.glowColor})` }}
          />
          <div className="absolute inset-x-0 bottom-0 h-40 pointer-events-none" style={{
            background: 'linear-gradient(0deg, rgba(4,3,12,0.98) 0%, rgba(4,3,12,0.6) 55%, transparent 100%)',
          }}/>
          <div className="absolute inset-x-0 top-0 h-16 pointer-events-none" style={{
            background: 'linear-gradient(180deg, rgba(4,3,12,0.7) 0%, transparent 100%)',
          }}/>

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
                <p className="font-display font-black text-lg" style={{ color: def.accentColor }}>
                  {rankLabel(player.rank, player.prestige_level ?? 0)}
                </p>
              </div>
            </div>

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

            <div className="flex items-center gap-3 pt-0.5">
              <span className="text-[9px] text-slate-600 uppercase tracking-wider">
                {taken}/{LEDGER_LENGTH} cleared
              </span>
              <span className="ml-auto flex items-center gap-1">
                <span className="text-[8px] text-slate-600 uppercase">TALLY</span>
                <span className="text-xs font-black text-amber-400">{formatTallyNumber(player.g_earned_lifetime)}</span>
              </span>
            </div>
          </div>
        </motion.div>

        {/* ── THE ROOM ──────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col gap-4">

          {/* The board — the one thing on this screen that is the point of it. */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            {next ? (
              <Link
                href={`/fight?op=${next.op}`}
                className="group relative flex flex-col gap-3 p-5 rounded-xl overflow-hidden transition-all"
                style={{
                  background: `linear-gradient(135deg, ${zone.accent}18 0%, rgba(6,5,15,0.96) 55%)`,
                  border: `1px solid ${zone.accent}45`,
                }}
              >
                <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: zone.accent }}/>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-[9px] uppercase tracking-[0.22em] font-bold" style={{ color: zone.accent }}>
                    {next.isBoss ? 'Contract · Marked' : 'Contract'}
                  </span>
                  <span className="text-[9px] uppercase tracking-[0.18em] text-slate-500">
                    Op {next.op + 1} · {zone.name}
                  </span>
                </div>

                <div className="flex items-end gap-3 flex-wrap">
                  <h2 className="font-display font-black text-white text-3xl sm:text-4xl tracking-wide leading-none">
                    {next.name}
                  </h2>
                  {next.isBoss && (
                    <Skull size={18} className="mb-1" style={{ color: zone.accent }} strokeWidth={2} />
                  )}
                </div>

                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{zone.subtitle}</p>
                <p className="text-sm text-slate-300 leading-snug max-w-xl">{next.story ?? next.brief}</p>

                <div className="flex items-center gap-4 pt-2 mt-1 border-t border-dashed" style={{ borderColor: 'rgba(42,42,58,0.9)' }}>
                  <span className="text-xs font-bold" style={{ color: zone.accent }}>
                    {FIRST_CLEAR_TALLY} TALLY
                  </span>
                  <span className="text-[10px] text-slate-600 uppercase tracking-wider">
                    on first clear · no fee to sign
                  </span>
                  <span className="ml-auto flex items-center gap-1.5 text-sm font-display font-black uppercase tracking-widest text-white group-hover:translate-x-0.5 transition-transform">
                    Sign <ChevronRight size={14} />
                  </span>
                </div>
              </Link>
            ) : (
              <div
                className="flex flex-col gap-2 p-5 rounded-xl"
                style={{ background: 'rgba(10,10,18,0.9)', border: '1px solid rgba(42,42,58,0.8)' }}
              >
                <span className="text-[9px] uppercase tracking-[0.22em] font-bold text-slate-500">The board</span>
                <p className="font-display font-black text-white text-2xl tracking-wide">Clear</p>
                <p className="text-sm text-slate-400">
                  Every op on the Ledger is behind you. The Long Hunt is where the work is now.
                </p>
              </div>
            )}
          </motion.div>

          {/* The zones — how far the Ledger has been walked. */}
          <motion.div
            className="grid grid-cols-3 gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            {ZONE_META.map(z => {
              const { cleared, total } = zoneProgress(z.key, pveLevel)
              const open = zoneReached(z.key, pveLevel) || z.key === zone.key
              return (
                <div
                  key={z.key}
                  className="flex flex-col gap-1.5 px-3 py-2.5 rounded-lg"
                  style={{
                    background: 'rgba(10,10,18,0.85)',
                    border: `1px solid ${open ? `${z.accent}35` : 'rgba(42,42,58,0.7)'}`,
                    opacity: open ? 1 : 0.5,
                  }}
                >
                  <p
                    className="font-display font-black text-xs uppercase tracking-wider truncate"
                    style={{ color: open ? z.accent : '#64748b' }}
                  >
                    {open ? z.name : 'Sealed'}
                  </p>
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(42,42,58,0.8)' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${(cleared / total) * 100}%`, background: z.accent }}
                    />
                  </div>
                  <p className="text-[9px] text-slate-600 uppercase tracking-wider tabular-nums">{cleared}/{total}</p>
                </div>
              )
            })}
          </motion.div>

          {/* The rest of the room. Each one is a thing you walk to, not a tab. */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <RoomCard
              i={0} to="/battle" Icon={Crosshair} color="#c2410c"
              label="The Ledger" detail={`${taken} of ${LEDGER_LENGTH} cleared`}
            />
            <RoomCard
              i={1} to="/marketplace" Icon={ShoppingBag} color="#eab308"
              label="The Rack" detail={`${gunsOwned} ${gunsOwned === 1 ? 'gun' : 'guns'} · resupply`}
            />
            <RoomCard
              i={2}
              to={longHuntOpen ? '/endless' : undefined}
              Icon={Swords} color="#0e7490"
              label="The Long Hunt"
              detail={longHuntOpen ? 'Go deep · press your luck' : `Clear the Ledger to open`}
            />
            <RoomCard
              i={3} to="/duels" Icon={Trophy} color="#3b82f6"
              label="Contested" detail="Someone else wants it"
            />
          </div>

          {/* The wall — one hook per boss, empty until it isn't. */}
          <motion.div
            className="flex items-center gap-4 px-4 py-3 rounded-xl"
            style={{ background: 'rgba(10,10,18,0.85)', border: '1px solid rgba(42,42,58,0.7)' }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.45 }}
          >
            <p className="text-[9px] uppercase tracking-[0.22em] font-bold text-slate-500 shrink-0">The wall</p>
            <div className="flex items-center gap-2 flex-wrap">
              {ZONE_META.map(z => {
                const boss = zoneBoss(z.key)
                const took = boss ? bosses.some(b => b.op === boss.op) : false
                return (
                  <span
                    key={z.key}
                    className="text-[10px] font-black uppercase tracking-[0.14em] px-2.5 py-1 rounded-sm"
                    style={{
                      background: took ? `${z.accent}1f` : 'rgba(42,42,58,0.35)',
                      color: took ? z.accent : '#4b5563',
                      border: `1px solid ${took ? `${z.accent}55` : 'rgba(42,42,58,0.8)'}`,
                    }}
                    title={took ? `${boss?.name} — taken` : 'Empty hook'}
                  >
                    {took ? boss?.name : '— — —'}
                  </span>
                )
              })}
            </div>
          </motion.div>

        </div>
      </div>
    </div>
  )
}

/** One object in the room. Without `to`, it renders locked and isn't clickable. */
function RoomCard({ i, to, Icon, color, label, detail }: {
  i: number
  to?: string
  Icon: LucideIcon
  color: string
  label: string
  detail: string
}) {
  const locked = !to
  const body = (
    <>
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: `radial-gradient(ellipse 80% 80% at 30% 30%, ${color}12, transparent)` }}
      />
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `${color}14`, border: `1px solid ${color}30` }}
      >
        {locked
          ? <Lock size={16} className="text-slate-600" strokeWidth={1.8} />
          : <Icon size={18} style={{ color }} strokeWidth={1.8} />}
      </div>
      <div className="relative z-10 min-w-0">
        <p className="font-display font-black text-white text-sm tracking-wide truncate">{label}</p>
        <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{detail}</p>
      </div>
    </>
  )

  const className = 'group relative flex flex-col gap-3 p-4 h-full rounded-xl border overflow-hidden transition-all'
  const style = {
    background: 'rgba(10,10,18,0.9)',
    borderColor: 'rgba(42,42,58,0.8)',
    opacity: locked ? 0.55 : 1,
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.25 + i * 0.06 }}
    >
      {locked
        ? <div className={className} style={style} aria-disabled="true">{body}</div>
        : <Link href={to} className={className} style={style}>{body}</Link>}
    </motion.div>
  )
}
