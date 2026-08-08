/**
 * Pure spatialization math for the AudioDirector (CLONE_PLAN.md slice 2).
 *
 * Stereo can't do true behind-you audio, so the trick every stereo game uses:
 * pan carries left/right, distance carries gain, and a lowpass "muffle"
 * carries BEHIND — sources behind the listener lose their highs, the way
 * your own head shadows sound in life. Together these are the informational
 * layer: you can hear where an embed landed and which side the recall arc is
 * sweeping through without seeing any of it.
 *
 * Kept as pure functions (no WebAudio types) so they unit-test headlessly.
 * Conventions match BattleCamera: listener forward = (-sin yaw, -cos yaw).
 */

import { LISTEN } from '../fps/approach';

/** Both pulled from the approach's own tuning so the two cannot drift apart. */
const LISTEN_HALF_LOUD_MULT = LISTEN.HALF_LOUD_MULT;
const LISTEN_RANGE_MULT = LISTEN.RANGE_MULT;

export interface SpatialParams {
  /** -1 (hard left) .. 1 (hard right) for a StereoPannerNode. */
  pan: number;
  /** 0..1 distance attenuation for a GainNode. */
  gain: number;
  /** Lowpass cutoff in Hz — drops with distance and behind-ness. */
  lowpass: number;
}

/** Distance (m) at which a sound has fallen to half loudness. */
const HALF_LOUD_AT = 9;
/** Beyond this the source is effectively inaudible. */
const MAX_RANGE = 45;

const LPF_OPEN = 18000;
const LPF_FAR = 2600;   // fully-distant cutoff
const LPF_BEHIND = 3200; // fully-behind cutoff (applied multiplicatively)

/**
 * How hard the player is listening, 0..1 (see fps/approach.ts). Standing still and
 * holding Listen stretches both distance constants, so a door or a boot on gravel
 * that was inaudible at 30m carries. It only ever makes a source LOUDER — the
 * falloff curve keeps its shape, the scale moves — so nothing that was audible
 * while moving goes quiet when you stop.
 */
export function spatialize(
  listenerX: number,
  listenerZ: number,
  listenerYaw: number,
  sourceX: number,
  sourceZ: number,
  listening = 0,
): SpatialParams {
  const l = Math.min(1, Math.max(0, listening));
  const halfLoudAt = HALF_LOUD_AT * (1 + (LISTEN_HALF_LOUD_MULT - 1) * l);
  const maxRange = MAX_RANGE * (1 + (LISTEN_RANGE_MULT - 1) * l);

  const dx = sourceX - listenerX;
  const dz = sourceZ - listenerZ;
  const dist = Math.hypot(dx, dz);

  if (dist < 0.35) {
    // On top of the listener: dead centre, full volume.
    return { pan: 0, gain: 1, lowpass: LPF_OPEN };
  }

  const fwdX = -Math.sin(listenerYaw);
  const fwdZ = -Math.cos(listenerYaw);
  const rightX = -fwdZ;
  const rightZ = fwdX;

  const nx = dx / dist;
  const nz = dz / dist;
  const side = nx * rightX + nz * rightZ;   // -1..1 left/right
  const front = nx * fwdX + nz * fwdZ;      // 1 ahead, -1 behind

  // Pan follows the side component but never fully collapses one ear.
  const pan = clamp(side * 0.85, -0.85, 0.85);

  // Inverse falloff tuned so halfLoudAt is exactly 0.5, hard floor at range.
  const gain = dist >= maxRange ? 0 : 1 / (1 + dist / halfLoudAt);

  // Distance closes the filter; behind-ness closes it further. Listening stretches
  // the range too, so a distant source keeps more of its highs while you're still.
  const distT = Math.min(1, dist / maxRange);
  const distLpf = LPF_OPEN + (LPF_FAR - LPF_OPEN) * distT;
  const behindT = front < 0 ? -front : 0; // 0 ahead → 1 fully behind
  const behindMul = 1 + (LPF_BEHIND / LPF_OPEN - 1) * behindT;
  const lowpass = Math.max(500, distLpf * behindMul);

  return { pan, gain, lowpass };
}

/**
 * Fight-state → score intensity, kept pure for tests.
 *  0 calm (nothing near) · 1 engaged (an enemy is close) · 2 combat
 *  (recent damage) · 3 reserved for bosses (slice 4).
 */
export function combatIntensity(
  nearestEnemyDist: number | null,
  secondsSinceLastHit: number,
): 0 | 1 | 2 | 3 {
  const engaged = nearestEnemyDist !== null && nearestEnemyDist < 14;
  const hot = secondsSinceLastHit < 4;
  if (engaged && hot) return 2;
  if (engaged) return 1;
  if (hot) return 1; // trading at range still counts as engaged
  return 0;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
