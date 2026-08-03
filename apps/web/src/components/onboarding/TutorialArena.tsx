'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sword, Shield, Zap, Trophy } from 'lucide-react'
import type { Player, BattleMove } from '@/types'
import { CLASS_DEFINITIONS, CHARACTER_GLB, CHARACTER_IMAGES } from '@/lib/classes'
import type { CharacterClass } from '@/lib/classes'
import { useTutorialBattle, TUTORIAL_HINTS } from '@/hooks/useTutorialBattle'
import { useCombatFeel } from '@/hooks/useCombatFeel'
import { useAudio } from '@/hooks/useAudio'
import CharacterViewer from '@/components/warrior/CharacterViewer'
import ImpactBurst from '@/components/battle/ImpactBurst'

const BOT_CLASS: CharacterClass = 'Berserker'

const MOVES: { id: BattleMove; label: string; Icon: typeof Sword; color: string }[] = [
  { id: 'attack',  label: 'Attack',  Icon: Sword,  color: '#ef4444' },
  { id: 'defend',  label: 'Defend',  Icon: Shield, color: '#3b82f6' },
  { id: 'special', label: 'Special', Icon: Zap,    color: '#8b5cf6' },
]

interface Props {
  player: Player
  onComplete: () => void
}

export default function TutorialArena({ player, onComplete }: Props) {
  const def    = CLASS_DEFINITIONS[player.character_class as CharacterClass] ?? CLASS_DEFINITIONS.Berserker
  const botDef = CLASS_DEFINITIONS[BOT_CLASS]

  const battle      = useTutorialBattle(player)
  const combatFeel  = useCombatFeel()
  const { playHit, playSpecial, playVictory } = useAudio()

  const [playerAnim, setPlayerAnim] = useState('idle')
  const [botAnim,    setBotAnim]    = useState('idle')
  const [isAnimating, setIsAnimating] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const hint = TUTORIAL_HINTS.find(h => h.round === battle.round)

  // Drive combat animations from log
  const prevLogLen = useRef(0)
  useEffect(() => {
    if (battle.log.length <= prevLogLen.current) return
    prevLogLen.current = battle.log.length
    const entry = battle.log[battle.log.length - 1]
    timers.current.forEach(clearTimeout)

    setIsAnimating(true)
    const playerAction = entry.playerMove === 'attack' || entry.playerMove === 'special' ? 'attack' : 'idle'
    setPlayerAnim(playerAction)

    const t1 = setTimeout(() => {
      if (entry.playerDmg > 0) {
        setBotAnim('hit')
        combatFeel.triggerHit('bot', entry.playerDmg, def.accentColor, entry.playerMove === 'special')
        playHit(player.character_class ?? 'Berserker', entry.playerDmg)
        if (entry.playerMove === 'special') playSpecial(player.character_class ?? 'Berserker')
      }
    }, 320)
    const t2 = setTimeout(() => setBotAnim(entry.botMove === 'attack' ? 'attack' : 'idle'), 740)
    const t3 = setTimeout(() => {
      if (entry.botDmg > 0) {
        setPlayerAnim('hit')
        combatFeel.triggerHit('player', entry.botDmg, botDef.accentColor, false)
        playHit(BOT_CLASS, entry.botDmg)
      }
    }, 980)
    const t4 = setTimeout(() => {
      setPlayerAnim('idle'); setBotAnim('idle'); setIsAnimating(false)
    }, 1500)
    timers.current = [t1, t2, t3, t4]
  }, [battle.log])

  // Victory audio
  useEffect(() => {
    if (battle.phase === 'result' && battle.result?.won) playVictory()
  }, [battle.phase])

  const shakeAnim = combatFeel.shakeLevel > 0
    ? { x: combatFeel.shakeLevel >= 3 ? [-8, 8, -5, 5, 0] : [-4, 4, -2, 2, 0] }
    : { x: 0 }

  // ── IDLE ──────────────────────────────────────────────────────────────────
  if (battle.phase === 'idle') {
    return (
      <div className="fixed inset-0 z-60 flex flex-col items-center justify-center gap-6 px-5"
        style={{ background: '#04030c' }}>
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(ellipse 80% 60% at 50% 50%, ${def.accentColor}14, transparent)` }} />

        <motion.div className="relative z-10 text-center max-w-sm" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <p className="font-display font-bold uppercase text-[10px] tracking-[0.4em] mb-3" style={{ color: 'rgba(234,179,8,0.5)' }}>
            Training Ground
          </p>
          <h2 className="font-display font-black text-white text-3xl tracking-wide mb-2">
            Meet Your Dummy
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            A scripted warrior awaits. No real stakes — just learn the mechanics before your legend begins.
          </p>
        </motion.div>

        <motion.button
          onClick={battle.startBattle}
          className="relative z-10 overflow-hidden font-display font-black uppercase px-10 py-4 text-sm tracking-[0.22em]"
          style={{
            background: `linear-gradient(135deg, ${def.accentColor}ee, ${def.accentColor})`,
            color: '#080610',
            clipPath: 'polygon(10px 0%, 100% 0%, calc(100% - 10px) 100%, 0% 100%)',
            boxShadow: `0 0 32px ${def.accentColor}44`,
          }}
          whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        >
          Begin Training
        </motion.button>

        <motion.button
          onClick={onComplete}
          className="relative z-10 text-slate-600 hover:text-slate-400 text-xs uppercase tracking-widest transition-colors"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
        >
          Skip Training →
        </motion.button>
      </div>
    )
  }

  // ── RESULT ────────────────────────────────────────────────────────────────
  if (battle.phase === 'result' && battle.result) {
    return (
      <div className="fixed inset-0 z-60 flex flex-col items-center justify-center gap-6 px-5"
        style={{ background: '#04030c' }}>
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(234,179,8,0.10), transparent)' }} />

        <motion.div
          className="relative z-10 flex flex-col items-center gap-4 text-center max-w-sm"
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 180, damping: 14 }}
        >
          <motion.div initial={{ scale: 0, rotate: -15 }} animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 180, damping: 12, delay: 0.1 }}>
            <Trophy size={56} className="text-amber-400" strokeWidth={1.2} />
          </motion.div>
          <h2 className="font-display font-black text-white text-3xl tracking-wider">TRAINING COMPLETE</h2>
          <p className="font-display font-bold uppercase text-[10px] tracking-[0.3em]" style={{ color: 'rgba(255,255,255,0.3)' }}>
            +{battle.result.xpAwarded} XP · You're ready
          </p>
          <p className="text-slate-400 text-sm leading-relaxed mt-1">
            The arena awaits. Real warriors. Real stakes. Real G$ on the line.
          </p>
        </motion.div>

        <motion.button
          onClick={onComplete}
          className="relative z-10 overflow-hidden font-display font-black uppercase px-10 py-4 text-sm tracking-[0.22em]"
          style={{
            background: 'linear-gradient(135deg, #fde047, #eab308)',
            color: '#080610',
            clipPath: 'polygon(10px 0%, 100% 0%, calc(100% - 10px) 100%, 0% 100%)',
            boxShadow: '0 0 32px rgba(234,179,8,0.4)',
          }}
          whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
        >
          Enter the Arena
        </motion.button>
      </div>
    )
  }

  // ── FIGHTING ──────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-60 flex flex-col" style={{ background: '#04030c' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <p className="font-display font-bold uppercase text-[9px] tracking-[0.4em]" style={{ color: 'rgba(234,179,8,0.45)' }}>
          Training Battle
        </p>
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-600">
          Round {battle.round} / 5
        </span>
      </div>

      {/* Arena stage */}
      <motion.div
        key={combatFeel.shakeKey}
        animate={shakeAnim}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="relative mx-4 rounded-2xl overflow-hidden shrink-0"
        style={{ height: 220, background: '#06050f' }}
      >
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 100%, rgba(60,20,100,0.3), transparent)' }} />

        {/* Player */}
        <div className="absolute left-0 top-0 w-1/2 h-full">
          <CharacterViewer
            glbPath={CHARACTER_GLB[player.character_class as CharacterClass]}
            accentColor={def.accentColor}
            animationName={playerAnim}
            modelKey={`tutorial-player-${player.character_class}`}
            className="absolute inset-0"
            fallback={
              <div className="absolute inset-0 flex items-end justify-center pb-2">
                <img src={CHARACTER_IMAGES[player.character_class as CharacterClass]?.male}
                  alt="" aria-hidden
                  className="h-full w-auto object-contain object-bottom select-none"
                  style={{ filter: `drop-shadow(0 0 16px ${def.glowColor})` }}
                />
              </div>
            }
          />
          <AnimatePresence>
            {combatFeel.playerFlash && (
              <motion.div key="pflash" className="absolute inset-0 pointer-events-none"
                style={{ background: `${combatFeel.playerFlash}40` }}
                initial={{ opacity: 0 }} animate={{ opacity: [0, 0.9, 0] }} exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }} />
            )}
          </AnimatePresence>
          <AnimatePresence>
            {combatFeel.playerBurst && (
              <ImpactBurst key={`pb-${combatFeel.shakeKey}`} color={combatFeel.playerBurst} size="sm" />
            )}
          </AnimatePresence>
          <div className="absolute bottom-1 inset-x-0 flex justify-center pointer-events-none">
            <HpPill hp={battle.playerHp} color={def.accentColor} label={player.character_name} />
          </div>
        </div>

        {/* Bot (mirrored) */}
        <div className="absolute right-0 top-0 w-1/2 h-full" style={{ transform: 'scaleX(-1)' }}>
          <CharacterViewer
            glbPath={CHARACTER_GLB[BOT_CLASS]}
            accentColor={botDef.accentColor}
            animationName={botAnim}
            modelKey="tutorial-bot"
            className="absolute inset-0"
            fallback={
              <div className="absolute inset-0 flex items-end justify-center pb-2">
                <img src={CHARACTER_IMAGES[BOT_CLASS]?.male}
                  alt="" aria-hidden
                  className="h-full w-auto object-contain object-bottom select-none"
                  style={{ filter: `drop-shadow(0 0 16px ${botDef.glowColor})` }}
                />
              </div>
            }
          />
          <AnimatePresence>
            {combatFeel.botFlash && (
              <motion.div key="bflash" className="absolute inset-0 pointer-events-none"
                style={{ background: `${combatFeel.botFlash}40` }}
                initial={{ opacity: 0 }} animate={{ opacity: [0, 0.9, 0] }} exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }} />
            )}
          </AnimatePresence>
          <AnimatePresence>
            {combatFeel.botBurst && (
              <ImpactBurst key={`bb-${combatFeel.shakeKey}`} color={combatFeel.botBurst} size="sm" />
            )}
          </AnimatePresence>
        </div>

        {/* Bot HP pill (outside scaleX) */}
        <div className="absolute bottom-1 right-0 w-1/2 flex justify-center pointer-events-none">
          <HpPill hp={battle.botHp} color={botDef.accentColor} label="Dummy" />
        </div>

        {/* VS */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
          <span className="font-display font-black text-lg" style={{ color: 'rgba(234,179,8,0.3)' }}>VS</span>
        </div>
      </motion.div>

      {/* Hint banner */}
      <AnimatePresence mode="wait">
        {hint && (
          <motion.div
            key={hint.round}
            className="mx-4 mt-3 px-4 py-3 rounded-xl border text-center shrink-0"
            style={{
              background: 'rgba(234,179,8,0.06)',
              borderColor: 'rgba(234,179,8,0.22)',
            }}
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
          >
            <p className="text-amber-400/80 text-xs font-bold leading-relaxed">{hint.text}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Move buttons */}
      <div className="grid grid-cols-3 gap-2.5 px-4 mt-3 mb-4">
        {MOVES.map(({ id, label, Icon, color }) => {
          const disabled  = (id === 'special' && battle.specialUsed) || isAnimating
          const isHighlit = hint?.targetMove === id && !disabled
          return (
            <motion.button key={id}
              onClick={() => battle.handleMove(id)}
              disabled={disabled}
              whileHover={disabled ? {} : { scale: 1.04, y: -2 }}
              whileTap={disabled ? {} : { scale: 0.96 }}
              className="relative flex flex-col items-center gap-2 p-4 rounded-xl border overflow-hidden transition-all"
              style={{
                background:  disabled ? 'rgba(8,8,14,0.4)' : isHighlit ? `${color}14` : 'rgba(8,8,14,0.9)',
                borderColor: disabled ? 'rgba(42,42,58,0.3)' : isHighlit ? `${color}55` : `${color}28`,
                opacity:     disabled ? 0.35 : 1,
                boxShadow:   isHighlit ? `0 0 16px ${color}28` : 'none',
              }}
              animate={isHighlit ? { scale: [1, 1.04, 1] } : {}}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
            >
              {isHighlit && (
                <motion.div className="absolute inset-0 pointer-events-none"
                  animate={{ opacity: [0.3, 0.7, 0.3] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                  style={{ background: `radial-gradient(ellipse at 50% 0%, ${color}18, transparent 65%)` }}
                />
              )}
              <div className="relative z-10 w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: `${color}12`, border: `1px solid ${color}22` }}>
                <Icon size={18} style={{ color: disabled ? '#4a4a5a' : color }} strokeWidth={1.8} />
              </div>
              <p className="relative z-10 font-black text-white text-sm">{label}</p>
              {isHighlit && (
                <motion.div
                  className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full"
                  style={{ background: color }}
                  animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                  transition={{ duration: 0.9, repeat: Infinity }}
                />
              )}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

function HpPill({ hp, color, label }: { hp: number; color: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 z-10">
      <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded"
        style={{ background: `${color}22`, color, border: `1px solid ${color}33` }}>
        {label}
      </span>
      <div className="w-16 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(18,18,26,0.8)' }}>
        <motion.div className="h-full rounded-full"
          style={{ background: hp > 50 ? color : hp > 25 ? '#f59e0b' : '#ef4444' }}
          animate={{ width: `${hp}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}
