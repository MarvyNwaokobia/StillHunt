'use client'

import { useState, useEffect } from 'react'
import { getReferrer, clearReferrer } from '@/lib/referral'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { usePlayerStore } from '@/stores/usePlayerStore'
import { useResolvedAuth } from '@/hooks/useResolvedAuth'
import LoadingScreen from '@/components/ui/LoadingScreen'

import CharacterSelectScreen from '@/components/onboarding/CharacterSelectScreen'
import TutorialArena from '@/components/onboarding/TutorialArena'
import { TELEGRAM_URL } from '@/lib/constants'
import { CLASS_DEFINITIONS, CHARACTER_GLB, statVarianceFromWallet } from '@/lib/classes'
import type { CharacterClass } from '@/lib/classes'
import CharacterViewer from '@/components/warrior/CharacterViewer'
import { ConnectButton } from '@/components/ui/ConnectButton'

type Step = 'covenant' | 'telegram' | 'select' | 'confirm' | 'tutorial'

const PREFIXES = ['Drifter','Dark','Storm','Ash','Void','Flame','Shadow','Stalker','Crimson','Frost','Thunder','Ember','Blood','Death','War']
const SUFFIXES = ['Blade','Fist','Heart','Walker','Strike','Guard','Born','Wolf','Hawk','Bane','Forge','Rift','Claw','Rage','Fire']

function deterministicName(wallet: string) {
  const seed = wallet.replace('0x', '').slice(0, 8)
  const hash = seed.split('').reduce((acc, ch) => ((acc * 31 + ch.charCodeAt(0)) >>> 0), 7)
  return `${PREFIXES[hash % PREFIXES.length]}${SUFFIXES[(hash >>> 4) % SUFFIXES.length]}`
}

export default function OnboardingPage() {
  const { status, address, magicEmail, magicIssuer } = useResolvedAuth()
  const router          = useRouter()
  const setPlayer    = usePlayerStore(s => s.setPlayer)
  const player       = usePlayerStore(s => s.player)
  const playerSynced = usePlayerStore(s => s.playerSynced)

  const [step,           setStep]           = useState<Step>('covenant')
  const [createdPlayer,  setCreatedPlayer]  = useState<null | Parameters<typeof TutorialArena>[0]['player']>(null)
  const [selectedClass, setSelectedClass] = useState<CharacterClass>('Berserker')
  const [nameInput,     setNameInput]     = useState('')
  const [username,      setUsername]      = useState('')
  const [pending,       setPending]       = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  // Referral attribution. Layers 1-3 (URL, server cookie, localStorage) run in
  // getReferrer(); this field is layer 4 — the one that recovers a click on a
  // phone followed by a signup on a laptop, which no storage can bridge.
  const [referrer,      setReferrer]      = useState<string>('')
  const [referrerName,  setReferrerName]  = useState<string | null>(null)
  const [inviterInput,  setInviterInput]  = useState('')
  const [lookingUp,     setLookingUp]     = useState(false)

  // A player rebuilt from chain after the migration hasn't CONFIRMED their class
  // yet (it may be wrong). They're already a recognized user, so skip verify and
  // drop them straight onto the confirm screen, pre-filled with what we recovered.
  const confirming = !!player && player.character_confirmed === false
  // Pick up whatever attribution survived, and put a NAME to it so the new
  // player can see who they are crediting rather than a hex string.
  useEffect(() => {
    const found = getReferrer()
    if (!found) return
    setReferrer(found)
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/players/${found}`)
      .then(r => (r.ok ? r.json() : null))
      .then(p => { if (p) setReferrerName(p.username || p.character_name) })
      .catch(() => {})
  }, [])

  /** Resolve a typed name to a wallet — the fallback when nothing survived. */
  async function lookupInviter(q: string) {
    const name = q.trim()
    if (!name) return
    setLookingUp(true)
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/players/search?q=${encodeURIComponent(name)}&exclude=${address}`,
      )
      const rows = res.ok ? await res.json() : []
      if (rows.length) {
        setReferrer(rows[0].wallet_address)
        setReferrerName(rows[0].username || rows[0].character_name)
      } else {
        setReferrerName(null)
      }
    } catch { /* leave it unset — a missing referral is not worth blocking on */ }
    finally { setLookingUp(false) }
  }

  useEffect(() => {
    if (confirming && player) {
      setSelectedClass((player.character_class as CharacterClass) || 'Berserker')
      setNameInput(player.character_name || '')
      setUsername(player.username || '')
      setStep('confirm')
    }
  }, [confirming, player])

  // Auth session still resolving — wait rather than flashing the sign-in screen.
  if (status === 'loading') return <LoadingScreen />

  // Player sync in progress — wait; don't flash the first onboarding screen.
  if (address && !playerSynced) return <LoadingScreen />

  // Returning CONFIRMED user → home. An unconfirmed (reconstructed) player STAYS
  // here to run the confirm-your-class flow above.
  if (player && !confirming) { router.replace('/'); return null }

  if (status === 'unauthenticated' || !address) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 px-6 text-center" style={{ background: '#04030c' }}>
        <p className="font-display font-black text-white text-2xl">Sign In to Play</p>
        <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
          Connect your wallet to enter StillHunt and forge your warrior.
        </p>
        <ConnectButton />
      </div>
    )
  }

  // ── Step: COVENANT — permanent identity intro (auto-advance to 'telegram') ────
  if (step === 'covenant') {
    return <CovenantIntro onComplete={() => setStep('telegram')} />
  }

  // ── Step: TELEGRAM — join the community ───────────────────────────────────────
  // Placed here, between the covenant and class select, rather than immediately
  // before the claim: picking a class and naming it flows straight into forging,
  // and interrupting that with an ask would land at the worst moment. Here it
  // still reads as part of setup.
  if (step === 'telegram') {
    return <JoinTelegram onContinue={() => setStep('select')} />
  }

  // ── Step: SELECT ──────────────────────────────────────────────────────────────

  if (step === 'select') {
    return (
      <CharacterSelectScreen
        onSelect={(cls) => {
          setSelectedClass(cls)
          setNameInput(deterministicName(address))
          setStep('confirm')
        }}
      />
    )
  }

  // ── Step: CONFIRM ─────────────────────────────────────────────────────────────

  if (step === 'confirm') {
    const def           = CLASS_DEFINITIONS[selectedClass]
    const variance      = statVarianceFromWallet(address)
    const characterName = nameInput || deterministicName(address)
    const stats         = {
      attack:  def.stats.attack  + variance,
      defense: def.stats.defense + variance,
      speed:   def.stats.speed   + variance,
    }

    async function handleCreate() {
      if (!address) return
      setPending(true); setError(null)
      const API = process.env.NEXT_PUBLIC_API_URL
      const uname = username.trim() ? username.trim() : null

      // ── Reconstructed player confirming: PATCH class/name/username + mark done ──
      if (confirming) {
        const res = await fetch(`${API}/players/${address.toLowerCase()}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            character_class:     selectedClass,
            character_name:      characterName,
            username:            uname,
            character_confirmed: true,
          }),
        })
        if (res.status === 409) { setError('That username is already taken.'); setPending(false); return }
        if (!res.ok) { setError('Could not save. Please try again.'); setPending(false); return }
        setPlayer(await res.json())
        router.replace('/')          // returning user → straight to their dashboard
        return
      }

      // ── Brand-new player: create the row ──
      const now = new Date().toISOString()
      const newPlayer = {
        wallet_address:          address,
        play_style:              'Fighter' as const,
        avatar:                  '',
        character_name:          characterName,
        username:                uname,
        display_name:            null,
        character_class:         selectedClass,
        character_customization: {},
        rank:                    'Tracker' as const,
        xp:                      0,
        attack_stat:             stats.attack,
        defense_stat:            stats.defense,
        speed_stat:              stats.speed,
        g_earned_lifetime:       0,
        last_active:             now,
        decay_status:            'none' as const,
        decay_frozen_until:      null,
        wins:                    0,
        losses:                  0,
        magic_email:             magicEmail ?? null,
        magic_issuer:            magicIssuer ?? null,
        // Best-effort attribution. The server re-validates it and pays at most
        // once per new player, so a wrong or stale value costs nothing.
        referred_by:             referrer || null,
      }
      const res = await fetch(`${API}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPlayer),
      })
      if (res.status === 409) { setError('That username is already taken.'); setPending(false); return }
      if (!res.ok) {
        setError('Failed to create player. Please try again.'); setPending(false); return
      }
      // Attribution is spent — a second character on this device must not credit
      // the same referrer again.
      clearReferrer()
      const created = await res.json()
      setPlayer(created)
      setCreatedPlayer(created)
      setStep('tutorial')
    }

    return (
      <div className="fixed inset-0 z-60 overflow-hidden" style={{ background: '#04030c' }}>

        {/* Atmosphere */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2" style={{
            width: '90%', height: '60%',
            background: `radial-gradient(ellipse at 50% 100%, ${def.accentColor}22 0%, transparent 65%)`,
          }} />
          <div className="absolute inset-x-0 top-0" style={{
            height: '30%',
            background: 'linear-gradient(180deg, rgba(4,3,12,0.9) 0%, transparent 100%)',
          }} />
          <div className="absolute inset-x-0 bottom-0" style={{
            height: '48%',
            background: 'linear-gradient(0deg, rgba(4,3,12,0.99) 0%, rgba(4,3,12,0.85) 55%, transparent 100%)',
          }} />
        </div>

        {/* Back button */}
        <button
          onClick={() => setStep('select')}
          className="absolute top-5 left-5 z-20 flex items-center gap-2 text-slate-500 hover:text-white transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[10px] font-bold uppercase tracking-widest">Change Class</span>
        </button>

        {/* 3D character fills the screen */}
        <CharacterViewer
          glbPath={CHARACTER_GLB[selectedClass]}
          accentColor={def.accentColor}
          animationName="idle"
          modelKey={`confirm-${selectedClass}`}
          className="absolute inset-0"
        />

        {/* Bottom panel */}
        <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col px-5 gap-4"
          style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom, 32px))' }}>

          {/* Name + class */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            <input
              type="text"
              value={nameInput}
              onChange={e => setNameInput(e.target.value.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 24))}
              placeholder={deterministicName(address)}
              className="w-full bg-transparent border-b-2 font-display font-black leading-none focus:outline-none placeholder:opacity-30"
              style={{
                fontSize: 'clamp(2.2rem, 7vw, 3.5rem)',
                color: def.accentColor,
                textShadow: `0 0 32px ${def.accentColor}60`,
                borderColor: `${def.accentColor}40`,
                caretColor: def.accentColor,
              }}
            />
            <p className="font-display font-bold uppercase mt-1" style={{
              fontSize: '10px', letterSpacing: '0.28em', color: 'rgba(255,255,255,0.35)',
            }}>
              {def.name} · {def.tagline}
            </p>
            <p className="font-display font-bold uppercase mt-2" style={{
              fontSize: '8px', letterSpacing: '0.28em', color: 'rgba(255,255,255,0.18)',
            }}>
              ⬡ Warrior name · tap to edit
            </p>

            {/* Username — your unique @handle (optional; must be free) */}
            <div className="mt-3 flex items-center gap-2">
              <span className="font-display font-black text-lg" style={{ color: `${def.accentColor}99` }}>@</span>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20))}
                placeholder="username (optional)"
                className="flex-1 bg-transparent border-b font-display font-bold text-lg leading-none focus:outline-none placeholder:opacity-25 text-white"
                style={{ borderColor: 'rgba(255,255,255,0.15)', caretColor: def.accentColor }}
              />
            </div>

            {/* Who invited you. Pre-filled when attribution survived, typed when
                it did not — the only route that recovers a link opened on one
                device and acted on days later somewhere else. */}
            <div className="mt-4">
              {referrer && referrerName ? (
                <p className="text-xs text-slate-400">
                  Invited by <span className="font-bold text-white">{referrerName}</span>
                  {' '}·{' '}
                  <button
                    type="button"
                    onClick={() => { setReferrer(''); setReferrerName(null) }}
                    className="underline underline-offset-2 hover:text-white transition-colors"
                  >
                    not them?
                  </button>
                </p>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={inviterInput}
                    onChange={e => setInviterInput(e.target.value)}
                    onBlur={() => void lookupInviter(inviterInput)}
                    placeholder="who invited you? (optional)"
                    className="flex-1 bg-transparent border-b text-sm leading-none py-1 focus:outline-none placeholder:opacity-25 text-white"
                    style={{ borderColor: 'rgba(255,255,255,0.15)' }}
                  />
                  {lookingUp && <span className="text-[10px] text-slate-500">checking…</span>}
                </div>
              )}
            </div>
          </motion.div>

          {/* Stats row */}
          <motion.div
            className="flex gap-2"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.08 }}
          >
            {[
              { l: 'ATK', v: stats.attack,  c: '#ef4444' },
              { l: 'DEF', v: stats.defense, c: '#3b82f6' },
              { l: 'SPD', v: stats.speed,   c: '#22c55e' },
            ].map(({ l, v, c }) => (
              <div
                key={l}
                className="flex-1 rounded-xl px-3 py-2.5 border flex flex-col items-center gap-0.5"
                style={{ background: 'rgba(255,255,255,0.03)', borderColor: `${c}22` }}
              >
                <span className="font-black text-white text-xl leading-none">{v}</span>
                <span className="font-bold uppercase text-[9px] tracking-widest" style={{ color: c }}>{l}</span>
              </div>
            ))}
          </motion.div>

          {/* Special ability teaser */}
          <motion.div
            className="rounded-xl px-4 py-2.5 border"
            style={{ background: def.accentColorDim, borderColor: `${def.accentColor}25` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.14 }}
          >
            <p style={{ fontSize: '8px', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)' }}
              className="uppercase font-bold mb-0.5">
              Special Ability
            </p>
            <p className="font-display font-black text-sm" style={{ color: def.accentColor }}>
              {def.special}
            </p>
            <p className="text-slate-500 text-xs mt-0.5">{def.specialDesc}</p>
          </motion.div>

          {error && (
            <p className="text-red-400 text-xs text-center">{error}</p>
          )}

          {/* CTA */}
          <motion.button
            onClick={handleCreate}
            disabled={pending}
            whileHover={{ scale: 1.02, filter: 'brightness(1.12)' }}
            whileTap={{ scale: 0.97 }}
            className="relative overflow-hidden font-display font-black uppercase w-full disabled:opacity-50 mb-2"
            style={{
              fontSize: 'clamp(13px, 2.6vw, 16px)',
              letterSpacing: '0.24em',
              color: '#080610',
              padding: 'clamp(16px, 3vw, 20px) 0',
              background: `linear-gradient(135deg, ${def.accentColor}ee, ${def.accentColor})`,
              clipPath: 'polygon(12px 0%, 100% 0%, calc(100% - 12px) 100%, 0% 100%)',
              boxShadow: `0 0 36px ${def.accentColor}55, 0 6px 24px rgba(0,0,0,0.9)`,
            }}
          >
            {/* Shimmer */}
            <motion.div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'linear-gradient(108deg, transparent 28%, rgba(255,255,255,0.25) 50%, transparent 72%)' }}
              animate={{ x: ['-140%', '220%'] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'linear', repeatDelay: 2.5 }}
            />
            {pending
              ? (confirming ? 'Saving...' : 'Forging Your Legacy...')
              : (confirming ? 'Confirm Character' : 'Forge Your Legacy')}
          </motion.button>
        </div>
      </div>
    )
  }

  // ── Step: TUTORIAL ───────────────────────────────────────────────────────────
  if (step === 'tutorial' && createdPlayer) {
    return (
      <TutorialArena
        player={createdPlayer}
        onComplete={() => router.replace('/')}
      />
    )
  }

  return null
}

// ── Join Telegram ─────────────────────────────────────────────────────────────
//
// Deliberately UNVERIFIED. We never ask Telegram whether they joined and we
// store nothing: "I've joined" is the whole gate, and it is tappable from the
// first frame.
//
// That is not laziness, it is the only workable design. Plenty of people are in
// the group before they ever open the site, and plenty do not have Telegram
// installed at all — gating the button on a click-through would strand both, at
// the one point in onboarding where dropping out costs us the player entirely.
// The ask is worth making; blocking on it is not.

function JoinTelegram({ onContinue }: { onContinue: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-70 flex flex-col items-center justify-center px-6"
      style={{ background: '#04030c' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 45%, rgba(42,171,238,0.10), transparent)' }}
      />

      <motion.div
        className="relative z-10 w-full max-w-sm flex flex-col items-center text-center gap-5"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
      >
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(42,171,238,0.12)', border: '1px solid rgba(42,171,238,0.35)' }}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="#2AABEE" aria-hidden>
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
          </svg>
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="font-display font-black text-white text-2xl tracking-wide">Join the Telegram</h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            Season news, payout updates and the people you&apos;ll be fighting. It&apos;s where
            everything about StillHunt gets announced first.
          </p>
        </div>

        <a
          href={TELEGRAM_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="w-full py-3.5 rounded-xl font-black text-sm text-center transition-transform active:scale-[0.98]"
          style={{ background: '#2AABEE', color: '#04030c' }}
        >
          Open Telegram
        </a>

        <button
          onClick={onContinue}
          className="w-full py-3 rounded-xl font-bold text-sm border text-slate-300 hover:text-white transition-colors"
          style={{ borderColor: 'rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.03)' }}
        >
          I&apos;ve joined
        </button>

        <p className="text-[11px] text-slate-600">
          Already in the group, or no Telegram? Carry on — nothing here is checked.
        </p>
      </motion.div>
    </motion.div>
  )
}

// ── Covenant intro — "One human. One warrior." ────────────────────────────────

const LINES = [
  { text: 'ONE HUMAN',   delay: 0    },
  { text: 'ONE WARRIOR', delay: 0.45 },
]

function CovenantIntro({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('hold'), 1200)
    const t2 = setTimeout(() => setPhase('out'),  2200)
    const t3 = setTimeout(onComplete,             2900)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [onComplete])

  return (
    <motion.div
      className="fixed inset-0 z-70 flex flex-col items-center justify-center gap-3"
      style={{ background: '#04030c' }}
      animate={phase === 'out' ? { opacity: 0 } : { opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      {/* Background bloom */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(234,179,8,0.12), transparent)' }}
        animate={phase === 'hold' ? { opacity: [0.6, 1, 0.6] } : { opacity: 0.6 }}
        transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
      />

      {LINES.map(({ text, delay }) => (
        <motion.p
          key={text}
          className="font-display font-black text-center"
          style={{
            fontSize: 'clamp(1.4rem, 5vw, 2.6rem)',
            letterSpacing: '0.18em',
            color: text === 'FOREVER' ? '#eab308' : 'rgba(255,255,255,0.85)',
            textShadow: text === 'FOREVER' ? '0 0 40px rgba(234,179,8,0.5)' : undefined,
          }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          {text}
        </motion.p>
      ))}

      {/* Horizontal rule */}
      <motion.div
        className="h-px w-32 mt-2"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(234,179,8,0.6), transparent)' }}
        initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
        transition={{ delay: 1.0, duration: 0.5 }}
      />
    </motion.div>
  )
}
