'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useResolvedAuth } from '@/hooks/useResolvedAuth';
import { useSeasonalRun } from '@/hooks/useSeasonalRun';
import { useEndlessProgress } from '@/hooks/useEndlessProgress';
import WaveBoard from '@/components/battle/WaveBoard';
import { equippedGunId, equippedAmmoId, equippedAttachments } from '@/lib/guns';
import { retryImport } from '@/lib/retryImport';
import { AnimatePresence } from 'framer-motion';
import LoadoutModal from '@/components/battle/LoadoutModal';
import { Rajdhani } from 'next/font/google';

// The tactical HUD face, same as /fight — exposed as a CSS var for the scene.
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
        <div className="text-2xl font-black text-white">LOADING SEASON…</div>
      </div>
    ),
  }
);

/** Countdown text for a future timestamp. */
function untilText(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'now';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function SeasonalPage() {
  const player = usePlayerStore((s) => s.player);
  const inventory = usePlayerStore((s) => s.inventory);
  const { address } = useResolvedAuth();
  const router = useRouter();
  const { season, board, loading, refresh } = useSeasonalRun(address);
  const progress = useEndlessProgress(address, season?.id);

  // 'lobby' → the season card + board. 'run' → the fight. There is no result screen:
  // dying no longer ends anything, it puts you back at the start of your wave.
  const [phase, setPhase] = useState<'lobby' | 'run'>('lobby');
  const [seed, setSeed] = useState<number | null>(null);
  const [startWave, setStartWave] = useState(1);
  // The loadout picker stands between the lobby and the fight, exactly as it does
  // for a campaign op — you choose the weapon you carry in, not whatever happened
  // to be equipped last.
  const [pickingLoadout, setPickingLoadout] = useState(false);
  const [fieldKit, setFieldKit] = useState<('light' | 'laser' | 'nvg')[]>([]);
  const [, setTick] = useState(0); // drives the once-a-second countdown re-render

  const equippedGun = useMemo(() => equippedGunId(inventory), [inventory]);
  const equippedAmmo = useMemo(() => equippedAmmoId(inventory), [inventory]);
  const equippedMods = useMemo(() => equippedAttachments(inventory), [inventory]);

  // Re-render once a second so the countdown moves and the season flips live on time
  // without anyone reloading the page.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Enter the season. The server hands back the shared layout seed and the wave this
  // player resumes on — quitting never costs progress, so this is usually not 1.
  // Open the picker first; entering happens once a loadout is confirmed.
  const begin = useCallback(() => {
    if (!season?.active || season.seed == null) return;
    setPickingLoadout(true);
  }, [season]);

  const enterWithLoadout = useCallback(async (kit: ('light' | 'laser' | 'nvg')[]) => {
    if (!season || season.seed == null) return;
    setPickingLoadout(false);
    setFieldKit(kit);
    const resume = await progress.start();
    setSeed(season.seed);
    setStartWave(resume);
    setPhase('run');
  }, [season, progress]);

  // A wave was cleared: the server credits it, pays the TALLY and records the win.
  const onWaveCleared = useCallback(() => { void progress.clearWave(); }, [progress]);

  // Death records the loss on chain. It does NOT end the run — the scene puts the
  // player back at the start of the wave they were on.
  const onDeath = useCallback((wave: number) => { void progress.reportDeath(wave); }, [progress]);

  // Leaving banks nothing extra: every cleared wave was already saved as it happened,
  // so the board is up to date the moment they walk away.
  const leave = useCallback(() => { setPhase('lobby'); void refresh(); }, [refresh]);

  if (!player) {
    router.replace('/');
    return null;
  }

  if (phase === 'run' && seed !== null) {
    return (
      <div className={tactical.variable} style={{ position: 'fixed', inset: 0 }}>
        <HuntScene
          seasonal
          endless={{ seed, startWave, onWaveCleared, onDeath }}
          walletAddress={address}
          accountRank={player.rank}
          accountXp={player.xp}
          equippedGun={equippedGun}
          equippedAmmo={equippedAmmo}
          equippedMods={equippedMods}
          fieldKit={fieldKit}
          onExit={leave}
        />
      </div>
    );
  }

  const live = !!season?.active;
  const you = board.find((b) => b.wallet_address.toLowerCase() === (address ?? '').toLowerCase());

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex flex-col items-center px-6 py-10" style={{ background: '#04030c' }}>
      <AnimatePresence>
        {pickingLoadout && (
          <LoadoutModal
            opName={season?.name ?? 'Seasonal Campaign'}
            label={`Loadout · Wave ${progress.wave}`}
            cta="ENTER THE SEASON"
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

        {/* Where this player stands. Progress persists, so this is their live
            position in the season rather than the score of a finished run. */}
        {progress.wave > 1 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-5 rounded-2xl border text-center"
            style={{ background: 'rgba(234,179,8,0.06)', borderColor: 'rgba(234,179,8,0.3)' }}
          >
            <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-amber-500 mb-1">Your progress</p>
            <h2 className="font-display font-black text-white" style={{ fontSize: 'clamp(2.5rem, 10vw, 4rem)' }}>
              {progress.wave - 1}
            </h2>
            <p className="text-slate-400 text-sm">waves completed · resuming on wave {progress.wave}</p>
          </motion.div>
        )}

        <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-amber-500 mb-1">Seasonal Campaign</p>
        <h1 className="font-display font-black text-white text-3xl tracking-wide mb-1">
          {season?.name ?? 'No season scheduled'}
        </h1>

        {loading ? (
          <p className="text-slate-500 text-sm">loading…</p>
        ) : !season ? (
          <p className="text-slate-500 text-sm">No season is scheduled yet. Check back soon.</p>
        ) : (
          <>
            <p className="text-slate-500 text-sm mb-5">
              {season.upcoming
                ? `opens in ${untilText(season.starts_at)}`
                : season.ended
                ? 'season closed · payouts settling'
                : season.ends_at
                ? `closes in ${untilText(season.ends_at)}`
                : 'live now'}
            </p>

            <div className="flex flex-wrap gap-3 mb-6">
              <div className="px-4 py-2 rounded-xl border" style={{ borderColor: 'rgba(234,179,8,0.3)', background: 'rgba(234,179,8,0.06)' }}>
                <p className="text-[10px] uppercase tracking-widest text-amber-500/70 font-bold">Prize pool</p>
                <p className="font-display font-black text-amber-400 text-lg">{season.prize_pool_g.toLocaleString()} TALLY</p>
              </div>
              <div className="px-4 py-2 rounded-xl border" style={{ borderColor: 'rgba(42,42,58,0.8)' }}>
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Your best</p>
                <p className="font-display font-black text-white text-lg">{you?.best ?? 0} waves</p>
              </div>
            </div>

            {/* One shared seed means everyone walks the same compound — worth saying,
                because "why did they get an easier run" is the first thing a
                competitive player asks. */}
            <p className="text-slate-600 text-xs mb-6 leading-relaxed">
              Every player runs the same generated compound. Leave whenever you like and
              come back on the wave you left — dying only sends you to the start of your
              current wave, never back to the beginning. The board ranks WAVES COMPLETED.
              Top 10 are paid 50,000 TALLY each when the season closes.
            </p>

            <button
              onClick={begin}
              disabled={!live}
              className="w-full px-6 py-4 rounded-xl font-display font-black text-black disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
              style={{ background: '#eab308' }}
            >
              {live ? (progress.wave > 1 ? `Continue — Wave ${progress.wave}` : 'Enter the Season') : season.upcoming ? 'Locked until it opens' : 'Season closed'}
            </button>
          </>
        )}

        {/* The ladder. Same component and same ranking as Campaign Endless — waves
            completed, ties to whoever got there first — with this season's payouts
            layered on by the season card above. */}
        <div className="mt-10">
          <WaveBoard seasonId={season?.id} highlightWallet={address} title="Season · Waves Completed" />
        </div>

      </div>
    </div>
  );
}
