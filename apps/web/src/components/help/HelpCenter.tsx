'use client'

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, ChevronDown, HelpCircle, Send, BookOpen } from 'lucide-react'

import { TELEGRAM_URL as TELEGRAM } from '@/lib/constants'

interface QA { q: string; a: string }
interface Category { title: string; items: QA[] }

// FAQ, grouped and searchable. Kept faithful to how the app actually works (esp. anything
// GoodDollar/verification: we only ever reflect what GoodDollar says, never promise).
const FAQ: Category[] = [
  {
    title: 'Getting started',
    items: [
      { q: 'What is StillHunt?', a: 'A first-person tactical shooter where the fighting actually pays. Breach compounds, clear rooms, extract. Every kill earns XP, every rank earns TALLY, and that TALLY is real money in your wallet you can spend or send anywhere.' },
      { q: 'How do I sign in?', a: 'Tap ENTER STILLHUNT. Three ways in: Continue with Google (easiest: one tap and we make the wallet for you), Continue with Email (we send a code), or Connect a wallet (MetaMask or similar). Not sure? Use Google.' },
      { q: 'Do I need to know crypto?', a: 'No. Sign in with Google and never think about it. A wallet is created for you behind the scenes. Crypto only comes up if you choose to send your TALLY out to another wallet.' },
      { q: 'What is TALLY?', a: 'TALLY (GoodDollar) is real money on the Celo network. You earn it by playing, claim it free every day, spend it in the Armoury, or send it out to any wallet.' },
    ],
  },
  {
    title: 'Verification',
    items: [
      { q: 'Why do I have to verify?', a: 'StillHunt pays real money, so every player has to be a real, unique person, otherwise bots and farmed accounts would drain the rewards meant for real players. That integrity is what the whole game stands on. One human, one warrior.' },
      { q: 'What is the verification?', a: 'A quick GoodDollar identity check. Under 60 seconds, free. Your data stays with GoodDollar, not with us. Verifying also unlocks your daily free TALLY claim.' },
      { q: 'Why am I being asked to verify again?', a: "Verification is run by GoodDollar, not StillHunt. We only ever show you what GoodDollar reports. If you're prompted to verify again, it's because GoodDollar's system currently shows your wallet needs it. If this keeps happening, message us on Telegram with your wallet and we'll look into it." },
      { q: 'I already verified, but the app still says verify.', a: "Try the Verify button once more; an already-verified wallet passes straight through. If it persists, it's coming from GoodDollar's side. Reach out on Telegram and we'll investigate your specific wallet." },
    ],
  },
  {
    title: 'Daily TALLY (free UBI)',
    items: [
      { q: 'What is the daily TALLY?', a: "GoodDollar UBI: free TALLY you can claim every day, just for being verified. It's separate from what you earn playing." },
      { q: 'Where do I claim it?', a: 'Profile → Bank → Daily TALLY. Tap it once a day.' },
      { q: 'When can I claim again?', a: "Once per day. After you claim, the Bank shows the next time you can claim, and that time comes straight from GoodDollar, we don't guess it." },
    ],
  },
  {
    title: 'Earning & ranks',
    items: [
      { q: 'How do I earn TALLY by playing?', a: 'Three ways: clearing a campaign operation for the first time pays 10 TALLY, every wave you clear in Endless pays 10 TALLY, and every rank-up pays 200 TALLY. Daily UBI is on top of all that.' },
      { q: 'How do ranks work?', a: 'The ladder is Drifter → Tracker → Stalker → Marksman → Ranger → Ghost → Apex, and each rank-up pays 200 TALLY. Later ranks take more XP than earlier ones, so the climb gets longer as you go. Past Apex you prestige (Apex II, III, and up). Your XP never stops counting or paying.' },
      { q: 'How much XP do fights give?', a: 'Non-campaign fights: Win = +100 XP, Loss = +30 XP. Campaign operations have their own XP per op. You never walk away with nothing.' },
      { q: 'Why did replaying an operation pay no TALLY?', a: 'The first-clear bounty pays once per operation, the first time you clear it. Replays still give XP, but not the bounty again. To earn more op bounties, clear the next operation.' },
    ],
  },
  {
    title: 'Armoury (marketplace)',
    items: [
      { q: 'What can I buy?', a: 'Guns, ammo, attachments, field kit, shields and boosters, all with your TALLY. Every item is on-chain, so you genuinely own it.' },
      { q: 'Can I buy and sell with other players?', a: "Yes. Scroll past the shop to Player Listings: buy another player's gear, or list your own and make TALLY off it." },
      { q: 'Does gear matter?', a: 'Yes. Before you deploy on an operation you pick your loadout from what you own, so what you buy changes how you fight. Buy a better gun before the Rift. You will want it.' },
    ],
  },
  {
    title: 'Bank & cashing out',
    items: [
      { q: 'Where is my money?', a: 'Profile → Bank. Your TALLY balance, a full ledger (earned from UBI, earned from gameplay, spent in the market, sent out), the daily claim, and Transfer TALLY Out.' },
      { q: 'How do I send my TALLY out?', a: 'Bank → Transfer TALLY Out. Your TALLY is real crypto on Celo, so it travels between wallet addresses (a long string starting with 0x). Copy and paste the destination address. Never type it by hand. Send a small amount the first time. If you send to a wrong address, it is gone and nobody can reverse it.' },
      { q: 'Can I send TALLY straight to Bybit / an exchange?', a: 'No. TALLY is not listed on Bybit, Binance or other exchanges, and sending it to an exchange deposit address will lose it. To reach an exchange you must first send TALLY to your own wallet (e.g. MetaMask on the Celo network), swap it there, then send that.' },
    ],
  },
  {
    title: 'Troubleshooting',
    items: [
      { q: 'My balance looks off.', a: "The Bank ledger tracks what happened inside StillHunt. Your on-chain wallet balance reflects everything, including TALLY you received or claimed outside the app, so the two can differ. Nothing is lost." },
      { q: 'The game or a claim is stuck.', a: 'Reload the page first. If a payout is on the way, the Bank shows it as pending and it settles on its own. If something still looks wrong, message us on Telegram.' },
      { q: 'I have a question that is not here.', a: 'Ask the community and the team directly on Telegram (link below).' },
    ],
  },
]

// The full walkthrough, mirrored from the community pin: the step-by-step from sign-in
// to your first payout.
const WALKTHROUGH: { step: string; title: string; body: string }[] = [
  { step: '1', title: 'Getting in', body: 'Hit ENTER STILLHUNT. Continue with Google (easiest), Email, or connect a wallet. All three land in the same place.' },
  { step: '2', title: 'Verify', body: "A quick verification, under 60 seconds, free. It confirms you're a real, unique person, and that's the integrity the game stands on. It also unlocks your daily free TALLY." },
  { step: '3', title: 'Forge your warrior', body: 'Pick a class: Berserker (raw power), Sentinel (defense + counters), or Phantom (speed, strikes first). Then name your warrior and grab an @username.' },
  { step: '4', title: 'Fight', body: 'On the FIGHT tab: Campaign (15 first-person operations across Ashfall, the Proving Ground and the Rift), Challenge a Player, Live PvP, and Endless survival. Win = +100 XP, Loss = +30 XP.' },
  { step: '5', title: 'XP & ranks', body: 'XP ranks you up, and every rank-up pays 200 TALLY. Drifter → Tracker → Stalker → Marksman → Ranger → Ghost → Apex, then prestige past Apex. Later ranks cost more XP than earlier ones. Rank up and you join that tier’s reward pool.' },
  { step: '6', title: 'Armoury', body: 'Spend TALLY on guns, ammo, attachments, field kit, shields and boosters. Every item is on-chain, so you own it. Player Listings let you trade gear with other players.' },
  { step: '7', title: 'Bank', body: 'Profile → Bank is where the money lives: your balance and ledger, the daily TALLY claim, your rank reward pool, and Transfer TALLY Out to cash out to any wallet.' },
]

function Accordion({ q, a }: QA) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border overflow-hidden" style={{ background: 'rgba(8,8,14,0.6)', borderColor: 'rgba(42,42,58,0.8)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left"
      >
        <span className="font-bold text-white text-sm">{q}</span>
        <ChevronDown size={16} className="shrink-0 text-slate-500 transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <p className="px-4 pb-4 text-sm text-slate-400 leading-relaxed">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function HelpCenter() {
  const [query, setQuery] = useState('')
  const [showWalkthrough, setShowWalkthrough] = useState(false)

  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!q) return FAQ
    return FAQ
      .map(c => ({ ...c, items: c.items.filter(i => (i.q + ' ' + i.a).toLowerCase().includes(q)) }))
      .filter(c => c.items.length > 0)
  }, [q])

  const noResults = q.length > 0 && filtered.length === 0

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.25)' }}>
          <HelpCircle size={22} className="text-amber-400" strokeWidth={1.8} />
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-[0.3em] font-bold text-amber-500/60 mb-0.5">StillHunt</p>
          <h1 className="font-display font-black text-white text-2xl tracking-wide">Help Center</h1>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search for an answer…"
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-black/30 border text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 transition-colors"
          style={{ borderColor: 'rgba(42,42,58,0.8)' }}
        />
      </div>

      {/* FAQ */}
      {!noResults && filtered.map(cat => (
        <section key={cat.title} className="flex flex-col gap-2.5">
          <h2 className="text-[11px] uppercase tracking-[0.28em] font-bold text-slate-500 px-1">{cat.title}</h2>
          {cat.items.map(item => <Accordion key={item.q} {...item} />)}
        </section>
      ))}

      {noResults && (
        <div className="rounded-2xl border p-6 text-center flex flex-col items-center gap-3"
          style={{ background: 'rgba(8,8,14,0.6)', borderColor: 'rgba(42,42,58,0.8)' }}>
          <p className="text-slate-400 text-sm">No answer found for “{query}”.</p>
          <a href={TELEGRAM} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-sm text-black"
            style={{ background: '#eab308' }}>
            <Send size={15} /> Ask on Telegram
          </a>
        </div>
      )}

      {/* Full walkthrough */}
      {!q && (
        <section className="flex flex-col gap-2.5">
          <button
            onClick={() => setShowWalkthrough(s => !s)}
            className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3.5"
            style={{ background: 'rgba(234,179,8,0.05)', borderColor: 'rgba(234,179,8,0.22)' }}
          >
            <span className="flex items-center gap-2.5 font-bold text-white text-sm">
              <BookOpen size={16} className="text-amber-400" /> Full walkthrough: sign-in to your first payout
            </span>
            <ChevronDown size={16} className="shrink-0 text-amber-500/70 transition-transform" style={{ transform: showWalkthrough ? 'rotate(180deg)' : 'none' }} />
          </button>
          <AnimatePresence initial={false}>
            {showWalkthrough && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }} className="flex flex-col gap-2.5 overflow-hidden"
              >
                {WALKTHROUGH.map(w => (
                  <div key={w.step} className="flex gap-3.5 rounded-xl border p-4"
                    style={{ background: 'rgba(8,8,14,0.6)', borderColor: 'rgba(42,42,58,0.8)' }}>
                    <div className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center font-display font-black text-sm"
                      style={{ background: 'rgba(234,179,8,0.12)', color: '#eab308', border: '1px solid rgba(234,179,8,0.3)' }}>
                      {w.step}
                    </div>
                    <div>
                      <p className="font-display font-black text-white text-sm">{w.title}</p>
                      <p className="text-slate-400 text-sm mt-0.5 leading-relaxed">{w.body}</p>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}

      {/* Telegram CTA, always at the bottom */}
      <div className="rounded-2xl border p-5 flex flex-col sm:flex-row items-center justify-between gap-4"
        style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.08), rgba(4,3,12,0.9))', borderColor: 'rgba(234,179,8,0.25)' }}>
        <div className="text-center sm:text-left">
          <p className="font-display font-black text-white text-base">Still stuck?</p>
          <p className="text-slate-400 text-sm mt-0.5">Ask the community and the team directly.</p>
        </div>
        <a href={TELEGRAM} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-sm text-black shrink-0"
          style={{ background: '#eab308' }}>
          <Send size={15} /> Join us on Telegram
        </a>
      </div>
    </div>
  )
}
