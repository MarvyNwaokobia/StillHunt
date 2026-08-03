'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, Lock, Skull, Check, ChevronRight, Infinity as InfinityIcon } from 'lucide-react'
import type { Player } from '@/types'
import { CAMPAIGN } from '@/engine/fps/campaign'
import { tryFullscreen } from '@/lib/fullscreen'
import { warmFightScene } from '@/lib/retryImport'
import LoadoutModal from './LoadoutModal'

interface Props {
  player: Player
  onBack: () => void
}

const ZONE_ACCENT: Record<string, string> = {
  ASHFALL: '#ff9d5c',
  'PROVING GROUND': '#8fc8e6',
  'THE RIFT': '#9a6bff',
}

/**
 * The first-person Campaign select — the Operations board, OUTSIDE the game.
 * Pick an operation here and the game boots straight into it (/fight?op=i). The
 * next playable op is pve_level; cleared ops are replayable, later ones locked.
 */
export default function OperationsSelect({ player, onBack }: Props) {
  const router = useRouter()
  const cleared = player.pve_level ?? 0 // number of ops cleared
  const endlessUnlocked = cleared >= CAMPAIGN.length

  // The player is on the Operations board — a fight is imminent. Warm the heavy
  // scene chunk now (on idle) so Deploy hits a warm cache, while they still have
  // an op + loadout to pick. Only players heading into a fight pay the download.
  useEffect(() => { warmFightScene() }, [])

  // Picking an op opens the Loadout first (choose weapon + gear from what you own),
  // then Deploy boots the fight with that kit.
  const [loadoutOp, setLoadoutOp] = useState<number | null>(null)

  const deploy = (i: number, kit: string[]) => {
    tryFullscreen()               // best-effort; must never block the navigation below
    const kitParam = kit.length ? `&kit=${kit.join(',')}` : ''
    router.push(`/fight?op=${i}${kitParam}`)
  }

  // group by zone in campaign order
  const zones: { zone: string; ops: { m: (typeof CAMPAIGN)[number]; i: number }[] }[] = []
  CAMPAIGN.forEach((m, i) => {
    const last = zones[zones.length - 1]
    if (last && last.zone === m.zone) last.ops.push({ m, i })
    else zones.push({ zone: m.zone, ops: [{ m, i }] })
  })

  return (
    <div className="min-h-screen px-4 py-6" style={{ background: '#04060a' }}>
      <div className="max-w-2xl mx-auto">
        <button onClick={onBack} className="flex items-center gap-1 text-slate-400 hover:text-white text-sm mb-4">
          <ChevronLeft size={16} /> Back
        </button>

        <div className="mb-5">
          <p className="text-[10px] uppercase tracking-[0.3em] font-bold mb-1" style={{ color: '#37d0e0' }}>Campaign</p>
          <h1 className="font-display font-black text-white text-3xl">Operations</h1>
          <p className="text-slate-500 text-sm mt-1">
            {cleared}/{CAMPAIGN.length} cleared · clear each operation to unlock the next
          </p>
        </div>

        {zones.map(({ zone, ops }) => {
          const zAccent = ZONE_ACCENT[zone] ?? '#37d0e0'
          return (
            <div key={zone} className="mb-5">
              <p className="text-[11px] uppercase tracking-[0.28em] font-bold mb-2.5" style={{ color: zAccent }}>{zone}</p>
              <div className="flex flex-col gap-2.5">
                {ops.map(({ m, i }) => {
                  const isCleared = i < cleared
                  const isNext = i === cleared
                  const locked = i > cleared
                  const accent = m.boss ? '#e0455a' : isNext ? '#37d0e0' : '#5a7184'
                  return (
                    <motion.button
                      key={m.id}
                      onClick={() => !locked && setLoadoutOp(i)}
                      disabled={locked}
                      whileHover={locked ? undefined : { scale: 1.01 }}
                      whileTap={locked ? undefined : { scale: 0.99 }}
                      className="group relative overflow-hidden p-4 rounded-xl border text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ background: 'rgba(8,10,16,0.9)', borderColor: isNext ? `${accent}80` : 'rgba(42,42,58,0.8)' }}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className="w-11 h-11 rounded-lg flex items-center justify-center font-display font-black text-lg shrink-0"
                          style={{ background: `${accent}1a`, color: accent, border: `1px solid ${accent}44` }}
                        >
                          {locked ? <Lock size={18} /> : isCleared ? <Check size={20} /> : i + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold tracking-wider text-slate-600">OP {i + 1}</span>
                            <p className="font-display font-black text-white text-base truncate">{m.name}</p>
                            {m.boss && <Skull size={14} className="text-red-400 shrink-0" />}
                          </div>
                          <p className="text-slate-500 text-xs mt-0.5">
                            {locked ? 'Clear the previous operation to unlock' : m.brief}
                          </p>
                        </div>
                        {!locked && (
                          <span className="text-[10px] font-black uppercase tracking-wider shrink-0 flex items-center gap-1"
                            style={{ color: isNext ? accent : '#5a7184' }}>
                            {isCleared ? 'Replay' : 'Play'} <ChevronRight size={13} />
                          </span>
                        )}
                      </div>
                    </motion.button>
                  )
                })}
              </div>
            </div>
          )
        })}
        {/* ── After the last operation ──
            Endless is the campaign's continuation, not a sibling of it: same rooms,
            same doorkicker, simply no extraction. It belongs at the bottom of this
            list where a player finishing op 15 will actually find it. */}
        <div className="mb-5">
          <p className="text-[11px] uppercase tracking-[0.28em] font-bold mb-2.5" style={{ color: '#eab308' }}>
            After the Campaign
          </p>
          <motion.button
            onClick={() => endlessUnlocked && router.push('/endless')}
            disabled={!endlessUnlocked}
            whileHover={endlessUnlocked ? { scale: 1.01 } : undefined}
            whileTap={endlessUnlocked ? { scale: 0.99 } : undefined}
            className="w-full group relative overflow-hidden p-4 rounded-xl border text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'rgba(8,10,16,0.9)',
              borderColor: endlessUnlocked ? 'rgba(234,179,8,0.5)' : 'rgba(42,42,58,0.8)',
            }}
          >
            <div className="flex items-center gap-4">
              <div
                className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: 'rgba(234,179,8,0.1)', color: '#eab308', border: '1px solid rgba(234,179,8,0.27)' }}
              >
                {endlessUnlocked ? <InfinityIcon size={20} /> : <Lock size={18} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold tracking-wider text-slate-600">ENDLESS</span>
                  <p className="font-display font-black text-white text-base truncate">No Exit</p>
                </div>
                <p className="text-slate-500 text-xs mt-0.5">
                  {endlessUnlocked
                    ? 'The rooms keep coming · resume anytime · every wave pays G$'
                    : `Clear all ${CAMPAIGN.length} operations to unlock (${cleared} / ${CAMPAIGN.length})`}
                </p>
              </div>
              {endlessUnlocked && (
                <span className="text-[10px] font-black uppercase tracking-wider shrink-0 flex items-center gap-1" style={{ color: '#eab308' }}>
                  Enter <ChevronRight size={13} />
                </span>
              )}
            </div>
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {loadoutOp !== null && (
          <LoadoutModal
            opIndex={loadoutOp}
            opName={CAMPAIGN[loadoutOp].name}
            walletAddress={player.wallet_address}
            onClose={() => setLoadoutOp(null)}
            onDeploy={(kit) => deploy(loadoutOp, kit)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
