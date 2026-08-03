'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence, useAnimation } from 'framer-motion'
import { Sword, Shield, Zap, Users, ChevronLeft, Smartphone, Crosshair, Target } from 'lucide-react'
import type { Player, BattleMove } from '@/types'
import { useBattle } from '@/hooks/useBattle'
import { tryFullscreen } from '@/lib/fullscreen'
import { useCombatFeel } from '@/hooks/useCombatFeel'
import { useAudio } from '@/hooks/useAudio'
import BattlePvP from './BattlePvP'
import ChallengeBattle from './ChallengeBattle'
import CampaignSelect from './CampaignSelect'
import BattleScene from './BattleScene'
import ImpactBurst from './ImpactBurst'
import HitSpark from './HitSpark'
import DamageNumber from './DamageNumber'
import XpMeter from '@/components/player-card/XpMeter'
import CharacterViewer from '@/components/warrior/CharacterViewer'
import { CLASS_DEFINITIONS, CHARACTER_GLB } from '@/lib/classes'
import type { CharacterClass } from '@/lib/classes'
import { RANK_DEFINITIONS } from '@/lib/ranks'
import RankAura from '@/components/ui/RankAura'
import { xpForNextRank } from '@/lib/constants'
import { formatGDollarNumber } from '@/utils/format'

interface Props { player: Player; walletAddress: string; challengeTarget?: string }

const MOVES: { id: BattleMove; label: string; desc: string; Icon: typeof Sword; color: string }[] = [
  { id: 'attack',  label: 'Attack',  desc: 'Strike opponent',        Icon: Sword,  color: '#ef4444' },
  { id: 'defend',  label: 'Defend',  desc: 'Halve incoming damage',  Icon: Shield, color: '#3b82f6' },
  { id: 'special', label: 'Special', desc: 'Max power — once only',  Icon: Zap,    color: '#8b5cf6' },
]

// playerDealt = damage you dealt to bot; botDealt = damage bot dealt to you
function roundNarrative(
  playerMove: BattleMove,
  botMove: BattleMove,
  playerDealt: number,
  botDealt: number,
): { you: string; bot: string } {
  let you: string
  if (playerMove === 'defend') {
    you = botDealt === 0 ? 'DEFENDED — full block!' : `DEFENDED — took ${botDealt} (halved incoming)`
  } else {
    const v = playerMove === 'special' ? 'SPECIAL' : 'ATTACKED'
    if (playerDealt === 0)       you = `${v} — bot blocked!`
    else if (botMove === 'defend') you = `${v} — ${playerDealt} dmg (bot defended, halved)`
    else                           you = `${v} — dealt ${playerDealt} dmg`
  }

  let bot: string
  if (botMove === 'defend') {
    bot = playerDealt === 0 ? 'DEFENDED — blocked your hit!' : `DEFENDED — took ${playerDealt} (halved)`
  } else {
    const v = botMove === 'special' ? 'SPECIAL' : 'ATTACKED'
    if (botDealt === 0)              bot = `${v} — you blocked!`
    else if (playerMove === 'defend') bot = `${v} — ${botDealt} to you (halved by defend)`
    else                               bot = `${v} — ${botDealt} to you`
  }

  return { you, bot }
}


export default function BattleArena({ player, walletAddress, challengeTarget }: Props) {
  const router = useRouter()
  const [showChallenge,       setShowChallenge]       = useState(false)
  const [showDirectChallenge, setShowDirectChallenge] = useState(!!challengeTarget)
  const [showCampaign,        setShowCampaign]        = useState(false)
  const def = CLASS_DEFINITIONS[player.character_class as CharacterClass] ?? CLASS_DEFINITIONS.Berserker

  const { phase, playerHp, botHp, round, log, specialUsed, result, saveError, botClass, starting, submitting,
    handleMove, reset,
    attackBoost, defenseBoost, hasXpBooster, effectiveAttack, effectiveDefense } =
    useBattle(player, walletAddress)

  const botDef = CLASS_DEFINITIONS[botClass ?? 'Sentinel']

  // ── Animation state ─────────────────────────────────────────────────────
  const [playerAnim,       setPlayerAnim]       = useState('idle')
  const [botAnim,          setBotAnim]          = useState('idle')
  const [isEntering,       setIsEntering]       = useState(false)
  const [showFightCall,    setShowFightCall]    = useState(false)
  const [isRoundAnimating, setIsRoundAnimating] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  // ── Damage number events ─────────────────────────────────────────────────
  interface DmgEvent { id: number; value: number; isSpecial: boolean; side: 'player' | 'bot' }
  const [dmgEvents, setDmgEvents] = useState<DmgEvent[]>([])
  const dmgCounter = useRef(0)

  function spawnDmgNumber(value: number, side: 'player' | 'bot', isSpecial: boolean) {
    if (value <= 0) return
    const id = ++dmgCounter.current
    setDmgEvents(prev => [...prev, { id, value, isSpecial, side }])
    setTimeout(() => setDmgEvents(prev => prev.filter(e => e.id !== id)), 700)
  }

  function clearTimers() {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  // ── Preload player GLB so idle panel renders immediately ─────────────────
  useEffect(() => {
    CharacterViewer.preload(CHARACTER_GLB[player.character_class as CharacterClass])
  }, [player.character_class])

  // ── Landscape lock during battle ────────────────────────────────────────
  // requestFullscreen() must come from a user gesture (button onClick) — not here.
  // The fighting and result phases render as fixed inset-0 overlays, covering the
  // layout container, so no additional fullscreen API call is needed.
  useEffect(() => {
    if (phase !== 'fighting') return
    if (typeof screen !== 'undefined' && screen.orientation?.lock) {
      screen.orientation.lock('landscape').catch(() => {})
    }
    return () => {
      try { screen.orientation?.unlock?.() } catch {}
    }
  }, [phase])

  // ── Battle entrance ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'fighting' || round !== 1) return
    setIsEntering(true)
    setIsRoundAnimating(true)
    const t1 = setTimeout(() => setShowFightCall(true), 800)
    const t2 = setTimeout(() => { setIsEntering(false); setShowFightCall(false) }, 1450)
    const t3 = setTimeout(() => setIsRoundAnimating(false), 1450)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [phase])

  // ── Audio + combat feel ──────────────────────────────────────────────────
  const { playHit, playSpecial, playVictory, playDefeat, startAmbient, stopAmbient } = useAudio()
  const combatFeel = useCombatFeel()

  // Imperative shake/camera-punch controls — replay on every hit WITHOUT
  // remounting the persistent 3D canvas (a `key`-based remount destroys and
  // recreates the WebGL context, causing a black flash on every round).
  const shakeControls = useAnimation()
  const camControls = useAnimation()

  useEffect(() => {
    if (combatFeel.shakeLevel === 0) return
    const x = combatFeel.shakeLevel >= 3 ? [-12, 11, -8, 8, -4, 4, 0]
      : combatFeel.shakeLevel >= 2 ? [-6, 6, -4, 4, 0]
      : [-3, 3, -2, 2, 0]
    const rotate = combatFeel.shakeLevel >= 3 ? [-0.7, 0.6, -0.5, 0.4, -0.2, 0.2, 0] : 0
    shakeControls.start({ x, rotate, transition: { duration: combatFeel.shakeLevel >= 3 ? 0.26 : 0.18, ease: 'easeOut' } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combatFeel.shakeKey])

  useEffect(() => {
    if (combatFeel.specialCam === 0) return
    camControls.start({ scale: [1, 1.055, 1.02, 1], transition: { duration: 0.5, ease: 'easeInOut' } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combatFeel.specialCam])

  // Drive animations + combat feel from round log
  const prevLogLen = useRef(0)
  useEffect(() => {
    if (log.length <= prevLogLen.current) return
    prevLogLen.current = log.length
    const entry = log[log.length - 1]
    clearTimers()

    if (entry.playerHp <= 0) { setPlayerAnim('death'); return }
    if (entry.botHp <= 0)    { setBotAnim('death');    return }

    const playerAction = entry.playerMove === 'attack' || entry.playerMove === 'special' ? 'attack' : 'idle'
    setPlayerAnim(playerAction)

    setIsRoundAnimating(true)

    const t1 = setTimeout(() => {
      setBotAnim(entry.playerDmg > 0 ? 'hit' : 'idle')
      if (entry.playerDmg > 0) {
        combatFeel.triggerHit('bot', entry.playerDmg, def.accentColor, entry.playerMove === 'special')
        spawnDmgNumber(entry.playerDmg, 'bot', entry.playerMove === 'special')
        playHit(player.character_class as string, entry.playerDmg)
        if (entry.playerMove === 'special') playSpecial(player.character_class as string)
      }
    }, 280) // pulled from 320ms — hits when lunge peaks

    const t2 = setTimeout(() => {
      setBotAnim(entry.botMove === 'attack' || entry.botMove === 'special' ? 'attack' : 'idle')
    }, 680)

    const t3 = setTimeout(() => {
      setPlayerAnim(entry.botDmg > 0 ? 'hit' : 'idle')
      if (entry.botDmg > 0) {
        combatFeel.triggerHit('player', entry.botDmg, botDef.accentColor, entry.botMove === 'special')
        spawnDmgNumber(entry.botDmg, 'player', entry.botMove === 'special')
        playHit(botDef.id, entry.botDmg)
        if (entry.botMove === 'special') playSpecial(botDef.id)
      }
    }, 920)

    const t4 = setTimeout(() => {
      setPlayerAnim('idle')
      setBotAnim('idle')
      setIsRoundAnimating(false)
    }, 1400)
    timers.current = [t1, t2, t3, t4]
  }, [log])

  useEffect(() => {
    if (phase === 'fighting') startAmbient()
    if (phase === 'idle' || phase === 'result') stopAmbient()
    if (phase === 'idle') {
      clearTimers()
      prevLogLen.current = 0
      setPlayerAnim('idle')
      setBotAnim('idle')
      setIsEntering(false)
      setShowFightCall(false)
      setIsRoundAnimating(false)
      setDmgEvents([])
      combatFeel.reset()
    }
  }, [phase])

  // ── Victory / defeat audio — MUST stay above all conditional returns ──────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (phase !== 'result' || !result) return
    if (result.won) playVictory()
    else playDefeat()
  }, [phase, result?.won])

  // ── LIVE PVP ────────────────────────────────────────────────────────────
  if (phase === 'idle' && showCampaign) {
    return <CampaignSelect player={player} onBack={() => setShowCampaign(false)} />
  }

  if (phase === 'idle' && showChallenge) {
    return <BattlePvP player={player} walletAddress={walletAddress} onBack={() => setShowChallenge(false)} />
  }

  // ── DIRECT CHALLENGE ─────────────────────────────────────────────────────
  if (phase === 'idle' && showDirectChallenge) {
    return <ChallengeBattle walletAddress={walletAddress} onBack={() => setShowDirectChallenge(false)} prefillOpponent={challengeTarget} />
  }

  // ── IDLE — choose fight type ─────────────────────────────────────────────
  if (phase === 'idle') {
    return (
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 items-stretch min-h-[calc(100vh-10rem)] lg:min-h-[calc(100vh-8rem)]">
        <motion.div
          className="relative lg:w-72 rounded-2xl overflow-hidden shrink-0"
          style={{ minHeight: 'clamp(200px, 35vh, 360px)', background: '#06050f' }}
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <RankAura rank={player.rank} classColor={def.accentColor} mode="character">
          <div className="absolute inset-0" style={{
            background: `radial-gradient(ellipse 70% 90% at 50% 60%, ${def.accentColor}18, transparent)`,
          }} />
          <CharacterViewer
            glbPath={CHARACTER_GLB[player.character_class as CharacterClass]}
            accentColor={def.accentColor}
            animationName="idle"
            modelKey={`idle-panel-${player.character_class}`}
            className="absolute inset-0"
          />
          </RankAura>
          <div className="absolute inset-x-0 bottom-0 h-28" style={{
            background: 'linear-gradient(0deg, rgba(4,3,12,0.98) 0%, transparent 100%)',
          }} />
          <div className="absolute inset-x-0 bottom-0 p-4 z-10">
            <p className="font-display font-black text-white text-lg">{player.character_name}</p>
            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-sm"
              style={{ background: def.accentColorDim, color: def.accentColor }}>
              {player.character_class}
            </span>
            <div className="flex gap-1.5 mt-2 flex-wrap">
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                <Sword size={10} />{attackBoost > 0 ? `${effectiveAttack} (+${attackBoost})` : `${effectiveAttack}`}
              </span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>
                <Shield size={10} />{defenseBoost > 0 ? `${effectiveDefense} (+${defenseBoost})` : `${effectiveDefense}`}
              </span>
              {hasXpBooster && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>
                  2× XP
                </span>
              )}
            </div>
          </div>
        </motion.div>

        <div className="flex-1 flex flex-col gap-4 justify-center">
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <p className="text-[10px] uppercase tracking-[0.3em] font-bold mb-1" style={{ color: def.accentColor }}>
              Battle Arena
            </p>
            <h1 className="font-display font-black text-white text-3xl tracking-wide">Choose Your Fight</h1>
            <p className="text-slate-500 text-sm mt-1">Win = +100 XP · Loss = +30 XP · Every fight counts.</p>
          </motion.div>

          <motion.button onClick={() => setShowCampaign(true)}
            disabled={starting}
            className="group relative overflow-hidden p-6 rounded-2xl border text-left transition-all disabled:opacity-60 disabled:pointer-events-none"
            style={{ background: 'rgba(8,8,14,0.9)', borderColor: 'rgba(42,42,58,0.8)' }}
            whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: 'radial-gradient(ellipse 80% 80% at 20% 50%, rgba(239,68,68,0.08), transparent)' }} />
            <div className="absolute inset-y-0 left-0 w-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: '#ef4444' }} />
            <div className="flex items-center gap-5 relative z-10">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
                <Target size={28} style={{ color: '#ef4444' }} strokeWidth={1.5} />
              </div>
              <div>
                <p className="font-display font-black text-white text-xl group-hover:text-amber-400 transition-colors">Campaign</p>
                <p className="text-slate-500 text-sm mt-0.5">
                  15 levels · beat each to unlock the next · earn XP toward your rank
                </p>
              </div>
              <ChevronLeft size={16} className="ml-auto rotate-180 text-slate-700 group-hover:text-white transition-colors" />
            </div>
          </motion.button>

          {saveError && phase === 'idle' && (
            <p className="text-red-400 text-xs text-center -mt-2">{saveError}</p>
          )}

          <motion.button onClick={() => {
              tryFullscreen()
              setShowChallenge(true)
            }}
            className="group relative overflow-hidden p-6 rounded-2xl border text-left transition-all"
            style={{ background: 'rgba(8,8,14,0.9)', borderColor: 'rgba(42,42,58,0.8)' }}
            whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: 'radial-gradient(ellipse 80% 80% at 20% 50%, rgba(59,130,246,0.08), transparent)' }} />
            <div className="absolute inset-y-0 left-0 w-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: '#3b82f6' }} />
            <div className="flex items-center gap-5 relative z-10">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)' }}>
                <Users size={28} style={{ color: '#3b82f6' }} strokeWidth={1.5} />
              </div>
              <div>
                <p className="font-display font-black text-white text-xl group-hover:text-amber-400 transition-colors">Live PvP</p>
                <p className="text-slate-500 text-sm mt-0.5">Real-time · Fight a live player · Winner takes XP</p>
              </div>
              <ChevronLeft size={16} className="ml-auto rotate-180 text-slate-700 group-hover:text-white transition-colors" />
            </div>
          </motion.button>

          <motion.button onClick={() => {
              tryFullscreen()
              setShowDirectChallenge(true)
            }}
            className="group relative overflow-hidden p-6 rounded-2xl border text-left transition-all"
            style={{ background: 'rgba(8,8,14,0.9)', borderColor: 'rgba(42,42,58,0.8)' }}
            whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: 'radial-gradient(ellipse 80% 80% at 20% 50%, rgba(234,179,8,0.07), transparent)' }} />
            <div className="absolute inset-y-0 left-0 w-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: '#eab308' }} />
            <div className="flex items-center gap-5 relative z-10">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)' }}>
                <Crosshair size={28} style={{ color: '#eab308' }} strokeWidth={1.5} />
              </div>
              <div>
                <p className="font-display font-black text-white text-xl group-hover:text-amber-400 transition-colors">Challenge a Player</p>
                <p className="text-slate-500 text-sm mt-0.5">Search by name · Async duel · Share invite link</p>
              </div>
              <ChevronLeft size={16} className="ml-auto rotate-180 text-slate-700 group-hover:text-white transition-colors" />
            </div>
          </motion.button>
        </div>
      </div>
    )
  }

  // ── RESULT ──────────────────────────────────────────────────────────────

  if (phase === 'result' && result) {
    const resultColor = result.won ? '#eab308' : '#ef4444'
    return (
      <motion.div className="fixed inset-0 z-50 overflow-y-auto"
        style={{ background: '#04030c' }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}
      >
        {/* Background atmosphere — fixed behind scroll */}
        <div className="fixed inset-0 pointer-events-none">
          <div style={{
            background: result.won
              ? `radial-gradient(ellipse 90% 60% at 50% 30%, rgba(234,179,8,0.12), transparent),
                 radial-gradient(ellipse 110% 60% at 50% 110%, rgba(60,10,80,0.6), transparent)`
              : `radial-gradient(ellipse 90% 60% at 50% 30%, rgba(239,68,68,0.08), transparent),
                 radial-gradient(ellipse 110% 60% at 50% 110%, rgba(60,10,80,0.6), transparent)`,
          }} className="absolute inset-0" />
        </div>

        {/* ── All content scrolls together ── */}
        <div className="relative z-10 flex flex-col items-center gap-5 px-6 pt-10"
          style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom, 32px))' }}>

          {/* Character name + result */}
          <motion.div className="text-center"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 16, delay: 0.1 }}>
            <p className="font-display font-black uppercase tracking-[0.18em] text-white"
              style={{ fontSize: 'clamp(0.9rem, 3.5vw, 1.2rem)', opacity: 0.6, marginBottom: 4 }}>
              {player.character_name}
            </p>
            <h1 className="font-display font-black leading-none"
              style={{
                fontSize: 'clamp(4rem, 16vw, 7rem)',
                color: resultColor,
                letterSpacing: '0.04em',
                textShadow: `0 0 80px ${resultColor}60, 0 0 160px ${resultColor}30`,
              }}>
              {result.won ? 'WINS!' : 'FALLS'}
            </h1>
            <motion.p className="font-black mt-3" style={{ fontSize: 'clamp(1.3rem, 5vw, 1.8rem)', color: resultColor }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}>
              +{result.xpAwarded} XP
            </motion.p>
          </motion.div>

          {/* XP progress */}
          <motion.div className="w-full max-w-xs"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
            <XpMeter xp={result.newXp} max={xpForNextRank(result.newRank ?? player.rank)} rank={result.newRank ?? player.rank} />
          </motion.div>

          {/* Rank up banner */}
          {result.rankedUp && result.newRank && (
            <motion.div className="w-full max-w-xs rounded-2xl p-4 text-center"
              style={{
                background: `${RANK_DEFINITIONS[result.newRank]?.badgeBg ?? 'rgba(234,179,8,0.08)'}`,
                border: `1px solid ${RANK_DEFINITIONS[result.newRank]?.color ?? '#eab308'}50`,
                boxShadow: RANK_DEFINITIONS[result.newRank]?.glow,
              }}
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.55, type: 'spring', stiffness: 200, damping: 14 }}>
              <RankAura rank={result.newRank} mode="badge">
                <p className="font-display font-black text-lg"
                  style={{ color: RANK_DEFINITIONS[result.newRank]?.color ?? '#eab308' }}>
                  ✦ RANK UP → {result.newRank}
                </p>
              </RankAura>
              <p className="text-slate-400 text-xs mt-1">{formatGDollarNumber(result.gAwarded)} G$ earned</p>
            </motion.div>
          )}


          {/* Round breakdown (compact, scrollable) */}
          <motion.div className="w-full max-w-xs rounded-xl border overflow-hidden"
            style={{ background: 'rgba(4,3,12,0.9)', borderColor: 'rgba(42,42,58,0.7)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
            <div className="px-2 py-1.5">
              <p className="text-[8px] font-black uppercase tracking-[0.25em] text-slate-600 mb-1.5 px-1">Round Breakdown</p>
            </div>
            <div className="max-h-36 overflow-y-auto px-2 pb-2 flex flex-col gap-2">
              {result.rounds.map(r => {
                const { you, bot } = roundNarrative(r.playerMove, r.botMove, r.playerDmg, r.botDmg)
                const rd = CLASS_DEFINITIONS[player.character_class as CharacterClass]
                const bd = botDef
                return (
                  <div key={r.round} className="rounded-lg px-2 py-1.5" style={{ background: 'rgba(8,8,14,0.7)' }}>
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-[7px] font-black uppercase tracking-widest text-slate-600">Round {r.round}</span>
                      <span className="ml-auto text-[7px] font-bold" style={{ color: r.playerHp > r.botHp ? rd.accentColor : bd.accentColor }}>
                        {r.playerHp > r.botHp ? 'You lead' : r.playerHp < r.botHp ? 'Bot leads' : 'Tied'}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-start gap-1.5">
                        <span className="text-[7px] font-black uppercase tracking-wider shrink-0 mt-px" style={{ color: rd.accentColor }}>YOU</span>
                        <span className="text-[9px] text-slate-300 leading-tight">{you}</span>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <span className="text-[7px] font-black uppercase tracking-wider shrink-0 mt-px" style={{ color: bd.accentColor }}>BOT</span>
                        <span className="text-[9px] text-slate-300 leading-tight">{bot}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-1 pt-1" style={{ borderTop: '1px solid rgba(42,42,58,0.5)' }}>
                      <span className="text-[7px] text-slate-600">Your HP: <span className="text-white font-bold">{r.playerHp}</span></span>
                      <span className="text-[7px] text-slate-600">Bot HP: <span className="text-white font-bold">{r.botHp}</span></span>
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>

          {/* ── Fight again CTA ── */}
          <motion.button onClick={() => reset()}
            className="w-full clip-angled py-5 font-display font-black text-black uppercase tracking-[0.2em]"
            style={{
              fontSize: 'clamp(14px, 3.5vw, 18px)',
              background: 'linear-gradient(135deg, #fde047 0%, #eab308 50%, #b45309 100%)',
              boxShadow: '0 0 40px rgba(234,179,8,0.4)',
            }}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, type: 'spring', stiffness: 180, damping: 14 }}
            whileTap={{ scale: 0.97 }}>
            Fight Again
          </motion.button>

          {/* ── Return home ── */}
          <motion.button
            onClick={() => router.push('/')}
            className="w-full py-3 font-display font-black uppercase tracking-[0.2em] rounded-xl border transition-colors"
            style={{
              fontSize: 'clamp(11px, 2.5vw, 13px)',
              color: 'rgba(148,163,184,0.7)',
              borderColor: 'rgba(42,42,58,0.6)',
              background: 'transparent',
            }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            whileHover={{ color: '#fff', borderColor: 'rgba(148,163,184,0.4)' }}
            whileTap={{ scale: 0.97 }}>
            ← Return Home
          </motion.button>
        </div>
      </motion.div>
    )
  }

  // ── FIGHTING ────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 overflow-hidden" style={{ background: '#04030c' }}>

      {/* ── Portrait rotate overlay — CSS shows it only in portrait ── */}
      <div className="battle-rotate-prompt fixed inset-0 z-200 flex-col items-center justify-center gap-5"
        style={{ background: 'rgba(4,3,12,0.97)' }}>
        <motion.div
          animate={{ rotate: [0, 0, 90, 90, 0] }}
          transition={{ duration: 2, repeat: Infinity, repeatDelay: 1, ease: 'easeInOut' }}>
          <Smartphone size={56} className="text-white" />
        </motion.div>
        <div className="text-center px-6">
          <p className="font-display font-black text-white text-xl tracking-wide">Rotate Your Device</p>
          <p className="text-slate-400 text-sm mt-2">Battle Arena is designed for landscape</p>
        </div>
      </div>

      {/* ── 3D scene — fills the entire screen, controls overlay on top ── */}
      <motion.div
        animate={shakeControls}
        className="absolute inset-0"
      >
        <motion.div
          animate={camControls}
          className="absolute inset-0"
        >
          {/* Canvas */}
          <div className="absolute inset-0">
            <BattleScene
              playerClass={player.character_class as CharacterClass}
              playerAnim={playerAnim}
              playerPaused={combatFeel.hitStopMs > 0 && playerAnim === 'hit'}
              playerAccentColor={def.accentColor}
              botClass={botDef.id}
              botAnim={botAnim}
              botPaused={combatFeel.hitStopMs > 0 && botAnim === 'hit'}
              botAccentColor={botDef.accentColor}
            />
          </div>

          {/* Player DOM overlays — left half */}
          <div className="absolute left-0 top-0 bottom-0 w-1/2 pointer-events-none z-10">
            <AnimatePresence>
              {dmgEvents.filter(e => e.side === 'player').map(e => (
                <DamageNumber key={e.id} {...e} />
              ))}
            </AnimatePresence>
            {/* Edge-glow vignette — reacts from the screen edge instead of flooding it */}
            <AnimatePresence>
              {combatFeel.playerFlash && (
                <motion.div key="player-flash" className="absolute inset-0"
                  style={{ background: `radial-gradient(circle at 0% 55%, ${combatFeel.playerFlash}45, transparent 65%)` }}
                  initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0] }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }} />
              )}
            </AnimatePresence>
            {/* Impact anchor — near the player's chest, close to the center divider */}
            <div className="absolute" style={{ left: '78%', top: '40%' }}>
              <AnimatePresence>
                {combatFeel.playerSpark && (
                  <HitSpark key={`player-spark-${combatFeel.shakeKey}`} color={combatFeel.playerSpark.color} level={combatFeel.playerSpark.level} />
                )}
              </AnimatePresence>
              <AnimatePresence>
                {combatFeel.playerBurst && (
                  <ImpactBurst key={`player-burst-${combatFeel.shakeKey}`} color={combatFeel.playerBurst} size="md" />
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Bot DOM overlays — right half */}
          <div className="absolute right-0 top-0 bottom-0 w-1/2 pointer-events-none z-10">
            <AnimatePresence>
              {dmgEvents.filter(e => e.side === 'bot').map(e => (
                <DamageNumber key={e.id} {...e} />
              ))}
            </AnimatePresence>
            {/* Edge-glow vignette — reacts from the screen edge instead of flooding it */}
            <AnimatePresence>
              {combatFeel.botFlash && (
                <motion.div key="bot-flash" className="absolute inset-0"
                  style={{ background: `radial-gradient(circle at 100% 55%, ${combatFeel.botFlash}45, transparent 65%)` }}
                  initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0] }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }} />
              )}
            </AnimatePresence>
            {/* Impact anchor — near the bot's chest, close to the center divider */}
            <div className="absolute" style={{ left: '22%', top: '40%' }}>
              <AnimatePresence>
                {combatFeel.botSpark && (
                  <HitSpark key={`bot-spark-${combatFeel.shakeKey}`} color={combatFeel.botSpark.color} level={combatFeel.botSpark.level} />
                )}
              </AnimatePresence>
              <AnimatePresence>
                {combatFeel.botBurst && (
                  <ImpactBurst key={`bot-burst-${combatFeel.shakeKey}`} color={combatFeel.botBurst} size="md" />
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* VS badge */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
            <span className="font-display font-black"
              style={{ fontSize: 'clamp(1.1rem, 4vw, 1.5rem)', color: 'rgba(234,179,8,0.35)', textShadow: '0 0 24px rgba(234,179,8,0.3)' }}>
              VS
            </span>
          </div>

          {/* Battle entrance overlay */}
          <AnimatePresence>
            {isEntering && !showFightCall && (
              <motion.div key="arena-title"
                className="absolute inset-0 z-30 flex flex-col items-center justify-center pointer-events-none gap-3"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}>
                <motion.p className="font-display font-bold uppercase"
                  style={{ fontSize: '9px', letterSpacing: '0.5em', color: 'rgba(234,179,8,0.55)' }}
                  initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15, duration: 0.35 }}>
                  StillHunt Arena
                </motion.p>
                <div className="flex items-center gap-4">
                  <motion.span className="font-display font-black"
                    style={{ fontSize: 'clamp(1.1rem, 4.5vw, 1.8rem)', letterSpacing: '0.06em', color: def.accentColor }}
                    initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.25, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
                    {player.character_name}
                  </motion.span>
                  <span className="font-display font-black text-slate-600"
                    style={{ fontSize: 'clamp(1rem, 3.5vw, 1.5rem)' }}>VS</span>
                  <motion.span className="font-display font-black"
                    style={{ fontSize: 'clamp(1.1rem, 4.5vw, 1.8rem)', letterSpacing: '0.06em', color: botDef.accentColor }}
                    initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.25, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
                    Bot Warrior
                  </motion.span>
                </div>
              </motion.div>
            )}
            {showFightCall && (
              <motion.div key="fight-call"
                className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none"
                initial={{ scale: 1.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
                <h2 className="font-display font-black tracking-widest"
                  style={{
                    fontSize: 'clamp(3.5rem, 12vw, 6rem)',
                    color: def.accentColor,
                    textShadow: `0 0 60px ${def.accentColor}, 0 0 100px ${def.accentColor}60`,
                  }}>
                  FIGHT
                </h2>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>

      {/* ── HUD overlay — floats over the 3D scene at the top ── */}
      {(() => {
        const lastEntry = log.length > 0 ? log[log.length - 1] : null
        return (
          <div className="battle-hud absolute inset-x-0 top-0 z-30 flex justify-between items-start px-3"
            style={{
              paddingTop: 'max(14px, env(safe-area-inset-top, 14px))',
              background: 'linear-gradient(180deg, rgba(4,3,12,0.82) 0%, rgba(4,3,12,0.5) 70%, transparent 100%)',
            }}>
            <ArenaPlayerCard name={player.character_name} hp={playerHp}
              classLabel={player.character_class as string} color={def.accentColor} side="left"
              lastMove={lastEntry?.playerMove ?? null}
              lastDmgDealt={lastEntry?.playerDmg ?? 0}
              opponentDefended={lastEntry?.botMove === 'defend'} />

            {/* Round counter */}
            <div className="flex flex-col items-center pt-1 gap-1">
              <motion.span key={round} className="font-display font-black text-white leading-none"
                style={{ fontSize: 'clamp(1.1rem, 4vw, 1.4rem)' }}
                initial={{ scale: 1.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}>
                {round}<span className="text-slate-500 font-normal text-xs ml-0.5">/ 5</span>
              </motion.span>
              <span className="text-[8px] font-bold uppercase tracking-[0.25em] text-slate-600">Round</span>
              <div className="flex gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: i < round - 1 ? def.accentColor : i === round - 1 ? `${def.accentColor}70` : 'rgba(42,42,58,0.8)',
                    boxShadow: i < round ? `0 0 4px ${def.accentColor}80` : 'none',
                    transition: 'all 0.3s ease',
                  }} />
                ))}
              </div>
            </div>

            <ArenaPlayerCard name="Bot" hp={botHp}
              classLabel={botDef.id} color={botDef.accentColor} side="right"
              lastMove={lastEntry?.botMove ?? null}
              lastDmgDealt={lastEntry?.botDmg ?? 0}
              opponentDefended={lastEntry?.playerMove === 'defend'} />
          </div>
        )
      })()}

      {/* ── Move buttons — overlay at bottom with gradient backdrop ── */}
      <div className="battle-move-buttons absolute inset-x-0 bottom-0 z-30 grid grid-cols-3 gap-2 px-3"
        style={{
          paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))',
          paddingTop: 8,
          background: 'linear-gradient(0deg, rgba(4,3,12,0.92) 0%, rgba(4,3,12,0.7) 70%, transparent 100%)',
        }}>
        {saveError && (
          <div className="col-span-3 -mt-1 mb-1">
            <p className="text-red-400 text-[10px] text-center">{saveError} — try again</p>
          </div>
        )}
        {MOVES.map(({ id, label, desc, Icon, color }) => {
          const disabled = (id === 'special' && specialUsed) || isEntering || isRoundAnimating || submitting
          return (
            <motion.button key={id} onClick={() => handleMove(id)} disabled={disabled}
              whileTap={disabled ? {} : { scale: 0.93 }}
              className="battle-move-btn relative flex flex-col items-center gap-1.5 py-3 rounded-2xl border overflow-hidden"
              style={{
                background: disabled ? 'rgba(8,8,14,0.5)' : 'rgba(6,5,16,0.92)',
                borderColor: disabled ? 'rgba(42,42,58,0.3)' : `${color}45`,
                opacity: disabled ? 0.35 : 1,
                boxShadow: !disabled && id === 'special' ? `0 0 20px ${color}25, inset 0 0 20px ${color}08` : 'none',
              }}>
              {!disabled && (
                <div className="absolute inset-0 pointer-events-none"
                  style={{ background: `radial-gradient(ellipse at 50% 0%, ${color}10, transparent 60%)` }} />
              )}
              <div className="battle-move-icon relative z-10 w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: `${color}16`, border: `1px solid ${color}30` }}>
                <Icon size={18} style={{ color: disabled ? '#4a4a5a' : color }} strokeWidth={1.8} />
              </div>
              <span className="relative z-10 font-black text-white text-xs">{label}</span>
              <span className="battle-move-desc relative z-10 text-[8px] text-slate-500">{disabled ? 'Used' : desc}</span>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

// ── Arena player card (corner HUD) ───────────────────────────────────────────

function ArenaPlayerCard({ name, hp, classLabel, color, side, lastMove, lastDmgDealt, opponentDefended }: {
  name: string; hp: number; classLabel: string; color: string; side: 'left' | 'right'
  lastMove?: BattleMove | null
  lastDmgDealt?: number
  opponentDefended?: boolean
}) {
  const hpColor = hp > 60 ? color : hp > 30 ? '#f59e0b' : '#ef4444'
  const isCritical = hp <= 30

  const moveColor = lastMove === 'special' ? '#8b5cf6' : lastMove === 'defend' ? '#3b82f6' : '#ef4444'
  const MoveIcon  = lastMove === 'special' ? Zap : lastMove === 'defend' ? Shield : Sword
  const moveLabel = lastMove === 'defend'
    ? 'DEFEND'
    : lastMove === 'special'
      ? `SPECIAL +${lastDmgDealt ?? 0}${opponentDefended ? '(↓½)' : ''}`
      : `ATTACK +${lastDmgDealt ?? 0}${opponentDefended ? '(↓½)' : ''}`

  return (
    <div className={`flex flex-col gap-1 ${side === 'right' ? 'items-end' : 'items-start'}`}
      style={{ minWidth: 110, maxWidth: 150 }}>
      <div className={`flex items-center gap-1.5 ${side === 'right' ? 'flex-row-reverse' : ''}`}>
        <div className="w-7 h-7 rounded-full border flex items-center justify-center shrink-0"
          style={{ borderColor: `${color}60`, background: `${color}18`, color }}>
          <Sword size={14} />
        </div>
        <div className={side === 'right' ? 'text-right' : ''}>
          <p className="font-black text-white leading-none" style={{ fontSize: 10 }}>{name}</p>
          <p className="font-bold uppercase" style={{ fontSize: 7, letterSpacing: '0.18em', color }}>{classLabel}</p>
        </div>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden w-full"
        style={{ background: 'rgba(42,42,58,0.7)' }}>
        <motion.div className="h-full rounded-full"
          style={{
            background: `linear-gradient(90deg, ${hpColor}90, ${hpColor})`,
            boxShadow: isCritical ? `0 0 6px ${hpColor}` : 'none',
          }}
          animate={{ width: `${hp}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      </div>
      <div className={`flex items-center gap-1 w-full ${side === 'right' ? 'justify-end' : ''}`}>
        <span className="font-black" style={{ fontSize: 9, color: hpColor }}>
          {hp}<span className="text-slate-500 font-normal" style={{ fontSize: 8 }}>HP</span>
          {isCritical && <span className="text-red-400 font-black ml-1 animate-pulse" style={{ fontSize: 7 }}>!</span>}
        </span>
        {lastMove && (
          <AnimatePresence mode="wait">
            <motion.span key={`${lastMove}-${lastDmgDealt}`}
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{ fontSize: 7, color: moveColor, fontWeight: 900, letterSpacing: '0.04em', marginLeft: 4 }}>
              <MoveIcon size={9} className="inline mr-0.5" />{moveLabel}
            </motion.span>
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
