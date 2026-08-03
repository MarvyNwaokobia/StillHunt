'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ShieldCheck, AlertTriangle, Skull } from 'lucide-react'
import { usePlayerStore } from '@/stores/usePlayerStore'
import { useFreezeDecay } from '@/hooks/useDecayActions'
import { getDecayTimeRemaining } from '@/utils/decay'
import { formatCountdown } from '@/utils/format'
import { DECAY_PENALIZE_HOURS, DECAY_WARNING_HOURS } from '@/lib/constants'

interface Props {
  walletAddress: string
}

export default function DecayPanel({ walletAddress }: Props) {
  const player = usePlayerStore((s) => s.player)
  const { mutate: freeze, isPending: isFreezing } = useFreezeDecay(walletAddress)
  const [freezeErrMsg, setFreezeErrMsg] = useState<string | null>(null)

  if (!player) return null

  const decayStatus   = player.decay_status
  const hoursUntilWarning = getDecayTimeRemaining(player.last_active)
  const isFrozen =
    player.decay_frozen_until &&
    new Date(player.decay_frozen_until) > new Date()

  if (isFrozen) {
    const frozenUntil = new Date(player.decay_frozen_until!)
    const msLeft = frozenUntil.getTime() - Date.now()
    return (
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck size={16} className="text-blue-300" />
          <p className="font-bold text-blue-300 text-sm">Decay Frozen</p>
        </div>
        <p className="text-xs text-slate-400">
          Protection active — expires in{' '}
          <span className="font-bold text-blue-300">{formatCountdown(msLeft)}</span>
        </p>
      </div>
    )
  }

  if (decayStatus === 'none') {
    return (
      <div className="bg-hunt-surface border border-hunt-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Decay Status</p>
          <span className="text-xs text-green-400 font-bold">Safe</span>
        </div>
        <p className="text-xs text-slate-500">
          Stay active to keep your character healthy. Warning triggers after{' '}
          {DECAY_WARNING_HOURS}h of inactivity.
        </p>
        <div className="mt-2 h-1 bg-hunt-surface-2 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-green-500"
            style={{
              width: `${Math.min(100, (hoursUntilWarning / DECAY_WARNING_HOURS) * 100)}%`,
            }}
          />
        </div>
      </div>
    )
  }

  if (decayStatus === 'warning') {
    return (
      <motion.div
        className="bg-orange-500/10 border border-orange-500/40 rounded-xl p-4"
        animate={{ borderColor: ['rgba(249,115,22,0.4)', 'rgba(249,115,22,0.8)', 'rgba(249,115,22,0.4)'] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <div className="flex items-center gap-2 mb-2">
          <motion.span animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}>
            <AlertTriangle size={16} className="text-orange-400" />
          </motion.span>
          <p className="font-bold text-orange-400 text-sm">Decay Warning</p>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Your character will lose a rank in{' '}
          <span className="font-bold text-orange-300">
            {formatCountdown((DECAY_PENALIZE_HOURS - DECAY_WARNING_HOURS) * 60 * 60 * 1000)}
          </span>
          . Battle or collect a mission to reset.
        </p>
        <p className="text-xs text-slate-500 mt-2">
          Or buy a Protection Shield from the Marketplace to freeze decay for 7 days.
        </p>
      </motion.div>
    )
  }

  // Active decay
  function handleFreeze() {
    setFreezeErrMsg(null)
    freeze(undefined, {
      onError: (e) => setFreezeErrMsg(e instanceof Error ? e.message : 'Failed to activate shield'),
    })
  }

  return (
    <motion.div
      className="bg-red-500/10 border border-red-500/40 rounded-xl p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="flex items-center gap-2 mb-2">
        <motion.span
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 0.8, repeat: Infinity }}
        >
          <Skull size={16} className="text-red-400" />
        </motion.span>
        <p className="font-bold text-red-400 text-sm">Active Decay</p>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed mb-3">
        Your character has lost a rank, and will keep losing one for every 3 days you
        stay away, down to Iron. Battle or complete a mission to stop the decay.
      </p>

      <button
        onClick={handleFreeze}
        disabled={isFreezing}
        className="w-full py-2 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors"
      >
        {isFreezing ? 'Activating...' : (
          <span className="flex items-center justify-center gap-1.5">
            <ShieldCheck size={13} /> Activate Protection Shield
          </span>
        )}
      </button>

      {freezeErrMsg && (
        <p className="text-xs text-red-400 mt-2 text-center">
          {freezeErrMsg.includes('No Protection Shield')
            ? 'You need a Protection Shield from the Marketplace.'
            : freezeErrMsg}
        </p>
      )}
    </motion.div>
  )
}
