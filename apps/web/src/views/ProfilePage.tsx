'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useResolvedAuth } from '@/hooks/useResolvedAuth'
import { shareCard } from '@/lib/shareCard'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { usePlayerStore } from '@/stores/usePlayerStore'
import InventoryPanel from '@/components/player-card/InventoryPanel'
import DecayPanel from '@/components/player-card/DecayPanel'
import IdlePanel from '@/components/idle/IdlePanel'
import BattleHistory from '@/components/profile/BattleHistory'
import UsernameSetup from '@/components/profile/UsernameSetup'
import { ChainBadge } from '@/components/ui/ChainBadge'
import CharacterViewer from '@/components/warrior/CharacterViewer'
import { CLASS_DEFINITIONS, CHARACTER_GLB } from '@/lib/classes'
import type { CharacterClass } from '@/lib/classes'
import { xpForNextRank, TELEGRAM_URL } from '@/lib/constants'
import type { Item } from '@/types'
import LoadingScreen from '@/components/ui/LoadingScreen'
import Link from 'next/link'
import { Wallet, HelpCircle } from 'lucide-react'

export default function ProfilePage() {
  const { status, address } = useResolvedAuth()
  const router      = useRouter()
  const player       = usePlayerStore(s => s.player)
  const playerSynced = usePlayerStore(s => s.playerSynced)
  const inventory    = usePlayerStore(s => s.inventory)

  if (status === 'loading') return <LoadingScreen />
  if (status === 'unauthenticated' || !address) { router.replace('/'); return null }
  // No cache and sync not done yet — brief wait
  if (!player && !playerSynced) return <LoadingScreen />
  // Sync done, confirmed no player — let home page route them
  if (!player) { router.replace('/'); return null }

  const charClass  = (player.character_class ?? 'Berserker') as CharacterClass
  const def        = CLASS_DEFINITIONS[charClass] ?? CLASS_DEFINITIONS['Berserker']
  const xpBar      = xpForNextRank(player.rank)
  const xpProgress = (player.xp / xpBar) * 100
  const [showUsernameModal, setShowUsernameModal] = useState(false)
  const [cardCopied, setCardCopied] = useState(false)
  const { data: referrals } = useQuery<{ recruited: number; earned_g: number }>({
    queryKey: ['referrals', address],
    queryFn: async () => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/players/${address}/referrals`)
      if (!res.ok) throw new Error('failed')
      return res.json()
    },
    enabled: !!address,
    staleTime: 60_000,
  })

  const itemIds = inventory.map(i => i.item_id)
  const { data: items = [] } = useQuery({
    queryKey: ['items', itemIds],
    queryFn: async () => {
      if (itemIds.length === 0) return []
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ''}/items`)
      if (!res.ok) return []
      const all = await res.json()
      // See useBattle: a non-list 200 here silently empties the player's kit.
      if (!Array.isArray(all)) return []
      return (all as Item[]).filter(i => itemIds.includes(i.id))
    },
    enabled: itemIds.length > 0,
    staleTime: 60_000,
  })
  const itemMap      = new Map(items.map(i => [i.id, i]))
  const equipped     = inventory.filter(i => i.equipped).map(i => itemMap.get(i.item_id)).filter(Boolean) as Item[]
  const attackBoost  = equipped.filter(i => i.category === 'weapon').reduce((s, i) => s + i.stat_boost, 0)
  const defenseBoost = equipped.filter(i => i.category === 'shield').reduce((s, i) => s + i.stat_boost, 0)
  const hasXpBooster = equipped.some(i => i.category === 'booster')

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">

      {/* ── LEFT — Character art hero card ──────────────────────────── */}
      <motion.div
        className="lg:sticky lg:top-20 w-full lg:w-72 shrink-0 flex flex-col gap-3"
        initial={{ opacity: 0, x: -24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.55, ease: [0.16,1,0.3,1] }}
      >
        {/* Portrait card */}
        <div className="relative rounded-2xl overflow-hidden" style={{ height: 380 }}>
          {/* Atmosphere */}
          <div className="absolute inset-0" style={{
            background: `radial-gradient(ellipse 80% 90% at 50% 60%, ${def.accentColor}20, transparent)`,
          }}/>
          {/* 3D character model */}
          <CharacterViewer
            glbPath={CHARACTER_GLB[charClass]}
            accentColor={def.accentColor}
            animationName="idle"
            modelKey={`profile-${charClass}`}
            className="absolute inset-0"
          />
          {/* Bottom fade */}
          <div className="absolute inset-x-0 bottom-0 h-44 pointer-events-none" style={{
            background: 'linear-gradient(0deg, rgba(4,3,12,1) 0%, rgba(4,3,12,0.6) 50%, transparent 100%)',
          }}/>
          {/* Top class accent line */}
          <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: def.accentColor }}/>
          {/* Scanlines */}
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.04) 2px, rgba(0,0,0,0.04) 4px)',
          }}/>

          {/* Name + stats overlay */}
          <div className="absolute inset-x-0 bottom-0 p-4 flex flex-col gap-2.5">
            <div className="flex items-end justify-between">
              <div>
                <p className="font-display font-black text-white text-xl tracking-wider leading-none">
                  {player.character_name}
                </p>
                {player.username ? (
                  <button
                    onClick={() => setShowUsernameModal(true)}
                    className="text-[9px] text-slate-400 hover:text-white transition-colors font-medium mt-0.5 block"
                  >
                    @{player.username} · <span className="text-slate-600">edit</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setShowUsernameModal(true)}
                    className="text-[9px] font-bold hover:opacity-100 transition-opacity mt-0.5 block opacity-70"
                    style={{ color: def.accentColor }}
                  >
                    + Set username
                  </button>
                )}
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[9px] font-black uppercase tracking-[0.18em] px-2 py-0.5 rounded-sm inline-block"
                    style={{ background: def.accentColorDim, color: def.accentColor, border: `1px solid ${def.accentColor}40` }}>
                    {player.character_class}
                  </span>
                  {player.character_claim_tx && (
                    <ChainBadge txHash={player.character_claim_tx} />
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-[9px] text-slate-500 uppercase tracking-wider">Rank</p>
                <p className="font-display font-black text-xl" style={{ color: def.accentColor }}>{player.rank}</p>
              </div>
            </div>

            {/* XP bar */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[9px] text-slate-600 uppercase tracking-wider">
                <span>{player.xp.toLocaleString()} XP</span>
                <span>{xpBar.toLocaleString()} next</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(42,42,58,0.8)' }}>
                <motion.div className="h-full rounded-full"
                  style={{ background: `linear-gradient(90deg, ${def.accentColor}99, ${def.accentColor})` }}
                  initial={{ width: 0 }} animate={{ width: `${xpProgress}%` }}
                  transition={{ duration: 0.7, delay: 0.3 }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Stat grid */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { l: 'ATK', v: player.attack_stat,  boost: attackBoost,  c: '#ef4444' },
            { l: 'DEF', v: player.defense_stat, boost: defenseBoost, c: '#3b82f6' },
            { l: 'SPD', v: player.speed_stat,   boost: 0,            c: '#22c55e' },
          ].map(({ l, v, boost, c }) => (
            <div key={l} className="flex flex-col items-center py-3 rounded-xl border"
              style={{ background: `${c}08`, borderColor: boost > 0 ? `${c}45` : `${c}20` }}>
              <span className="text-[8px] uppercase tracking-widest font-bold mb-0.5" style={{ color: c }}>{l}</span>
              <span className="font-display font-black text-white text-lg leading-none">{v + boost}</span>
              {boost > 0 && (
                <span className="text-[7px] font-bold mt-0.5" style={{ color: c }}>+{boost}</span>
              )}
            </div>
          ))}
        </div>

        {hasXpBooster && (
          <div className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg"
            style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)' }}>
            <span className="text-[8px] font-black uppercase tracking-widest text-purple-400">2× XP Active</span>
          </div>
        )}

        {/* Battle record */}
        <div className="flex items-center justify-between px-4 py-3 rounded-xl border"
          style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(42,42,58,0.8)' }}>
          <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Record</p>
          <p className="text-sm font-black text-white">
            <span className="text-green-400">{player.wins}W</span>
            <span className="text-slate-700 mx-1">/</span>
            <span className="text-red-400">{player.losses}L</span>
          </p>
        </div>

        {/* Go to Bank — TALLY balance, earnings breakdown, transfer out */}
        <Link
          href="/bank"
          className="flex items-center justify-between px-4 py-3 rounded-xl border transition-colors hover:border-amber-500/50"
          style={{ background: 'rgba(234,179,8,0.08)', borderColor: 'rgba(234,179,8,0.35)' }}
        >
          <div className="flex items-center gap-2">
            <Wallet size={16} className="text-amber-400" />
            <span className="font-bold text-white text-sm">Go to Bank</span>
          </div>
          <span className="text-[9px] uppercase tracking-widest text-amber-500/70 font-bold">TALLY · Claim · Transfer</span>
        </Link>

        {/* Telegram — same ask as onboarding, kept reachable afterwards. A player
            who skipped it there, or joined before they ever opened the site, has
            no other route to the group from inside the app. Sits between Bank and
            Help Center so the community sits with the other "where do I go for
            things" rows rather than buried in the FAQ. */}
        <a
          href={TELEGRAM_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center justify-between px-4 py-3 rounded-xl border transition-colors hover:border-sky-500/50"
          style={{ background: 'rgba(42,171,238,0.07)', borderColor: 'rgba(42,171,238,0.3)' }}
        >
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#2AABEE" aria-hidden>
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
            <span className="font-bold text-white text-sm">Join the Telegram</span>
          </div>
          <span className="text-[9px] uppercase tracking-widest font-bold" style={{ color: 'rgba(42,171,238,0.75)' }}>
            News · Seasons · Support
          </span>
        </a>

        {/* Help Center: FAQ, walkthrough, Telegram */}
        <Link
          href="/help"
          className="flex items-center justify-between px-4 py-3 rounded-xl border transition-colors hover:border-amber-500/40"
          style={{ background: 'rgba(8,8,14,0.6)', borderColor: 'rgba(42,42,58,0.8)' }}
        >
          <div className="flex items-center gap-2">
            <HelpCircle size={16} className="text-slate-300" />
            <span className="font-bold text-white text-sm">Help Center</span>
          </div>
          <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">FAQ · Guide · Support</span>
        </Link>

        {/* Decay panel */}
        <DecayPanel walletAddress={address} />
      </motion.div>

      {/* ── RIGHT — Panels ──────────────────────────────────────────── */}
      {/* w-full min-w-0 is the alignment fix, and both halves are needed.
          The parent is `items-start`, i.e. align-items:flex-start — in a COLUMN
          flex that stops children stretching to the container width, so a child
          with no width sizes to its own content. The left column carries w-full
          and stays pinned to the page; this one did not, so everything from
          WARRIOR FILE down (header, player card, idle, inventory, battle
          history) sized itself to its widest child and ran past the left
          column's right edge instead of lining up with it.
          `flex-1` does not help: in a column it governs the MAIN axis, which is
          height. min-w-0 then lets long children shrink rather than push the
          column wide again. On lg: the parent becomes flex-row, where flex-1's
          0% basis governs the width and w-full is inert. */}
      <motion.div
        className="flex-1 w-full min-w-0 flex flex-col gap-4"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.12 }}
      >
        {/* Page header */}
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <p className="text-[10px] uppercase tracking-[0.3em] font-bold" style={{ color: def.accentColor }}>
              Warrior File
            </p>
            <h1 className="font-display font-black text-white text-2xl tracking-wide">Profile</h1>
          </div>
          <button
            onClick={() => setShowUsernameModal(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border transition-all hover:border-slate-500 hover:text-white shrink-0"
            style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(42,42,58,0.8)', color: 'rgba(148,163,184,0.8)' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            <span className="text-xs font-bold">
              {player.username ? `@${player.username}` : 'Set username'}
            </span>
          </button>
        </div>

        {/* Your public card. Previously there was NO way to reach your own card
            from inside the app — it existed only at /card/<wallet>, linked from
            the leaderboard (top 50 only) and the challenge screen. */}
        <div className="rounded-2xl border border-hunt-border bg-hunt-surface p-5 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="font-display font-black text-white text-sm uppercase tracking-wider">
              Your player card
            </p>
            <p className="text-slate-500 text-xs mt-1 leading-relaxed">
              A public page with your rank, record and loadout. Sharing it posts a preview
              of your warrior — and anyone who joins through it earns you 100 TALLY.
            </p>
            {/* The count is the whole point of the loop: someone who can see
                three recruits is far likelier to share a fourth time. */}
            {referrals && referrals.recruited > 0 && (
              <p className="text-hunt-gold text-xs font-bold mt-2">
                {referrals.recruited} warrior{referrals.recruited === 1 ? '' : 's'} recruited
                {' · '}
                {referrals.earned_g.toLocaleString()} TALLY earned
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <Link
              href={`/card/${address}`}
              className="px-4 min-h-10 flex items-center justify-center rounded-xl bg-hunt-surface-2 border border-hunt-border text-slate-200 font-bold text-xs hover:border-hunt-gold/60 hover:text-white transition-colors"
            >
              View
            </Link>
            <button
              onClick={() => {
                void shareCard(address, player.username || player.character_name).then((o) => {
                  if (o !== 'copied') return
                  setCardCopied(true)
                  setTimeout(() => setCardCopied(false), 2000)
                })
              }}
              className="px-4 min-h-10 rounded-xl bg-hunt-gold text-black font-bold text-xs hover:bg-hunt-gold-light transition-colors"
            >
              {cardCopied ? 'Copied!' : 'Share'}
            </button>
          </div>
        </div>

        <IdlePanel walletAddress={address} player={player} />
        <InventoryPanel inventory={inventory} walletAddress={address} />
        <BattleHistory walletAddress={address} />
      </motion.div>

      {showUsernameModal && (
        <UsernameSetup
          walletAddress={address}
          onClose={() => setShowUsernameModal(false)}
        />
      )}
    </div>
  )
}
