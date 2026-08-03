import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, Search, Trophy, HeartCrack, Copy, Check } from 'lucide-react'
import { shareCard } from '@/lib/shareCard'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

interface Props {
  walletAddress: string
  onBack: () => void
  prefillOpponent?: string
}

/** One row of the search dropdown. */
interface PlayerHit {
  wallet_address: string
  character_name: string
  username: string | null
  rank: string | null
}

interface ChallengeResult {
  winner: string
  xp_challenger: number
  xp_opponent: number
  battle_id: string
}

export default function ChallengeBattle({ walletAddress, onBack, prefillOpponent }: Props) {
  const [input, setInput] = useState(prefillOpponent ?? '')
  const [resolvedOpponent, setResolvedOpponent] = useState<string | null>(null)
  const [copiedShare, setCopiedShare] = useState(false)
  const [resolvedName, setResolvedName] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [fighting, setFighting] = useState(false)
  const [result, setResult] = useState<ChallengeResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Live search results. The old flow silently took results[0], so typing a name
  // two players shared challenged whichever the database happened to return
  // first — with no way to tell, and no way to pick the other one.
  const [hits, setHits] = useState<PlayerHit[]>([])
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  // Auto-resolve prefilled wallet from challenge link
  useEffect(() => {
    if (prefillOpponent && prefillOpponent.startsWith('0x')) {
      handleLookup(prefillOpponent)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function copyShareLink() {
    void shareCard(walletAddress)
      .then((outcome) => {
        if (outcome !== 'copied') return
        setCopiedShare(true)
        setTimeout(() => setCopiedShare(false), 2000)
      })
      .catch(() => {})
  }

  /** Commit one player as the opponent and close the list. */
  const choose = useCallback((hit: PlayerHit) => {
    setResolvedOpponent(hit.wallet_address)
    setResolvedName(hit.character_name)
    setInput(hit.username || hit.character_name)
    setHits([])
    setOpen(false)
    setError(null)
  }, [])

  // Debounced name search. Pasting an address skips this entirely — that path is
  // exact, so a dropdown of one would just be in the way.
  useEffect(() => {
    const q = input.trim()
    if (resolvedOpponent || q.length < 2 || q.startsWith('0x')) {
      setHits([])
      setOpen(false)
      return
    }
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API}/players/search?q=${encodeURIComponent(q)}&exclude=${walletAddress}`,
        )
        if (!res.ok || cancelled) return
        const rows = (await res.json()) as PlayerHit[]
        if (cancelled) return
        setHits(rows)
        setHighlight(0)
        setOpen(rows.length > 0)
      } catch {
        // A failed search is not an error worth shouting about — the player is
        // still typing, and the button path still reports a genuine miss.
      }
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [input, walletAddress, resolvedOpponent])

  // Clicking away closes the list without clearing what was typed.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  async function handleLookup(override?: string) {
    const query = override ?? input
    setError(null)
    setResolvedOpponent(null)

    if (!query.trim()) return

    const lookupAsAddress = query.startsWith('0x') && query.length === 42

    if (lookupAsAddress) {
      setSearching(true)
      const res = await fetch(`${API}/players/${query.toLowerCase()}`)
      setSearching(false)
      if (!res.ok) {
        setError('No player found at that address.')
        return
      }
      const data = await res.json()
      setResolvedOpponent(data.wallet_address)
      setResolvedName(data.character_name)
    } else {
      setSearching(true)
      const res = await fetch(`${API}/players/search?q=${encodeURIComponent(query)}&exclude=${walletAddress}`)
      setSearching(false)
      if (!res.ok) {
        setError(`No player named "${query}" found.`)
        return
      }
      const results = await res.json() as PlayerHit[]
      if (!results.length) {
        setError(`No player named "${query}" found.`)
        return
      }
      // Only auto-select when the match is unambiguous. With several matches the
      // old code picked results[0] silently, which could send a challenge to the
      // wrong person who happened to share a name — show the list and let the
      // player choose instead.
      if (results.length === 1) {
        choose(results[0])
      } else {
        setHits(results)
        setHighlight(0)
        setOpen(true)
      }
    }
  }

  async function handleChallenge() {
    if (!resolvedOpponent) return
    if (resolvedOpponent === walletAddress) {
      setError("You can't challenge yourself.")
      return
    }

    setFighting(true)
    setError(null)

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/battles/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenger_wallet: walletAddress,
          opponent_wallet: resolvedOpponent,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Challenge failed' }))
        throw new Error(body.error ?? 'Challenge failed')
      }

      const data: ChallengeResult = await res.json()
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Challenge failed')
    } finally {
      setFighting(false)
    }
  }

  const won = result?.winner.toLowerCase() === walletAddress.toLowerCase()

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-slate-500 hover:text-white transition-colors text-sm">
          ← Back
        </button>
        <h2 className="font-display font-bold text-white text-lg flex-1">Challenge a Player</h2>
        <button
          onClick={copyShareLink}
          className="flex items-center gap-1 text-xs font-bold transition-colors"
          style={{ color: copiedShare ? '#22c55e' : '#64748b' }}
          title="Copy your challenge link"
        >
          {copiedShare ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Share link</>}
        </button>
      </div>

      {result ? (
        <motion.div
          className="flex flex-col items-center gap-5 py-4"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          {won
            ? <Trophy size={56} className="text-hunt-gold" strokeWidth={1.2} />
            : <HeartCrack size={56} className="text-red-500" strokeWidth={1.2} />
          }
          <div className="text-center">
            <p className="text-2xl font-display font-bold text-white">
              {won ? 'Victory!' : 'Defeated'}
            </p>
            <p className="text-hunt-gold font-bold mt-1">+{won ? result.xp_challenger : result.xp_opponent} XP</p>
          </div>
          <p className="text-xs text-slate-500">
            vs {resolvedName} · Both player cards update in real-time
          </p>
          <button
            onClick={() => { setResult(null); setInput(''); setResolvedOpponent(null); setResolvedName(null) }}
            className="w-full py-3 bg-hunt-gold text-black font-bold rounded-xl hover:bg-hunt-gold-light transition-colors"
          >
            Challenge Again
          </button>
        </motion.div>
      ) : (
        <>
          <p className="text-sm text-slate-400 leading-relaxed">
            Enter a player name or address. The fight is simulated instantly based on stats —
            both players' XP updates via real-time.
          </p>

          {/* Input + live results */}
          <div className="flex gap-2 relative" ref={boxRef}>
            <div className="flex-1 relative">
              <input
                value={input}
                onChange={(e) => { setInput(e.target.value); setResolvedOpponent(null); setError(null) }}
                onFocus={() => { if (hits.length) setOpen(true) }}
                onKeyDown={(e) => {
                  // Arrow/Enter/Escape drive the list when it's open, so the
                  // dropdown is usable without a mouse.
                  if (open && hits.length) {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault(); setHighlight((h) => (h + 1) % hits.length); return
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault(); setHighlight((h) => (h - 1 + hits.length) % hits.length); return
                    }
                    if (e.key === 'Enter') {
                      e.preventDefault(); choose(hits[highlight]); return
                    }
                    if (e.key === 'Escape') { setOpen(false); return }
                  }
                  if (e.key === 'Enter') void handleLookup()
                }}
                placeholder="0x... or player name"
                role="combobox"
                aria-expanded={open}
                aria-autocomplete="list"
                aria-controls="challenge-player-list"
                className="w-full bg-hunt-surface-2 border border-hunt-border rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-hunt-gold/60 transition-colors"
              />

              <AnimatePresence>
                {open && hits.length > 0 && (
                  <motion.ul
                    id="challenge-player-list"
                    role="listbox"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.14 }}
                    className="absolute z-20 left-0 right-0 mt-1 rounded-xl border border-hunt-border bg-hunt-surface shadow-2xl overflow-hidden divide-y divide-hunt-border max-h-72 overflow-y-auto"
                  >
                    {hits.map((h, i) => (
                      <li key={h.wallet_address} role="option" aria-selected={i === highlight}>
                        <button
                          type="button"
                          onMouseEnter={() => setHighlight(i)}
                          onClick={() => choose(h)}
                          className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${
                            i === highlight ? 'bg-hunt-gold/10' : 'hover:bg-hunt-gold/[0.06]'
                          }`}
                        >
                          <span className="flex items-center justify-center w-8 h-8 shrink-0 rounded-lg bg-hunt-surface-2 border border-hunt-border">
                            <Users size={14} className="text-slate-300" />
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-white font-bold text-sm truncate">
                              {h.username || h.character_name}
                            </span>
                            {/* Two players can share a name, so always show the
                                address — it is the only thing that is unique. */}
                            <span className="block text-[11px] text-slate-500 truncate">
                              {h.username ? `${h.character_name} · ` : ''}
                              {h.wallet_address.slice(0, 6)}…{h.wallet_address.slice(-4)}
                            </span>
                          </span>
                          {h.rank && (
                            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-hunt-gold">
                              {h.rank}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>
            <motion.button
              onClick={() => void handleLookup()}
              disabled={searching || !input.trim()}
              whileTap={{ scale: 0.97 }}
              className="px-4 py-2.5 bg-hunt-surface-2 border border-hunt-border rounded-xl hover:border-hunt-gold/50 disabled:opacity-40 transition-colors"
            >
              {searching
                ? <motion.span className="w-4 h-4 rounded-full border-2 border-hunt-gold border-t-transparent inline-block" animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
                : <Search size={16} className="text-slate-400" />
              }
            </motion.button>
          </div>

          {/* Resolved player preview */}
          {resolvedOpponent && resolvedName && (
            <motion.div
              className="flex items-center gap-3 p-4 bg-hunt-surface-2 border border-hunt-gold/30 rounded-xl"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Users size={20} className="text-hunt-gold shrink-0" strokeWidth={1.5} />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white text-sm">{resolvedName}</p>
                <p className="text-xs text-slate-500 truncate">{resolvedOpponent}</p>
              </div>
              <span className="text-xs text-green-400 font-bold">Found</span>
            </motion.div>
          )}

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <motion.button
            onClick={handleChallenge}
            disabled={!resolvedOpponent || fighting}
            whileHover={resolvedOpponent ? { scale: 1.01 } : {}}
            whileTap={resolvedOpponent ? { scale: 0.98 } : {}}
            className="w-full py-3.5 bg-hunt-gold text-black font-bold rounded-xl hover:bg-hunt-gold-light disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {fighting ? (
              <span className="flex items-center justify-center gap-2">
                <motion.span className="w-4 h-4 rounded-full border-2 border-black border-t-transparent inline-block" animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
                Simulating...
              </span>
            ) : (
              'Send Challenge'
            )}
          </motion.button>
        </>
      )}
    </div>
  )
}
