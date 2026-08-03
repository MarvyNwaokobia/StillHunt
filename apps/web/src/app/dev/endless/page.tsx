'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Rajdhani } from 'next/font/google';
import { retryImport } from '@/lib/retryImport';

const tactical = Rajdhani({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-tactical',
  display: 'swap',
});

const HuntScene = dynamic(
  () => retryImport(() => import('@/engine/scene/HuntScene')).then((m) => m.HuntScene),
  { ssr: false },
);

/**
 * Dev sandbox for the ENDLESS room chain — the same generated compound the Seasonal
 * Campaign and Campaign Endless both run on, with no auth, no season window and no
 * server round-trip. `/seasonal` needs a signed-in player and a live season, which
 * makes it useless for checking whether the geometry actually renders.
 *
 * `/dev/endless?seed=1234&wave=7` — `wave` drops straight in at that wave's first
 * room, which is also how the Campaign Endless resume path gets exercised.
 */
function DevEndlessInner() {
  const params = useSearchParams();
  const seed = Number(params.get('seed') ?? 1234) || 1234;
  const wave = Math.max(1, Number(params.get('wave') ?? 1) || 1);
  const seasonal = params.get('seasonal') === '1';

  return (
    <div className={tactical.variable} style={{ position: 'fixed', inset: 0 }}>
      <HuntScene
        seasonal={seasonal}
        endless={{
          seed,
          startWave: wave,
          onWaveCleared: (w) => {
            // Probe hook: the headless check reads these off the console.
            console.log(`[endless] wave cleared: ${w}`);
          },
          onDeath: (w, stats) => {
            console.log(`[endless] died on wave ${w} · ${stats.kills} kills — restarting that wave`);
          },
        }}
      />
    </div>
  );
}

export default function DevEndlessPage() {
  return (
    <Suspense fallback={<div style={{ position: 'fixed', inset: 0, background: '#000' }} />}>
      <DevEndlessInner />
    </Suspense>
  );
}
