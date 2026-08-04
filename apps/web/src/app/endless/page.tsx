'use client';

import { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Rajdhani } from 'next/font/google';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useResolvedAuth } from '@/hooks/useResolvedAuth';
import { useEndlessProgress } from '@/hooks/useEndlessProgress';
import { equippedGunId, equippedAmmoId, equippedAttachments } from '@/lib/guns';
import { retryImport } from '@/lib/retryImport';
import { AnimatePresence } from 'framer-motion';
import LoadoutModal from '@/components/battle/LoadoutModal';
import WaveBoard from '@/components/battle/WaveBoard';

const tactical = Rajdhani({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-tactical',
  display: 'swap',
});

const HuntScene = dynamic(
  () => retryImport(() => import('@/engine/scene/HuntScene')).then((m) => m.HuntScene),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-2xl font-black text-white">LOADING ENDLESS…</div>
      </div>
    ),
  }
);

/** Ops that must be cleared before Endless opens. */
const UNLOCK_LEVEL = 15;

/**
 * CAMPAIGN ENDLESS — the generated room chain as a permanent career mode.
 *
 * Unlocked by finishing the 15-op campaign. Unlike the Seasonal Campaign this has no
 * window and no prize: it is one long progression that persists forever. Same rules
 * otherwise — quitting costs nothing, dying restarts the wave you were on, and the
 * board ranks waves completed.
 *
 * (This route used to host the old 1v1 duel arena, which was never the tactical
 * gameplay it claimed to be. That is what this replaces.)
 */
export default function EndlessPage() {
  const player = usePlayerStore((s) => s.player);
  const inventory = usePlayerStore((s) => s.inventory);
  const { address } = useResolvedAuth();
  const router = useRouter();
  const progress = useEndlessProgress(address); // no season id → Campaign Endless

  const [playing, setPlaying] = useState(false);
  const [startWave, setStartWave] = useState(1);
  const [pickingLoadout, setPickingLoadout] = useState(false);
  const [fieldKit, setFieldKit] = useState<('light' | 'laser' | 'nvg')[]>([]);

  const equippedGun = useMemo(() => equippedGunId(inventory), [inventory]);
  const equippedAmmo = useMemo(() => equippedAmmoId(inventory), [inventory]);
  const equippedMods = useMemo(() => equippedAttachments(inventory), [inventory]);

  // The chain's layout seed. Campaign Endless is a personal career rather than a
  // contest, so it is seeded PER PLAYER: your compound is yours, and nobody can
  // memorise someone else's route.
  const seed = useMemo(() => {
    const w = (address ?? 'stillhunt').toLowerCase();
    let h = 2166136261 >>> 0;
    for (let i = 0; i < w.length; i++) { h ^= w.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }, [address]);

  const begin = useCallback(() => setPickingLoadout(true), []);

  const enterWithLoadout = useCallback(async (kit: ('light' | 'laser' | 'nvg')[]) => {
    setPickingLoadout(false);
    setFieldKit(kit);
    const resume = await progress.start();
    setStartWave(resume);
    setPlaying(true);
  }, [progress]);

  const onWaveCleared = useCallback(() => { void progress.clearWave(); }, [progress]);
  const onDeath = useCallback((wave: number) => { void progress.reportDeath(wave); }, [progress]);

  if (!player) {
    router.replace('/');
    return null;
  }

  const cleared = player.pve_level ?? 0;
  const locked = cleared < UNLOCK_LEVEL;

  if (playing) {
    return (
      <div className={tactical.variable} style={{ position: 'fixed', inset: 0 }}>
        <HuntScene
          endless={{ seed, startWave, onWaveCleared, onDeath }}
          walletAddress={address}
          accountRank={player.rank}
          accountXp={player.xp}
          equippedGun={equippedGun}
          equippedAmmo={equippedAmmo}
          equippedMods={equippedMods}
          fieldKit={fieldKit}
          onExit={() => setPlaying(false)}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex flex-col items-center px-6 py-10" style={{ background: '#04030c' }}>
      <AnimatePresence>
        {pickingLoadout && (
          <LoadoutModal
            opName="Campaign Endless"
            label={`Loadout · Wave ${progress.wave}`}
            cta="BEGIN"
            walletAddress={address}
            onClose={() => setPickingLoadout(false)}
            onDeploy={enterWithLoadout}
          />
        )}
      </AnimatePresence>

      <div className="w-full max-w-2xl">
        <button onClick={() => router.push('/battle')} className="text-slate-400 hover:text-white text-sm mb-6">
          ← Fight
        </button>

        <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-amber-500 mb-1">Campaign Endless</p>
        <h1 className="font-display font-black text-white text-3xl tracking-wide mb-1">No Exit</h1>
        <p className="text-slate-500 text-sm mb-6">breach · clear · push forward · it does not end</p>

        {locked ? (
          <div className="p-6 rounded-2xl border text-center mb-8" style={{ background: 'rgba(8,8,14,0.9)', borderColor: 'rgba(42,42,58,0.8)' }}>
            <p className="text-white font-display font-black text-lg mb-1">Locked</p>
            <p className="text-slate-500 text-sm">
              Clear all {UNLOCK_LEVEL} campaign operations to open Endless.
              <br />
              <span className="text-amber-500/80">{cleared} / {UNLOCK_LEVEL} cleared</span>
            </p>
            <button
              onClick={() => router.push('/fight')}
              className="mt-4 px-5 py-2.5 rounded-xl font-display font-black text-black"
              style={{ background: '#eab308' }}
            >
              Continue the Campaign
            </button>
          </div>
        ) : (
          <>
            {progress.wave > 1 && (
              <motion.div
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                className="mb-6 p-5 rounded-2xl border text-center"
                style={{ background: 'rgba(234,179,8,0.06)', borderColor: 'rgba(234,179,8,0.3)' }}
              >
                <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-amber-500 mb-1">Your progress</p>
                <h2 className="font-display font-black text-white" style={{ fontSize: 'clamp(2.5rem, 10vw, 4rem)' }}>
                  {progress.wave - 1}
                </h2>
                <p className="text-slate-400 text-sm">waves completed · resuming on wave {progress.wave}</p>
              </motion.div>
            )}

            <p className="text-slate-600 text-xs mb-6 leading-relaxed">
              Rooms upon rooms, and no end to them. Leave whenever you like and come back
              on the wave you left. Dying only sends you to the start of your current wave,
              never back to the beginning. Every wave cleared pays TALLY.
            </p>

            <button
              onClick={begin}
              className="w-full px-6 py-4 rounded-xl font-display font-black text-black"
              style={{ background: '#eab308' }}
            >
              {progress.wave > 1 ? `Continue — Wave ${progress.wave}` : 'Begin'}
            </button>
          </>
        )}

        <div className="mt-10">
          <WaveBoard highlightWallet={address} title="Endless · Waves Cleared" />
        </div>
      </div>
    </div>
  );
}
