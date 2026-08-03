'use client'

import { useCallback, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Swords, Coins, Loader2, X, AlertTriangle } from 'lucide-react'
import { usePlayerStore } from '@/stores/usePlayerStore'
import { useResolvedAuth } from '@/hooks/useResolvedAuth'
import { useDuels, duelScore, type DuelRun, type DuelResult } from '@/hooks/useDuels'
import { equippedGunId, equippedAmmoId, equippedAttachments } from '@/lib/guns'
import { retryImport } from '@/lib/retryImport'
import LoadoutModal from '@/components/battle/LoadoutModal'
import LoadingScreen from '@/components/ui/LoadingScreen'

const HuntScene = dynamic(
  () => retryImport(() => import('@/engine/scene/HuntScene')).then((m) => m.HuntScene),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-2xl font-black text-white">LOADING DUEL…</div>
      </div>
    ),
  },
)

const short = (w: string) => `${w.slice(0, 6)}…${w.slice(-4)}`
/** Show the warrior, not the hex. Falls back to the address only when a duel row
 *  has no player record to name. */
const who = (name: string | null | undefined, wallet: string | null | undefined) =>
  name || (wallet ? short(wallet) : 'anyone')

/** One labelled figure in the stake-confirmation breakdown. */
function Row({ label, value, gold, strong }: {
  label: string; value: string; gold?: boolean; strong?: boolean
}) {
  return (
    <div className="flex items-center justify-between px-3.5 py-2.5">
      <span className="text-slate-400 text-xs">{label}</span>
      <span className={`text-sm tabular-nums ${gold ? 'text-hunt-gold' : 'text-white'} ${strong ? 'font-bold' : 'font-medium'}`}>
        {value}
      </span>
    </div>
  )
}

/**
 * DUELS — staked async score-duels.
 *
 * Both players run the SAME server-issued seed separately; the higher validated
 * score takes the pot minus the house cut. Deliberately not live PvP: nobody waits
 * for an opponent to be online, and there is no netcode to desync.
 *
 * The seed comes from the server on create/accept and is never chosen here — if a
 * challenger could pick it they would pick one they had already practised.
 */
export default function DuelsPage() {
  const { status, address } = useResolvedAuth()
  const router = useRouter()
  const player = usePlayerStore((s) => s.player)
  const inventory = usePlayerStore((s) => s.inventory)
  const { duels, loading, pending, signerReady, createDuel, acceptDuel, submitScore, cancelDuel } = useDuels(address)

  const [stake, setStake] = useState(1000)
  // The pending stake awaiting explicit confirmation. Nothing is charged until
  // the player acts on this.
  const [confirm, setConfirm] = useState<{ mode: 'create' | 'accept'; stake: number; id?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [run, setRun] = useState<DuelRun | null>(null)
  const [pickingLoadout, setPickingLoadout] = useState(false)
  const [fieldKit, setFieldKit] = useState<('light' | 'laser' | 'nvg')[]>([])
  const [playing, setPlaying] = useState(false)
  const [result, setResult] = useState<DuelResult | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const equippedGun = useMemo(() => equippedGunId(inventory), [inventory])
  const equippedAmmo = useMemo(() => equippedAmmoId(inventory), [inventory])
  const equippedMods = useMemo(() => equippedAttachments(inventory), [inventory])

  // Run tally. Waves and kills are counted here and turned into one score at the
  // end, so both sides are ranked by the identical formula.
  const [waves, setWaves] = useState(0)

  const beginRun = useCallback((r: DuelRun) => {
    setRun(r); setWaves(0); setResult(null); setPickingLoadout(true)
  }, [])

  const onCreate = useCallback(async (amount: number) => {
    setError(null)
    try { beginRun(await createDuel(amount)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not open the duel') }
  }, [createDuel, beginRun])

  const onAccept = useCallback(async (id: string, stakeG: number) => {
    setError(null)
    try { beginRun(await acceptDuel(id, stakeG)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not accept') }
  }, [acceptDuel, beginRun])

  // Submitting is the only moment money moves, so a failure here must be visible
  // and retryable rather than silently dropping the run on the floor.
  const finishRun = useCallback(async (finalWaves: number, finalKills: number) => {
    if (!run) return
    setPlaying(false)
    setSubmitting(true)
    setError(null)
    try {
      setResult(await submitScore(run.id, run.run_token, duelScore(finalWaves, finalKills)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit your score — try again')
    } finally { setSubmitting(false) }
  }, [run, submitScore])

  if (status === 'loading') return <LoadingScreen />
  if (status === 'unauthenticated' || !address) { router.replace('/'); return null }
  if (!player) { router.replace('/'); return null }

  // ── The run itself ─────────────────────────────────────────────────────────
  if (playing && run) {
    return (
      <div style={{ position: 'fixed', inset: 0 }}>
        <HuntScene
          endless={{
            seed: run.seed,
            startWave: 1,
            onWaveCleared: (wave: number) => setWaves(wave),
            // A duel is ONE life. The engine itself does NOT end the run on death
            // (Endless puts you back at the start of the wave), so the one-life rule
            // is enforced here by submitting and unmounting the scene. Without it the
            // duel would reward whoever retried longest rather than whoever played best.
            onDeath: (wave: number, stats: { kills: number; headshots: number }) => {
              void finishRun(Math.max(0, wave - 1), stats.kills)
            },
          }}
          walletAddress={address}
          accountRank={player.rank}
          accountXp={player.xp}
          equippedGun={equippedGun}
          equippedAmmo={equippedAmmo}
          equippedMods={equippedMods}
          fieldKit={fieldKit}
          onExit={() => { void finishRun(waves, 0) }}
        />
      </div>
    )
  }

  // Every figure below comes from the SERVER, never a second copy of the ladder
  // or the rate. If the deployed API is older than this UI it answers /duels
  // without them — and a screen that guessed would state one fee while the
  // server charged another. Refuse to render the staking flow at all instead.
  if (duels && (!Array.isArray(duels.stake_tiers) || typeof duels.house_cut_bps !== 'number')) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 px-6 text-center" style={{ background: '#04030c' }}>
        <p className="font-display font-black text-white text-lg">Duels are updating</p>
        <p className="text-slate-400 text-sm max-w-xs">
          The server is mid-deploy. Check back in a minute — nothing has been staked.
        </p>
        <button onClick={() => router.push('/')} className="mt-2 text-xs text-slate-500 hover:text-white transition-colors">
          Back
        </button>
      </div>
    )
  }

  const tiers = duels?.stake_tiers ?? []
  const cutBps = duels?.house_cut_bps ?? 50
  const cutLabel = `${(cutBps / 100).toFixed(cutBps % 100 === 0 ? 0 : 1)}%`
  const payoutFor = (s: number) => Math.floor((s * 2 * (10_000 - cutBps)) / 10_000)
  const poolCut = (s: number) => s * 2 - payoutFor(s)
  const myOpen = duels?.mine.find((d) => d.status === 'open' && d.challenger.toLowerCase() === address.toLowerCase())

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto px-5"
      style={{
        background: '#04030c',
        // Standalone PWA draws under the status bar and the home indicator, so
        // pad by the real insets rather than a guessed constant.
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.5rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2rem)',
      }}
    >
      <div className="max-w-lg mx-auto flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <Swords className="text-hunt-gold" size={22} />
          <div className="flex-1">
            <h1 className="font-display font-black text-white text-xl">Duels</h1>
            <p className="text-slate-400 text-xs mt-0.5">
              Both fighters run the same map. Higher score takes the pot.
            </p>
          </div>
          <button onClick={() => router.push('/')} className="text-slate-500 hover:text-white transition-colors" aria-label="Close duels">
            <X size={20} />
          </button>
        </div>

        <AnimatePresence>
          {error && (
            <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              role="alert" className="text-red-400 text-xs font-medium">{error}</motion.p>
          )}
        </AnimatePresence>

        {/* Signed in, but nothing can sign yet. Shown instead of letting someone
            pick a stake, confirm it, and only then hit a wallet error. */}
        {!signerReady && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/[0.06] px-4 py-3 flex flex-col gap-1">
            <p className="text-amber-300 text-sm font-bold">Wallet session not ready</p>
            <p className="text-slate-400 text-xs leading-relaxed">
              You&apos;re signed in, but your wallet can&apos;t sign right now — so staking is
              paused. This usually clears on reload; if it doesn&apos;t, sign out and back in.
            </p>
          </div>
        )}

        {/* ── Result card ──────────────────────────────────────────────────── */}
        {result && (
          <div className="rounded-xl border border-hunt-gold/40 bg-hunt-surface p-5 flex flex-col gap-2">
            {result.waiting_on_opponent ? (
              <>
                <p className="font-display font-black text-white text-lg">Score locked in</p>
                <p className="text-slate-400 text-sm">
                  Waiting for your opponent to run the same map. You&apos;ll be paid automatically if you win.
                </p>
              </>
            ) : result.draw ? (
              <>
                <p className="font-display font-black text-white text-lg">Draw</p>
                <p className="text-slate-400 text-sm">Identical scores — both stakes refunded in full, no cut taken.</p>
              </>
            ) : result.winner?.toLowerCase() === address.toLowerCase() ? (
              <>
                <p className="font-display font-black text-hunt-gold text-lg">You won</p>
                <p className="text-slate-300 text-sm">
                  +{result.winnings_g?.toLocaleString()} G$ · {result.challenger_score} vs {result.opponent_score}
                </p>
              </>
            ) : (
              <>
                <p className="font-display font-black text-white text-lg">You lost</p>
                <p className="text-slate-400 text-sm">{result.challenger_score} vs {result.opponent_score}</p>
              </>
            )}
            <button onClick={() => setResult(null)} className="mt-2 text-xs text-slate-500 hover:text-slate-300 self-start transition-colors">
              Back to duels
            </button>
          </div>
        )}

        {submitting && (
          <p className="flex items-center gap-2 text-slate-400 text-sm">
            <Loader2 className="animate-spin" size={14} /> Submitting your score…
          </p>
        )}

        {/* ── Open a duel ──────────────────────────────────────────────────── */}
        {!myOpen && !result && !confirm && (
          <div className="rounded-xl border border-hunt-border bg-hunt-surface p-5 flex flex-col gap-3">
            <p className="font-display font-black text-white text-sm uppercase tracking-wider">Open a duel</p>
            <p className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">
              Choose your stake
            </p>
            {/* Fixed amounts rather than a free number field: both players stake the
                SAME figure, so it has to come from one agreed ladder both sides see.
                The server enforces the same list. */}
            <div className="grid grid-cols-3 gap-2">
              {tiers.map((t) => (
                <button
                  key={t}
                  onClick={() => setStake(t)}
                  aria-pressed={stake === t}
                  className={`min-h-12 rounded-xl border font-bold text-sm transition-colors ${
                    stake === t
                      ? 'border-hunt-gold bg-hunt-gold/15 text-hunt-gold'
                      : 'border-hunt-border bg-hunt-surface-2 text-slate-300 hover:border-hunt-gold/50'
                  }`}
                >
                  {t.toLocaleString()}
                </button>
              ))}
            </div>
            <button
              onClick={() => setConfirm({ mode: 'create', stake })}
              disabled={pending || !signerReady}
              className="w-full min-h-12 rounded-xl bg-hunt-gold text-black font-bold text-sm hover:bg-hunt-gold-light transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
            >
              <Coins size={16} /> Review stake
            </button>
          </div>
        )}

        {/* ── Stake confirmation ───────────────────────────────────────────────
            The last screen before real G$ leaves the wallet. It exists so nobody
            can stake by reflex: the amount, what winning pays, what the pool keeps
            and what happens on a draw are all stated before the button that spends. */}
        {confirm && (
          <div className="rounded-xl border border-hunt-gold/50 bg-hunt-surface p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="text-hunt-gold shrink-0" size={16} />
              <p className="font-display font-black text-white text-sm uppercase tracking-wider">
                You are staking real G$
              </p>
            </div>

            <div className="rounded-xl bg-hunt-surface-2 border border-hunt-border divide-y divide-hunt-border">
              <Row label="Your stake" value={`${confirm.stake.toLocaleString()} G$`} strong />
              <Row label="Opponent stakes" value={`${confirm.stake.toLocaleString()} G$`} />
              <Row label="If you win" value={`+${payoutFor(confirm.stake).toLocaleString()} G$`} gold strong />
              <Row label="If you lose" value={`-${confirm.stake.toLocaleString()} G$`} />
              <Row label={`StillHunt pool (${cutLabel})`} value={`${poolCut(confirm.stake).toLocaleString()} G$`} />
            </div>

            <p className="text-slate-500 text-xs leading-relaxed">
              Your stake leaves your wallet now and is held until the duel resolves.
              Both fighters run the same map, one life each. A draw refunds both
              stakes in full and takes no cut.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setConfirm(null)} disabled={pending}
                className="flex-1 min-h-12 rounded-xl border border-hunt-border bg-hunt-surface-2 text-slate-300 font-bold text-sm hover:text-white transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const c = confirm
                  setConfirm(null)
                  if (c.mode === 'create') void onCreate(c.stake)
                  else void onAccept(c.id!, c.stake)
                }}
                disabled={pending}
                className="flex-1 min-h-12 rounded-xl bg-hunt-gold text-black font-bold text-sm hover:bg-hunt-gold-light transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {pending
                  ? <><Loader2 className="animate-spin" size={16} /> Staking…</>
                  : <>Stake {confirm.stake.toLocaleString()} G$</>}
              </button>
            </div>
          </div>
        )}

        {myOpen && (
          <div className="rounded-xl border border-hunt-gold/30 bg-hunt-surface p-5 flex flex-col gap-2">
            <p className="font-display font-black text-white text-sm uppercase tracking-wider">Your open duel</p>
            <p className="text-slate-400 text-sm">
              {myOpen.stake_g.toLocaleString()} G$ staked — waiting for someone to accept.
            </p>
            {/* Closing is a REFUND, not a payment, so it needs no signature and
                stays available even when the wallet can't sign. A real button
                rather than faint text — it is the only way out of an open duel,
                and it moves money back to the player. */}
            <button
              onClick={() => { setError(null); void cancelDuel(myOpen.id).catch((e) => setError(e.message)) }}
              disabled={pending}
              className="mt-1 w-full min-h-12 rounded-xl border border-hunt-border bg-hunt-surface-2 text-slate-200 font-bold text-sm hover:border-red-500/60 hover:text-red-300 transition-colors disabled:opacity-40"
            >
              {pending ? 'Closing…' : 'Close duel & refund my stake'}
            </button>
          </div>
        )}

        {/* ── Open duels to accept ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          <p className="font-display font-black text-white text-sm uppercase tracking-wider">Open challenges</p>
          {loading && <p className="text-slate-500 text-sm">Loading…</p>}
          {!loading && (duels?.open.length ?? 0) === 0 && (
            <p className="text-slate-500 text-sm">Nobody has an open duel. Open one and wait for a taker.</p>
          )}
          {duels?.open
            .filter((d) => d.challenger.toLowerCase() !== address.toLowerCase())
            .map((d) => (
              <div key={d.id} className="rounded-xl border border-hunt-border bg-hunt-surface-2/50 px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-sm truncate">{who(d.challenger_name, d.challenger)}</p>
                  <p className="text-slate-500 text-[11px]">
                    {d.stake_g.toLocaleString()} G$ · winner takes {d.winner_takes_g.toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => setConfirm({ mode: 'accept', stake: d.stake_g, id: d.id })}
                  disabled={pending || !signerReady}
                  className="shrink-0 px-4 min-h-10 rounded-lg bg-hunt-gold text-black font-bold text-xs hover:bg-hunt-gold-light transition-colors disabled:opacity-40"
                >
                  Accept
                </button>
              </div>
            ))}
        </div>

        {/* ── History ──────────────────────────────────────────────────────── */}
        {(duels?.mine.length ?? 0) > 0 && (
          <div className="flex flex-col gap-2">
            <p className="font-display font-black text-white text-sm uppercase tracking-wider">Your duels</p>
            {duels?.mine.map((d) => {
              const won = d.status === 'resolved' && d.winner?.toLowerCase() === address.toLowerCase()
              const drew = d.status === 'resolved' && !d.winner
              return (
                <div key={d.id} className="rounded-xl border border-hunt-border bg-hunt-surface-2/50 px-4 py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-300 text-sm truncate">
                      vs {who(d.opponent_name, d.opponent)} · {d.stake_g.toLocaleString()} G$
                    </p>
                    {d.status === 'resolved' && (
                      <p className="text-slate-500 text-[11px]">{d.challenger_score} — {d.opponent_score}</p>
                    )}
                  </div>
                  <span className={`shrink-0 text-[11px] font-bold uppercase tracking-wider ${
                    won ? 'text-hunt-gold' : drew ? 'text-slate-400' : d.status === 'resolved' ? 'text-slate-500' : 'text-slate-400'
                  }`}>
                    {d.status === 'resolved' ? (won ? 'Won' : drew ? 'Draw' : 'Lost') : d.status}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {pickingLoadout && run && (
          <LoadoutModal
            opName="Duel"
            label={`Loadout · ${run.stake_g.toLocaleString()} G$ staked`}
            cta="ENTER THE DUEL"
            walletAddress={address}
            onClose={() => setPickingLoadout(false)}
            onDeploy={(kit) => { setFieldKit(kit); setPickingLoadout(false); setPlaying(true) }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
