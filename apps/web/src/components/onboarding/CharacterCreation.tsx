'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePlayerStore } from '@/stores/usePlayerStore'

import { CHARACTER_CLASSES, CLASS_DEFINITIONS, statVarianceFromWallet } from '@/lib/classes'
import type { CharacterClass } from '@/lib/classes'
import type { PlayStyle } from '@/types'
import CharacterPortrait from '@/components/warrior/CharacterPortrait'
import AvatarGenerator, { type ArmorStyle } from '@/components/onboarding/AvatarGenerator'

const SKIN_TONES = ['#fde8d5','#f5c9a0','#d4935a','#a0612a','#7b4012','#3d1f0a']
const HAIR_COLORS = ['#0a0805','#3d2210','#6b2a12','#c8901a','#c8c0a8','#e8e4f0']
const PREFIXES = ['Iron','Dark','Storm','Ash','Void','Flame','Shadow','Silver','Crimson','Frost','Thunder','Ember','Blood','Death','War']
const SUFFIXES = ['Blade','Fist','Heart','Walker','Strike','Guard','Born','Wolf','Hawk','Bane','Forge','Rift','Claw','Rage','Fire']

function deterministicName(wallet: string) {
  const seed = wallet.replace('0x','').slice(0,8)
  const hash = seed.split('').reduce((acc,ch) => ((acc*31+ch.charCodeAt(0))>>>0),7)
  return `${PREFIXES[hash%PREFIXES.length]}${SUFFIXES[(hash>>>4)%SUFFIXES.length]}`
}

const PLAY_STYLE_LABELS: Record<PlayStyle,string> = {
  Wanderer:'Idle missions & passive XP',
  Fighter:'Max XP through battles',
  Champion:'Battle and idle — both',
}

type Tab = 'look' | 'details'

interface Props {
  walletAddress: `0x${string}`
  initialClass?: CharacterClass
  initialGender?: 'male' | 'female'
  onCreated: () => void
}

// ─── Atmosphere backgrounds ───────────────────────────────────────────────────

function ClassAtmosphere({ characterClass, accentColor }: { characterClass: CharacterClass; accentColor: string }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Base dark gradient */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,#04030c 0%,#060510 100%)' }} />
      {/* Class radial glow from center-bottom */}
      <motion.div
        key={characterClass}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.7 }}
        className="absolute"
        style={{
          bottom: '30%', left: '50%', transform: 'translateX(-50%)',
          width: 480, height: 480,
          background: `radial-gradient(ellipse, ${accentColor}22 0%, transparent 68%)`,
        }}
      />
      {/* Vertical shaft of light */}
      <motion.div
        key={`shaft-${characterClass}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        className="absolute left-1/2 -translate-x-1/2 top-0"
        style={{
          width: 220, height: '65%',
          background: `linear-gradient(180deg, transparent, ${accentColor}12 40%, ${accentColor}08 80%, transparent)`,
        }}
      />
      {/* Ground spotlight */}
      <div
        className="absolute bottom-[26%] left-1/2 -translate-x-1/2"
        style={{
          width: 300, height: 24,
          background: `radial-gradient(ellipse, ${accentColor}50 0%, transparent 70%)`,
          filter: 'blur(6px)',
        }}
      />
      {/* Class-specific particles */}
      {characterClass === 'Berserker' && <EmberParticles color={accentColor} />}
      {characterClass === 'Sentinel' && <LightningLines color={accentColor} />}
      {characterClass === 'Phantom' && <SmokeWisps color={accentColor} />}
    </div>
  )
}

function EmberParticles({ color }: { color: string }) {
  const embers = useMemo(() =>
    Array.from({length:12},(_,i) => ({
      id: i,
      left: 20+Math.random()*60,
      delay: Math.random()*4,
      duration: 2.5+Math.random()*2.5,
      size: 2+Math.random()*3,
    }))
  ,[])
  return (
    <>
      {embers.map(e => (
        <motion.div
          key={e.id}
          className="absolute bottom-[28%] rounded-full"
          style={{ left:`${e.left}%`, width:e.size, height:e.size, background:color, boxShadow:`0 0 6px ${color}` }}
          animate={{ y:[0,-180,-320], opacity:[0,0.85,0], x:[0,e.id%2===0?12:-12,0] }}
          transition={{ duration:e.duration, delay:e.delay, repeat:Infinity, ease:'easeOut' }}
        />
      ))}
    </>
  )
}

function LightningLines({ color }: { color: string }) {
  return (
    <>
      {[0,1,2].map(i => (
        <motion.div
          key={i}
          className="absolute"
          style={{
            left: i===0?'8%':i===1?'88%':'50%',
            top: '10%',
            width: 1.5, height: '50%',
            background: `linear-gradient(180deg, transparent, ${color}60, ${color}30, transparent)`,
          }}
          animate={{ opacity:[0,0.8,0,0.5,0], scaleX:[1,1.5,0.5,1.5,1] }}
          transition={{ duration:0.8+i*0.3, delay:i*1.2, repeat:Infinity, repeatDelay:2+i }}
        />
      ))}
    </>
  )
}

function SmokeWisps({ color }: { color: string }) {
  const wisps = useMemo(() =>
    Array.from({length:6},(_,i) => ({
      id: i,
      left: 10+Math.random()*80,
      delay: Math.random()*5,
      duration: 4+Math.random()*3,
      width: 30+Math.random()*60,
    }))
  ,[])
  return (
    <>
      {wisps.map(w => (
        <motion.div
          key={w.id}
          className="absolute bottom-[28%] rounded-full"
          style={{
            left:`${w.left}%`, width:w.width, height:w.width*0.4,
            background:`radial-gradient(ellipse, ${color}18, transparent 70%)`,
            filter:'blur(12px)',
          }}
          animate={{ y:[0,-120,-250], opacity:[0,0.6,0], x:[0,w.id%2===0?20:-20,0] }}
          transition={{ duration:w.duration, delay:w.delay, repeat:Infinity, ease:'easeInOut' }}
        />
      ))}
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CharacterCreation({ walletAddress, initialClass = 'Berserker', initialGender = 'male', onCreated }: Props) {
  const setPlayer = usePlayerStore(s => s.setPlayer)
  const characterName = useMemo(() => deterministicName(walletAddress),[walletAddress])
  const variance = useMemo(() => statVarianceFromWallet(walletAddress),[walletAddress])

  const [selectedClass, setSelectedClass] = useState<CharacterClass>(initialClass)
  const [gender] = useState<'male' | 'female'>(initialGender)
  const [skinTone] = useState(SKIN_TONES[1])
  const [hairStyle] = useState(0)
  const [hairColor] = useState(HAIR_COLORS[0])
  const [playStyle, setPlayStyle] = useState<PlayStyle>('Fighter')
  const [tab, setTab] = useState<Tab>('look')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string|null>(null)
  const [portraitUrl,  setPortraitUrl]  = useState<string | null>(null)
  const [armorStyle,   setArmorStyle]   = useState<ArmorStyle>('battle-worn')

  const def = CLASS_DEFINITIONS[selectedClass]
  const stats = {
    attack:  def.stats.attack  + variance,
    defense: def.stats.defense + variance,
    speed:   def.stats.speed   + variance,
  }

  async function handleCreate() {
    setPending(true); setError(null)
    const now = new Date().toISOString()
    const newPlayer = {
      wallet_address: walletAddress,
      play_style: playStyle,
      avatar: '',
      character_name: characterName,
      username: null,
      display_name: null,
      character_class: selectedClass,
      character_customization: { skin: skinTone, hair: `${hairStyle}:${hairColor}`, gender, avatar_url: portraitUrl ?? undefined, armor_style: armorStyle },
      rank: 'Bronze' as const,
      xp: 0,
      attack_stat: stats.attack,
      defense_stat: stats.defense,
      speed_stat: stats.speed,
      g_earned_lifetime: 0,
      last_active: now,
      decay_status: 'none' as const,
      decay_frozen_until: null,
      wins: 0,
      losses: 0,
    }
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/players`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newPlayer),
    })
    if (!res.ok) {
      setError('Failed to save character. Please try again.'); setPending(false); return
    }
    const created = await res.json()
    setPlayer(created)
    onCreated()
  }

  return (
    <div className="fixed inset-0 z-60 overflow-hidden flex flex-col" style={{ background:'#04030c' }}>

      {/* ── ATMOSPHERE BACKGROUND ── */}
      <ClassAtmosphere characterClass={selectedClass} accentColor={def.accentColor} />

      {/* ── HEADER ── */}
      <div className="relative z-10 pt-5 px-5 flex items-center justify-between shrink-0">
        <div>
          <p className="text-[10px] text-slate-600 uppercase tracking-[0.18em] font-bold">STILLHUNT</p>
          <h1
            className="font-display font-black text-white tracking-[0.06em] leading-none"
            style={{ fontSize:'clamp(1.4rem,3.5vw,2.2rem)' }}
          >
            FORGE YOUR <span style={{ color:def.accentColor }}>FIGHTER</span>
          </h1>
        </div>
        {/* Stat badges */}
        <div className="flex gap-2">
          {[
            {l:'ATK',v:stats.attack,c:'#ef4444'},
            {l:'DEF',v:stats.defense,c:'#3b82f6'},
            {l:'SPD',v:stats.speed,c:'#22c55e'},
          ].map(({l,v,c}) => (
            <div key={l} className="flex flex-col items-center bg-black/40 rounded-lg px-2 py-1 border border-white/5">
              <span className="text-[8px] font-bold tracking-widest" style={{color:c}}>{l}</span>
              <span className="text-white font-black text-sm leading-none">{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── CHARACTER STAGE ── */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-end min-h-0 pb-2">
        {/* Character name overlay */}
        <div className="absolute top-2 left-0 right-0 flex flex-col items-center pointer-events-none z-20">
          <motion.p
            key={selectedClass}
            className="font-display font-black text-white"
            style={{ fontSize:'clamp(1.5rem,4vw,2.5rem)', letterSpacing:'0.1em', textShadow:`0 0 30px ${def.accentColor}` }}
            initial={{ opacity:0, y:-8 }}
            animate={{ opacity:1, y:0 }}
            transition={{ duration:0.4 }}
          >
            {characterName}
          </motion.p>
          <motion.span
            key={`badge-${selectedClass}`}
            className="text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-[0.18em] mt-1"
            style={{ background:def.accentColorDim, color:def.accentColor, border:`1px solid ${def.accentColor}40` }}
            initial={{ opacity:0, scale:0.9 }}
            animate={{ opacity:1, scale:1 }}
            transition={{ duration:0.35, delay:0.1 }}
          >
            {def.tagline}
          </motion.span>
        </div>

        {/* Character portrait — RPM avatar if created, else class portrait */}
        <AnimatePresence mode="wait">
          {portraitUrl ? (
            <motion.div
              key="rpm-portrait"
              className="relative flex items-end justify-center w-full"
              style={{ maxHeight:'clamp(280px,48vh,440px)', height:'100%' }}
              initial={{ opacity:0, scale:0.88, y:24 }}
              animate={{ opacity:1, scale:1, y:0 }}
              exit={{ opacity:0, scale:0.88, y:12 }}
              transition={{ duration:0.45, ease:[0.16,1,0.3,1] }}
            >
              <motion.img
                src={portraitUrl}
                alt="Your avatar"
                className="h-full w-auto object-contain object-bottom select-none"
                draggable={false}
                style={{ filter:`drop-shadow(0 0 40px ${def.accentColor}88) drop-shadow(0 20px 48px rgba(0,0,0,0.99))` }}
                animate={{ y:[0,-7,0] }}
                transition={{ duration:3.5, repeat:Infinity, ease:'easeInOut' }}
              />
            </motion.div>
          ) : (
            <motion.div
              key={`${selectedClass}-${skinTone}-${hairStyle}`}
              className="relative flex items-end justify-center w-full"
              style={{ maxHeight:'clamp(280px,48vh,440px)', height:'100%' }}
              initial={{ opacity:0, scale:0.9, y:24 }}
              animate={{ opacity:1, scale:1, y:0 }}
              exit={{ opacity:0, scale:0.88, y:12 }}
              transition={{ duration:0.4, ease:[0.16,1,0.3,1] }}
            >
              <CharacterPortrait
                characterClass={selectedClass}
                skinTone={skinTone}
                hairStyle={hairStyle}
                hairColor={hairColor}
                gender={gender}
                height="100%"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── BOTTOM PANEL ── */}
      <div className="relative z-10 shrink-0 flex flex-col" style={{ background:'linear-gradient(0deg,#050510 85%,transparent)' }}>

        {/* CLASS SELECTOR STRIP */}
        <div className="flex gap-2.5 px-4 pt-3 pb-2">
          {CHARACTER_CLASSES.map(cls => {
            const d = CLASS_DEFINITIONS[cls]
            const active = selectedClass === cls
            return (
              <motion.button
                key={cls}
                onClick={() => setSelectedClass(cls)}
                whileTap={{ scale:0.94 }}
                className="flex-1 flex flex-col items-center gap-1 rounded-xl border-2 overflow-hidden relative py-2"
                style={{
                  borderColor: active ? d.accentColor : '#1e1e2e',
                  background: active ? `${d.accentColor}18` : '#0c0c18',
                  boxShadow: active ? `0 0 18px ${d.accentColor}40, inset 0 0 12px ${d.accentColor}08` : 'none',
                }}
              >
                {/* Active indicator */}
                {active && (
                  <motion.div
                    layoutId="class-indicator"
                    className="absolute top-0 inset-x-0 h-0.5"
                    style={{ background:d.accentColor }}
                  />
                )}
                <span className="font-display font-black text-xs uppercase tracking-wider" style={{ color:active?d.accentColor:'#4a4a6a' }}>
                  {d.name}
                </span>
                <span className="text-[8px] text-center leading-tight px-1" style={{ color:active?'rgba(255,255,255,0.55)':'#2a2a3a' }}>
                  {d.weapon}
                </span>
              </motion.button>
            )
          })}
        </div>

        {/* CUSTOMIZATION TABS */}
        <div className="flex gap-0 mx-4 mb-2 bg-black/40 rounded-lg border border-white/5 overflow-hidden">
          {(['look','details'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-2 text-xs font-black uppercase tracking-widest transition-all relative"
              style={{ color:tab===t?def.accentColor:'#3a3a5a' }}
            >
              {tab===t && (
                <motion.div layoutId="tab-underline" className="absolute bottom-0 inset-x-3 h-0.5" style={{ background:def.accentColor }} />
              )}
              {t}
            </button>
          ))}
        </div>

        {/* TAB CONTENT */}
        <AnimatePresence mode="wait">
          {tab === 'look' && (
            <motion.div key="look" {...tabAnim} className="px-4">
              <AvatarGenerator
                characterClass={selectedClass}
                gender={gender}
                accentColor={def.accentColor}
                walletAddress={walletAddress}
                onGenerated={(url, _skin, armor) => {
                  setPortraitUrl(url)
                  setArmorStyle(armor)
                }}
              />
            </motion.div>
          )}

          {tab === 'details' && (
            <motion.div key="details" {...tabAnim} className="px-4 flex flex-col gap-3">
              {/* Class description */}
              <div className="rounded-xl p-3 border" style={{ background:def.accentColorDim, borderColor:`${def.accentColor}25` }}>
                <p className="text-white text-xs leading-relaxed">{def.description}</p>
                <p className="text-xs font-bold mt-2" style={{color:def.accentColor}}>{def.special} <span className="font-normal text-slate-400">— {def.specialDesc}</span></p>
              </div>

              {/* Play Style */}
              <div>
                <p className="text-[9px] text-slate-600 uppercase tracking-widest font-bold mb-2">Play Style</p>
                <div className="flex flex-col gap-1.5">
                  {(['Wanderer','Fighter','Champion'] as PlayStyle[]).map(ps => (
                    <button
                      key={ps}
                      onClick={() => setPlayStyle(ps)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left transition-all"
                      style={{
                        background: playStyle===ps?def.accentColorDim:'#0a0a14',
                        borderColor: playStyle===ps?def.accentColor:'#1e1e2e',
                      }}
                    >
                      <div className="w-2.5 h-2.5 rounded-full shrink-0 border-2" style={{
                        background: playStyle===ps?def.accentColor:'transparent',
                        borderColor: playStyle===ps?def.accentColor:'#3a3a5a',
                      }}/>
                      <div>
                        <p className="font-bold text-white text-xs">{ps}</p>
                        <p className="text-[10px] text-slate-500">{PLAY_STYLE_LABELS[ps]}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* FORGE BUTTON */}
        <div className="px-4 pt-3 pb-6">
          {error && <p className="text-red-400 text-xs text-center mb-2">{error}</p>}
          <motion.button
            onClick={handleCreate}
            disabled={pending}
            whileHover={{ scale:1.03, filter:'brightness(1.14)' }}
            whileTap={{ scale:0.96 }}
            className="w-full font-display font-black uppercase tracking-[0.18em] py-4 text-sm relative overflow-hidden"
            style={{
              background: pending?'#2a2a3a':`linear-gradient(135deg, ${def.accentColor}f0, ${def.accentColor})`,
              color: pending?'#555':'#000',
              clipPath:'polygon(10px 0%, 100% 0%, calc(100% - 10px) 100%, 0% 100%)',
              boxShadow: pending?'none':`0 0 32px ${def.accentColor}55, 0 4px 20px rgba(0,0,0,0.8)`,
            }}
          >
            {!pending && (
              <motion.div
                className="absolute inset-0 pointer-events-none"
                style={{ background:`linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)` }}
                animate={{ x:['-100%','200%'] }}
                transition={{ duration:2.5, repeat:Infinity, ease:'linear', repeatDelay:1 }}
              />
            )}
            {pending ? (
              <span className="flex items-center justify-center gap-2">
                <motion.span className="w-4 h-4 rounded-full border-2 border-black/40 border-t-transparent inline-block" animate={{rotate:360}} transition={{duration:0.8,repeat:Infinity,ease:'linear'}}/>
                Forging...
              </span>
            ) : `Forge ${characterName}`}
          </motion.button>
          <p className="text-slate-700 text-[8px] tracking-widest uppercase text-center mt-2">One permanent warrior</p>
        </div>
      </div>

    </div>
  )
}

const tabAnim = {
  initial:{ opacity:0, y:10 },
  animate:{ opacity:1, y:0 },
  exit:{ opacity:0, y:-6 },
  transition:{ duration:0.2 },
}
