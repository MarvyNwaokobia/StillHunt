'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePlayerStore } from '@/stores/usePlayerStore'

interface Props {
  walletAddress: string
  onClose: () => void
}

type CheckState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/

export default function UsernameSetup({ walletAddress, onClose }: Props) {
  const updatePlayer = usePlayerStore(s => s.updatePlayer)
  const [value,    setValue]    = useState('')
  const [check,    setCheck]    = useState<CheckState>('idle')
  const [pending,  setPending]  = useState(false)
  const [saved,    setSaved]    = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!value) { setCheck('idle'); return }
    if (!USERNAME_RE.test(value)) { setCheck('invalid'); return }

    setCheck('checking')
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/players/${walletAddress}/username-available/${value}`,
        )
        const { available } = await res.json()
        setCheck(available ? 'available' : 'taken')
      } catch {
        setCheck('idle')
      }
    }, 500)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [value, walletAddress])

  async function handleSave() {
    if (check !== 'available' || pending) return
    setPending(true)
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/players/${walletAddress}`,
        {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ username: value }),
        },
      )
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}))
        if (error === 'Username already taken') { setCheck('taken'); return }
        return
      }
      const updated = await res.json()
      updatePlayer({ username: updated.username, display_name: updated.display_name })
      setSaved(true)
      setTimeout(onClose, 900)
    } finally {
      setPending(false)
    }
  }

  const statusColor = {
    idle:      'text-slate-500',
    checking:  'text-slate-400',
    available: 'text-green-400',
    taken:     'text-red-400',
    invalid:   'text-orange-400',
  }[check]

  const statusText = {
    idle:      'Letters, numbers, underscores · 3–20 chars',
    checking:  'Checking…',
    available: `@${value} is available`,
    taken:     `@${value} is already taken`,
    invalid:   'Letters, numbers and _ only · 3–20 chars',
  }[check]

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <motion.div
        className="relative w-full max-w-sm rounded-2xl border border-hunt-border bg-hunt-surface p-6 flex flex-col gap-5"
        initial={{ scale: 0.92, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 16 }}
      >
        <div>
          <h2 className="font-display font-black text-white text-xl">Choose your username</h2>
          <p className="text-slate-400 text-sm mt-1">
            How you appear on the leaderboard and in challenges.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold select-none">@</span>
            <input
              type="text"
              value={value}
              onChange={e => setValue(e.target.value.replace(/\s/g, ''))}
              placeholder="your_name"
              maxLength={20}
              className="w-full pl-7 pr-3 py-3 rounded-xl bg-hunt-surface-2 border border-hunt-border text-white font-display font-bold text-base placeholder:text-slate-600 focus:outline-none focus:border-hunt-gold/60 transition-colors"
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
              autoFocus
            />
          </div>
          <p className={`text-xs font-medium ${statusColor} min-h-[1rem]`}>{statusText}</p>
        </div>

        <AnimatePresence mode="wait">
          {saved ? (
            <motion.div
              key="saved"
              className="flex items-center justify-center gap-2 py-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 font-bold text-sm"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <span>✓</span> Username saved!
            </motion.div>
          ) : (
            <motion.button
              key="save"
              onClick={handleSave}
              disabled={check !== 'available' || pending}
              className="w-full py-3 rounded-xl font-display font-black uppercase tracking-widest text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: check === 'available' ? 'var(--color-hunt-gold, #c8a94b)' : 'rgba(255,255,255,0.06)',
                color:      check === 'available' ? '#000' : 'rgba(255,255,255,0.3)',
              }}
              whileHover={check === 'available' ? { scale: 1.02 } : undefined}
              whileTap={check === 'available' ? { scale: 0.98 } : undefined}
            >
              {pending ? 'Saving…' : 'Set Username'}
            </motion.button>
          )}
        </AnimatePresence>

        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-600 hover:text-slate-300 transition-colors"
          aria-label="Close"
        >
          ✕
        </button>
      </motion.div>
    </motion.div>
  )
}
