'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LogOut, Copy, Check, ChevronDown } from 'lucide-react'
import { useResolvedAuth } from '@/hooks/useResolvedAuth'
import { useSignOut } from '@/hooks/useSignOut'
import SignInModal from './SignInModal'

function truncate(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

// Account chip: a tap opens a menu (copy / sign out) rather than signing out
// instantly — on mobile there's no hover, so a bare sign-out button logs people
// out the moment they tap to see their address.
function AccountMenu({ address, signOut }: { address: string; signOut: () => void }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('touchstart', onDown) }
  }, [open])

  async function copy() {
    try { await navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1400) } catch { /* ignore */ }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-300 hover:text-white transition-colors"
        style={{ background: 'rgba(26,26,40,0.8)', border: '1px solid rgba(42,42,58,0.8)' }}
      >
        <span className="font-mono">{truncate(address)}</span>
        <ChevronDown size={13} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 mt-2 w-44 rounded-xl overflow-hidden z-50 flex flex-col"
            style={{ background: '#14141e', border: '1px solid #2a2a3a', boxShadow: '0 10px 30px rgba(0,0,0,0.6)' }}
          >
            <button onClick={copy} className="flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-slate-300 hover:text-white hover:bg-white/5 transition-colors">
              {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
              {copied ? 'Copied' : 'Copy address'}
            </button>
            <button onClick={() => { setOpen(false); signOut() }} className="flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-red-400 hover:bg-red-500/10 transition-colors border-t" style={{ borderColor: '#2a2a3a' }}>
              <LogOut size={13} /> Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function ConnectButton() {
  const { status, address } = useResolvedAuth()
  const signOut = useSignOut()
  const [showModal, setShowModal] = useState(false)

  if (status === 'ready' && address) {
    return <AccountMenu address={address} signOut={signOut} />
  }

  return (
    <>
      <motion.button
        onClick={() => setShowModal(true)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        disabled={status === 'loading'}
        className="px-4 py-2 bg-hunt-gold text-black font-bold rounded-xl text-sm hover:bg-hunt-gold-light transition-colors shadow-[0_0_12px_rgba(234,179,8,0.25)] disabled:opacity-60"
      >
        Enter StillHunt
      </motion.button>
      <AnimatePresence>
        {showModal && <SignInModal onClose={() => setShowModal(false)} />}
      </AnimatePresence>
    </>
  )
}
