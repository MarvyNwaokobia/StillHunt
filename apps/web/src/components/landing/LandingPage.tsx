'use client'

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Crosshair, Coins, Gem, ChevronDown } from 'lucide-react'
import { CLASS_DEFINITIONS } from '@/lib/classes'
import SignInModal from '@/components/ui/SignInModal'

// ── Assets ────────────────────────────────────────────────────────────────────

const IMG = {
  berserker:      '/characters/StillHunt%20Characters/Characters/berserkers%20male-nobackground.png',
  sentinelHero:   '/characters/StillHunt%20Characters/Sentinel-withoutback.jpg',
  sentinelCard:   '/characters/StillHunt%20Characters/Characters/sentinel%20male%20-%20no%20background.jpg',
  phantom:        '/characters/StillHunt%20Characters/Characters/Phanthom%20male-no%20background.png',
}

// ── Embers ────────────────────────────────────────────────────────────────────

function useEmbers(n = 18) {
  return useMemo(() =>
    Array.from({ length: n }, (_, i) => ({
      id:       i,
      left:     2 + ((i * 3.8) % 26),
      delay:    (i * 0.52) % 10,
      duration: 3.2 + ((i * 0.7) % 5),
      size:     0.9 + (i % 4) * 0.5,
      drift:    Math.sin(i * 1.2) * 28,
      color:    ['rgba(255,200,50,0.95)', 'rgba(239,68,68,0.85)', 'rgba(255,140,30,0.78)', 'rgba(180,60,0,0.7)'][i % 4],
    }))
  , [])
}

// ── Data ──────────────────────────────────────────────────────────────────────

const FEATURES = [
  { Icon: Crosshair, label: 'Fight',  color: '#ef4444', desc: 'Real-time gun duels — your weapon and dodge timing decide who walks away.' },
  { Icon: Coins,  label: 'Earn TALLY', color: '#eab308', desc: 'Every victory pays out GoodDollar tokens — real money that goes directly into your account.' },
  { Icon: Gem,    label: 'Own',    color: '#8b5cf6', desc: 'Weapons and gear are yours permanently. Buy, sell, and equip in the Armoury.' },
] as const

const HOW_IT_WORKS = [
  { num: '01', color: '#ef4444', title: 'Prove You\'re Human', desc: 'Connect via GoodDollar — the universal basic income protocol. One fighter per verified player. No bots.' },
  { num: '02', color: '#3b82f6', title: 'Choose Your Class',  desc: 'Berserker, Sentinel, or Phantom. Your class is permanent — it defines your identity in the arena.' },
  { num: '03', color: '#8b5cf6', title: 'Battle & Earn',      desc: 'Climb the ranks. Every win pays out TALLY tokens on Celo. Every loss teaches you something.' },
] as const

const CLASS_IMGS: Record<string, string> = {
  Berserker: IMG.berserker,
  Sentinel:  IMG.sentinelCard,
  Phantom:   IMG.phantom,
}

const CLASSES = ['Berserker', 'Sentinel', 'Phantom'] as const

// ── Reusable section heading ──────────────────────────────────────────────────

function SectionHead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  return (
    <motion.div
      className="text-center mb-10 px-1"
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.6 }}
    >
      <p className="font-display font-bold uppercase mb-2"
        style={{ fontSize: 10, letterSpacing: '0.48em', color: 'rgba(234,179,8,0.55)' }}>
        {eyebrow}
      </p>
      <h2 className="font-display font-black text-white leading-none mb-3"
        style={{ fontSize: 'clamp(1.9rem, 6vw, 3rem)', letterSpacing: '0.04em' }}>
        {title}
      </h2>
      <p className="text-slate-500 max-w-md mx-auto leading-relaxed" style={{ fontSize: 13 }}>
        {sub}
      </p>
    </motion.div>
  )
}

// ── CTA button (reused in hero + footer) ─────────────────────────────────────

function EnterButton({ onClick, delay = 0 }: { onClick: () => void; delay?: number }) {
  return (
    <motion.button
      onClick={onClick}
      className="relative overflow-hidden font-display font-black uppercase clip-angled w-full"
      style={{
        fontSize:      'clamp(12px,2.4vw,15px)',
        letterSpacing: '0.24em',
        color:         '#080610',
        padding:       'clamp(15px,3vw,19px) 0',
        background:    'linear-gradient(135deg, #fefce8 0%, #fde047 20%, #eab308 55%, #ca8a04 80%, #92400e 100%)',
        boxShadow:     '0 0 36px rgba(234,179,8,0.5), 0 0 72px rgba(234,179,8,0.16), 0 8px 24px rgba(0,0,0,0.95)',
        maxWidth:      380,
      }}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.55, delay }}
      whileHover={{ scale: 1.03, boxShadow: '0 0 56px rgba(234,179,8,0.68), 0 0 100px rgba(234,179,8,0.22), 0 8px 32px rgba(0,0,0,0.95)' }}
      whileTap={{ scale: 0.97 }}
    >
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(108deg, transparent 28%, rgba(255,255,255,0.3) 50%, transparent 72%)' }}
        animate={{ x: ['-140%', '220%'] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'linear', repeatDelay: 3.2 }}
      />
      Enter StillHunt
    </motion.button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [showSignIn, setShowSignIn] = useState(false)
  const login = () => setShowSignIn(true)
  const embers    = useEmbers()

  return (
    <div
      className="fixed inset-0 overflow-y-auto [&::-webkit-scrollbar]:hidden"
      style={{ background: '#04030c', scrollbarWidth: 'none' }}
    >
      <AnimatePresence>
        {showSignIn && <SignInModal onClose={() => setShowSignIn(false)} />}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════
          § 1  HERO
      ═══════════════════════════════════════════════════════════ */}
      <section className="relative flex flex-col" style={{ height: '100svh', minHeight: 600 }}>

        {/* Faction atmosphere */}
        <div className="absolute inset-0 pointer-events-none">
          <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse 55% 70% at 8% 90%, rgba(180,28,0,0.5) 0%, transparent 65%)' }} />
          <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse 42% 50% at 50% 88%, rgba(30,70,200,0.3) 0%, transparent 65%)' }} />
          <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse 55% 70% at 92% 90%, rgba(90,12,190,0.48) 0%, transparent 65%)' }} />
        </div>

        {/* Mobile: Sentinel full bg */}
        <motion.img src={IMG.sentinelHero} alt="" aria-hidden
          className="md:hidden absolute inset-0 w-full h-full object-cover object-top"
          style={{ mixBlendMode:'screen', filter:'brightness(1.4) contrast(1.08) saturate(1.1)' }}
          initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ duration:1, delay:0.3 }}
        />

        {/* Desktop: Berserker left */}
        <motion.img src={IMG.berserker} alt="" aria-hidden
          className="hidden md:block absolute bottom-0 left-0 h-[88%] w-auto object-contain object-bottom"
          style={{
            filter:'drop-shadow(0 0 40px rgba(239,68,68,0.55)) brightness(1.15)',
            WebkitMaskImage:'linear-gradient(to right, black 0%, black 65%, transparent 100%), linear-gradient(to top, black 0%, black 78%, transparent 100%)',
            maskImage:'linear-gradient(to right, black 0%, black 65%, transparent 100%), linear-gradient(to top, black 0%, black 78%, transparent 100%)',
            WebkitMaskComposite:'source-in', maskComposite:'intersect',
          }}
          initial={{ opacity:0, x:-40 }} animate={{ opacity:1, x:0 }}
          transition={{ duration:0.9, delay:0.4, ease:[0.16,1,0.3,1] }}
        />

        {/* Desktop: Sentinel center */}
        <motion.img src={IMG.sentinelHero} alt="" aria-hidden
          className="hidden md:block absolute bottom-0 left-1/2 -translate-x-1/2 h-[92%] w-auto object-contain object-bottom"
          style={{ mixBlendMode:'screen', filter:'brightness(1.35) contrast(1.1) drop-shadow(0 0 50px rgba(59,130,246,0.6))' }}
          initial={{ opacity:0, y:30 }} animate={{ opacity:1, y:0 }}
          transition={{ duration:1, delay:0.25, ease:[0.16,1,0.3,1] }}
        />

        {/* Desktop: Phantom right */}
        <motion.img src={IMG.phantom} alt="" aria-hidden
          className="hidden md:block absolute bottom-0 right-0 h-[88%] w-auto object-contain object-bottom"
          style={{
            filter:'drop-shadow(0 0 40px rgba(139,92,246,0.6)) brightness(1.1)',
            WebkitMaskImage:'linear-gradient(to left, black 0%, black 65%, transparent 100%), linear-gradient(to top, black 0%, black 78%, transparent 100%)',
            maskImage:'linear-gradient(to left, black 0%, black 65%, transparent 100%), linear-gradient(to top, black 0%, black 78%, transparent 100%)',
            WebkitMaskComposite:'source-in', maskComposite:'intersect',
          }}
          initial={{ opacity:0, x:40 }} animate={{ opacity:1, x:0 }}
          transition={{ duration:0.9, delay:0.4, ease:[0.16,1,0.3,1] }}
        />

        {/* Gradient overlays */}
        <div className="absolute inset-x-0 top-0 pointer-events-none" style={{ height:'40%', background:'linear-gradient(180deg, rgba(4,3,12,0.97) 0%, rgba(4,3,12,0.65) 50%, transparent 100%)' }} />
        <div className="absolute inset-x-0 bottom-0 pointer-events-none" style={{ height:'38%', background:'linear-gradient(0deg, rgba(4,3,12,0.98) 0%, rgba(4,3,12,0.75) 55%, transparent 100%)' }} />
        <div className="absolute inset-0 pointer-events-none" style={{ background:'radial-gradient(ellipse 90% 88% at 50% 50%, transparent 40%, rgba(4,3,12,0.65) 100%)' }} />
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage:'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.025) 2px, rgba(0,0,0,0.025) 4px)' }} />

        {/* Weather */}
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage:'repeating-linear-gradient(168deg, transparent 0px, transparent 5px, rgba(160,200,255,0.04) 5px, rgba(160,200,255,0.04) 6px)', backgroundSize:'6px 80px', animation:'rain-fall 0.5s linear infinite' }} />
        <div className="absolute inset-0 pointer-events-none" style={{ background:'radial-gradient(ellipse 45% 75% at 50% 28%, rgba(70,120,255,0.09), transparent 60%)', animation:'lightning-flash 8s ease-in-out infinite', animationDelay:'3.2s' }} />

        {/* Embers */}
        {embers.map(e => (
          <motion.div key={e.id} className="absolute rounded-full pointer-events-none"
            style={{ left:`${e.left}%`, bottom:'16%', width:e.size, height:e.size, background:e.color, boxShadow:`0 0 ${e.size*3}px ${e.color}` }}
            animate={{ y:[0,-(560+e.id*18)], x:[0,e.drift], opacity:[0,0.9,0.55,0.15,0] }}
            transition={{ duration:e.duration, delay:e.delay, repeat:Infinity, ease:'easeOut' }}
          />
        ))}

        {/* Hero content */}
        <div className="relative z-10 h-full flex flex-col items-center justify-between px-5"
          style={{ paddingTop:'clamp(2.5vh,4.5vh,6vh)', paddingBottom:'clamp(3vh,5vh,7vh)' }}>

          {/* STILLHUNT logotype */}
          <div className="flex flex-col items-center gap-1.5">
            <motion.div className="flex items-center gap-2.5"
              initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ duration:0.7, delay:0.25 }}>
              <div style={{ height:1, width:'clamp(36px,7vw,80px)', background:'linear-gradient(to right, transparent, rgba(234,179,8,0.55))' }} />
              <span className="font-display font-bold uppercase" style={{ fontSize:'clamp(7px,1.3vw,10px)', letterSpacing:'0.5em', color:'rgba(234,179,8,0.5)' }}>One human. One fighter.</span>
              <div style={{ height:1, width:'clamp(36px,7vw,80px)', background:'linear-gradient(to left, transparent, rgba(234,179,8,0.55))' }} />
            </motion.div>

            <div className="font-display font-black leading-none flex select-none"
              style={{ fontSize:'clamp(5rem,19vw,12.5rem)', letterSpacing:'0.05em' }}>
              {'STILLHUNT'.split('').map((ch, i) => (
                <motion.span key={i}
                  style={{ display:'inline-block', background:'linear-gradient(175deg, #fffbe0 0%, #fde047 18%, #eab308 48%, #b45309 76%, #7c2d12 100%)', backgroundClip:'text', WebkitBackgroundClip:'text', color:'transparent', filter:'drop-shadow(0 0 28px rgba(234,179,8,0.45)) drop-shadow(0 2px 6px rgba(0,0,0,0.9))' }}
                  initial={{ opacity:0, y:-18, rotateX:-35 }} animate={{ opacity:1, y:0, rotateX:0 }}
                  transition={{ duration:0.5, delay:0.52+i*0.08, ease:[0.16,1,0.3,1] }}>
                  {ch}
                </motion.span>
              ))}
            </div>
          </div>

          <div className="flex-1" />

          {/* CTA */}
          <motion.div className="flex flex-col items-center gap-3 w-full"
            style={{ maxWidth:'clamp(270px,82vw,380px)' }}
            initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }}
            transition={{ duration:0.6, delay:1.3 }}>

            <p className="font-display font-bold uppercase"
              style={{ fontSize:'clamp(8px,1.5vw,10px)', letterSpacing:'0.35em', color:'rgba(100,116,139,0.72)' }}>
              One verified human · One fighter · Forever
            </p>

            <div className="flex items-center gap-2">
              {CLASSES.map((name, i) => (
                <motion.span key={name}
                  className="font-display font-black uppercase rounded-full border"
                  style={{ fontSize:9, letterSpacing:'0.16em', padding:'4px 10px', color:CLASS_DEFINITIONS[name].accentColor, borderColor:`${CLASS_DEFINITIONS[name].accentColor}28`, background:`${CLASS_DEFINITIONS[name].accentColor}0e` }}
                  initial={{ opacity:0, scale:0.84 }} animate={{ opacity:1, scale:1 }}
                  transition={{ delay:1.5+i*0.09, duration:0.3 }}>
                  {name}
                </motion.span>
              ))}
            </div>

            <EnterButton onClick={login} />

            <p className="text-center uppercase" style={{ fontSize:8, letterSpacing:'0.36em', color:'rgba(71,85,105,0.6)' }}>
              Powered by GoodDollar · Verified Humans Only
            </p>
          </motion.div>
        </div>

        {/* Scroll hint */}
        <motion.div
          className="absolute bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 z-20 pointer-events-none"
          initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:2.2, duration:0.8 }}>
          <motion.p
            className="font-display font-bold uppercase"
            style={{ fontSize:7, letterSpacing:'0.44em', color:'rgba(100,116,139,0.45)' }}>
            Discover
          </motion.p>
          <motion.div
            animate={{ y:[0,5,0] }}
            transition={{ duration:1.8, repeat:Infinity, ease:'easeInOut' }}>
            <ChevronDown size={14} style={{ color:'rgba(100,116,139,0.4)' }} />
          </motion.div>
        </motion.div>

      </section>

      {/* ═══════════════════════════════════════════════════════════
          § 2  FIGHT · EARN · OWN
      ═══════════════════════════════════════════════════════════ */}
      <section style={{ padding:'5rem 1.25rem 4.5rem', borderTop:'1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ maxWidth:960, margin:'0 auto' }}>

          <SectionHead
            eyebrow="What is StillHunt"
            title="Fight. Earn. Own."
            sub="The first web3 fighting game built exclusively for verified humans. No bots. No fake accounts. No empty rewards."
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {FEATURES.map(({ Icon, label, color, desc }, i) => (
              <motion.div key={label}
                className="flex flex-col items-center text-center gap-4 rounded-2xl p-6"
                style={{ background:'rgba(6,5,16,0.9)', border:`1px solid ${color}18` }}
                initial={{ opacity:0, y:24 }}
                whileInView={{ opacity:1, y:0 }}
                viewport={{ once:true, amount:0.3 }}
                transition={{ duration:0.55, delay:i*0.1 }}>

                <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ background:`${color}12`, border:`1px solid ${color}28` }}>
                  <Icon size={26} style={{ color }} strokeWidth={1.7} />
                </div>

                <div>
                  <h3 className="font-display font-black uppercase mb-2"
                    style={{ fontSize:'clamp(1rem,2.4vw,1.15rem)', letterSpacing:'0.08em', color }}>
                    {label}
                  </h3>
                  <p className="text-slate-500 leading-relaxed" style={{ fontSize:13 }}>{desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          § 3  CHARACTER SHOWCASE
      ═══════════════════════════════════════════════════════════ */}
      <section style={{ padding:'4.5rem 1.25rem', background:'rgba(255,255,255,0.008)', borderTop:'1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ maxWidth:960, margin:'0 auto' }}>

          <SectionHead
            eyebrow="Three Classes. One Covenant."
            title="Choose Your Fighter"
            sub="One class. Permanent. This is your identity in the arena — not a loadout, not a character slot."
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {CLASSES.map((cls, i) => {
              const def = CLASS_DEFINITIONS[cls]
              const isSentinel = cls === 'Sentinel'
              return (
                <motion.div key={cls}
                  className="relative overflow-hidden rounded-2xl flex flex-col"
                  style={{ background:'#060510', border:`1px solid ${def.accentColor}22`, minHeight:420 }}
                  initial={{ opacity:0, y:32 }}
                  whileInView={{ opacity:1, y:0 }}
                  viewport={{ once:true, amount:0.2 }}
                  transition={{ duration:0.6, delay:i*0.12 }}>

                  {/* Portrait */}
                  <div className="relative overflow-hidden" style={{ height:220 }}>
                    <div style={{ position:'absolute', inset:0, background:`radial-gradient(ellipse 90% 90% at 50% 85%, ${def.accentColor}22, transparent 70%)` }} />
                    <img
                      src={CLASS_IMGS[cls]}
                      alt={cls}
                      className="absolute inset-0 w-full h-full object-cover object-top"
                      style={{
                        filter:`drop-shadow(0 0 24px ${def.accentColor}44) brightness(1.05)`,
                        mixBlendMode: isSentinel ? 'screen' : undefined,
                      }}
                    />
                    <div style={{ position:'absolute', bottom:0, left:0, right:0, height:'55%', background:'linear-gradient(0deg, #060510 0%, transparent 100%)' }} />

                    {/* Class badge top-right */}
                    <div className="absolute top-3 right-3 font-display font-black uppercase rounded-lg px-2.5 py-1"
                      style={{ fontSize:9, letterSpacing:'0.18em', background:def.accentColorDim, color:def.accentColor, border:`1px solid ${def.accentColor}30` }}>
                      {cls}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex flex-col gap-3 p-4 flex-1">
                    <div>
                      <h3 className="font-display font-black leading-none mb-0.5"
                        style={{ fontSize:'clamp(1.3rem,3.5vw,1.6rem)', letterSpacing:'0.06em', color:def.accentColor }}>
                        {cls}
                      </h3>
                      <p className="font-display font-bold uppercase"
                        style={{ fontSize:9, letterSpacing:'0.22em', color:'rgba(255,255,255,0.3)' }}>
                        {def.tagline}
                      </p>
                    </div>

                    {/* Stat bars */}
                    <div className="flex flex-col gap-1.5">
                      {[
                        { l:'ATK', v:def.stats.attack,  c:'#ef4444' },
                        { l:'DEF', v:def.stats.defense, c:'#3b82f6' },
                        { l:'SPD', v:def.stats.speed,   c:'#22c55e' },
                      ].map(({ l, v, c }) => (
                        <div key={l} className="flex items-center gap-2">
                          <span className="font-display font-black w-6 shrink-0"
                            style={{ fontSize:8, letterSpacing:'0.16em', color:c }}>{l}</span>
                          <div className="flex-1 rounded-full overflow-hidden" style={{ height:4, background:'rgba(255,255,255,0.06)' }}>
                            <motion.div
                              className="h-full rounded-full"
                              style={{ background:c }}
                              initial={{ width:0 }}
                              whileInView={{ width:`${(v/20)*100}%` }}
                              viewport={{ once:true }}
                              transition={{ duration:0.8, delay:0.2+i*0.1, ease:'easeOut' }}
                            />
                          </div>
                          <span className="font-black text-white shrink-0" style={{ fontSize:11, width:16, textAlign:'right' }}>{v}</span>
                        </div>
                      ))}
                    </div>

                    {/* Weapon + Special */}
                    <div className="flex gap-2 mt-auto pt-1">
                      <div className="flex-1 rounded-xl px-2.5 py-2" style={{ background:def.accentColorDim, border:`1px solid ${def.accentColor}22` }}>
                        <p style={{ fontSize:7, letterSpacing:'0.2em', color:'rgba(255,255,255,0.25)' }} className="uppercase font-bold mb-0.5">Weapon</p>
                        <p className="font-display font-black text-white" style={{ fontSize:10 }}>{def.weapon}</p>
                      </div>
                      <div className="flex-1 rounded-xl px-2.5 py-2" style={{ background:def.accentColorDim, border:`1px solid ${def.accentColor}22` }}>
                        <p style={{ fontSize:7, letterSpacing:'0.2em', color:'rgba(255,255,255,0.25)' }} className="uppercase font-bold mb-0.5">Special</p>
                        <p className="font-display font-black" style={{ fontSize:10, color:def.accentColor }}>{def.special}</p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          § 4  HOW IT WORKS
      ═══════════════════════════════════════════════════════════ */}
      <section style={{ padding:'4.5rem 1.25rem', borderTop:'1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ maxWidth:820, margin:'0 auto' }}>

          <SectionHead
            eyebrow="Built on Trust"
            title="Real Humans Only"
            sub="StillHunt runs on GoodDollar — a blockchain-based universal basic income. Only verified humans play and earn. No bots, ever."
          />

          <div className="flex flex-col md:flex-row gap-8 md:gap-6">
            {HOW_IT_WORKS.map(({ num, color, title, desc }, i) => (
              <motion.div key={num}
                className="flex gap-4 flex-1"
                initial={{ opacity:0, x:-16 }}
                whileInView={{ opacity:1, x:0 }}
                viewport={{ once:true, amount:0.3 }}
                transition={{ duration:0.55, delay:i*0.13 }}>

                {/* Number */}
                <div className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ background:`${color}12`, border:`1px solid ${color}25` }}>
                  <span className="font-display font-black" style={{ fontSize:15, color }}>{num}</span>
                </div>

                <div className="flex flex-col gap-1">
                  <h4 className="font-display font-black text-white" style={{ fontSize:14, letterSpacing:'0.04em' }}>{title}</h4>
                  <p className="text-slate-500 leading-relaxed" style={{ fontSize:12 }}>{desc}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Trust bar */}
          <motion.div
            className="mt-12 flex flex-wrap items-center justify-center gap-4"
            initial={{ opacity:0, y:12 }}
            whileInView={{ opacity:1, y:0 }}
            viewport={{ once:true }}
            transition={{ duration:0.5, delay:0.3 }}>
            {[
              { label:'GoodDollar', sub:'Identity & Rewards', color:'#22c55e' },
              { label:'Celo',       sub:'Blockchain',         color:'#a3e635' },
            ].map(({ label, sub, color }) => (
              <div key={label}
                className="flex items-center gap-2.5 rounded-xl px-4 py-2.5"
                style={{ background:'rgba(6,5,16,0.9)', border:`1px solid ${color}20` }}>
                <div className="w-2 h-2 rounded-full" style={{ background:color, boxShadow:`0 0 6px ${color}` }} />
                <div>
                  <p className="font-display font-black text-white" style={{ fontSize:11 }}>{label}</p>
                  <p style={{ fontSize:9, color:'rgba(100,116,139,0.6)', letterSpacing:'0.12em' }}>{sub}</p>
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          § 5  CTA FOOTER
      ═══════════════════════════════════════════════════════════ */}
      <section style={{ padding:'5rem 1.25rem 6rem', borderTop:'1px solid rgba(255,255,255,0.04)', position:'relative', overflow:'hidden' }}>

        {/* Background bloom */}
        <div className="absolute inset-0 pointer-events-none" style={{ background:'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(234,179,8,0.06), transparent 70%)' }} />

        <motion.div
          className="relative z-10 flex flex-col items-center text-center gap-4"
          style={{ maxWidth:480, margin:'0 auto' }}
          initial={{ opacity:0, y:28 }}
          whileInView={{ opacity:1, y:0 }}
          viewport={{ once:true, amount:0.4 }}
          transition={{ duration:0.7 }}>

          <p className="font-display font-bold uppercase"
            style={{ fontSize:10, letterSpacing:'0.48em', color:'rgba(234,179,8,0.55)' }}>
            One human. One fighter.
          </p>

          <h2 className="font-display font-black text-white leading-tight"
            style={{ fontSize:'clamp(2rem,7vw,3.4rem)', letterSpacing:'0.04em' }}>
            Your Fighter<br />Awaits
          </h2>

          <p className="text-slate-500 leading-relaxed" style={{ fontSize:13, maxWidth:340 }}>
            One human. One fighter. Every victory earns real TALLY on Celo. No bots. No alts. Only you.
          </p>

          <div className="w-full flex flex-col items-center gap-3 mt-2">
            <EnterButton onClick={login} delay={0.2} />
            <p className="uppercase" style={{ fontSize:8, letterSpacing:'0.36em', color:'rgba(71,85,105,0.55)' }}>
              Free to play · Powered by GoodDollar · Built on Celo
            </p>
          </div>
        </motion.div>

      </section>

    </div>
  )
}
