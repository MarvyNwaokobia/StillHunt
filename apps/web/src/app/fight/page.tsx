'use client';

import dynamic from 'next/dynamic';
import { Suspense, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Rajdhani } from 'next/font/google';
import { useFightRewards } from '@/hooks/useFightRewards';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { equippedGunId, equippedAmmoId, equippedAttachments } from '@/lib/guns';
import { retryImport } from '@/lib/retryImport';

// The tactical HUD face (see /dev/verb) — exposed as a CSS var for the scene.
const tactical = Rajdhani({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-tactical',
  display: 'swap',
});

// The live game is now the StillHunt first-person build. The previous turn-based /
// melee campaign is preserved, fully playable, at /fight-legacy (its engine code
// is untouched) in case any of it is reused.
const HuntScene = dynamic(
  () => retryImport(() => import('@/engine/scene/HuntScene')).then((m) => m.HuntScene),
  {
    ssr: false,
    // The game boots into a black scene anyway — keep the transition minimal
    // (a subtle spinner), not a full branded loading page.
    loading: () => (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-white/15 border-t-cyan-400 animate-spin" />
      </div>
    ),
  },
);

function FightInner() {
  const router = useRouter();
  const { startFight, submitResult, reportLoss } = useFightRewards();
  const walletAddress = usePlayerStore((s) => s.player?.wallet_address);
  // C1: the real account rank + XP so the in-game HUD reflects true server standing.
  const accountRank = usePlayerStore((s) => s.player?.rank);
  const accountXp = usePlayerStore((s) => s.player?.xp);
  // The server-authoritative campaign progress — used to RESUME at the right op when
  // no specific op was chosen, even after a sign-out cleared local storage.
  const pveLevel = usePlayerStore((s) => s.player?.pve_level);

  // A: the gun the player bought + equipped in the marketplace. The scene carries it
  // as the op primary whenever it out-tiers the op's issued weapon, so buying a
  // better gun actually shows up in the fight.
  const inventory = usePlayerStore((s) => s.inventory);
  const equippedGun = useMemo(() => equippedGunId(inventory), [inventory]);
  // B: equipped ammo + attachments modify the carried gun's stats (and drive the
  // incendiary burn) inside the sim.
  const equippedAmmo = useMemo(() => equippedAmmoId(inventory), [inventory]);
  const equippedMods = useMemo(() => equippedAttachments(inventory), [inventory]);

  // The operation is chosen OUTSIDE the game (Campaign → Operations list), which
  // routes here as /fight?op=N. Read it via useSearchParams (NOT window.location,
  // which reads stale on client-side navigation — that made a clicked op boot op 1).
  const searchParams = useSearchParams();
  const opParam = searchParams.get('op');
  const startMission =
    opParam !== null && opParam !== '' && Number.isFinite(Number(opParam)) && Number(opParam) >= 0
      ? Number(opParam)
      : undefined;

  // Field kit chosen on the Loadout screen (/fight?kit=light,nvg) — standard-issue
  // tactical gear fitted on top of whatever the op issues.
  const KIT = ['light', 'laser', 'nvg', 'optic'] as const;
  const fieldKit = useMemo(
    () => (searchParams.get('kit') ?? '').split(',').filter((k): k is (typeof KIT)[number] => (KIT as readonly string[]).includes(k)),
    [searchParams],
  );

  // Each op opens a server-authoritative fight session as it BEGINS (the token that
  // fixes wallet + level + start time server-side), then records the win on CLEAR.
  // The backend applies the real XP → rank → TALLY and advances the PvE level. If the
  // player isn't signed in, both are graceful no-ops (the game still plays).
  // Returns a promise that resolves TRUE once a server session is confirmed for this op
  // (or the player is signed out). The scene gates the fight on it — a FALSE shows a
  // Retry screen instead of dropping you into a run the server won't count.
  const onOpStart = useCallback(
    (level: number) => startFight(level).catch(() => false),
    [startFight],
  );
  // Returns the SERVER-authoritative reward (real XP / rank-up / TALLY) so the scene can
  // show the truth on the debrief. The per-run kills/headshots feed the capped skill
  // bonus (the server bounds them, so an inflated count can't mint XP).
  const onOpCleared = useCallback(
    (_level: number, stats?: { kills: number; headshots: number }) => submitResult(true, stats).catch(() => null),
    [submitResult],
  );
  // Killed in action: record the loss (on-chain via the server) without touching the
  // op token, so the in-place retry still clears for full reward. Fire-and-forget.
  const onOpFailed = useCallback(
    (stats?: { kills: number; headshots: number }) => { void reportLoss(stats); },
    [reportLoss],
  );

  return (
    <div className={tactical.variable} style={{ position: 'fixed', inset: 0 }}>
      <HuntScene
        onOpStart={onOpStart}
        onOpCleared={onOpCleared}
        onOpFailed={onOpFailed}
        startMission={startMission}
        resumeLevel={pveLevel}
        walletAddress={walletAddress}
        accountRank={accountRank}
        accountXp={accountXp}
        equippedGun={equippedGun}
        equippedAmmo={equippedAmmo}
        equippedMods={equippedMods}
        fieldKit={fieldKit}
        onExit={() => router.push('/battle')}
      />
    </div>
  );
}

export default function FightPage() {
  // useSearchParams needs a Suspense boundary.
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
      <FightInner />
    </Suspense>
  );
}
