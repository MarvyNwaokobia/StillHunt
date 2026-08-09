/**
 * @module scene/approachDressing
 * @description The road in — the approach corridor as its own place.
 *
 * The compound's dressing (scene/setDressing.ts) scatters clutter that HUGS A WALL
 * between z ∈ [-16, 17]. Neither rule can dress the approach: the corridor sits past
 * z = 18.5 where the layout has no walls at all, so that module would place nothing
 * there even if its range were widened. The approach is not more compound — it is
 * outside, and it needs its own vocabulary.
 *
 * WHAT THIS IS FIXING, beyond bare ground. Past the gate the compound's side walls
 * have ended (they span z ∈ [-18.5, 18.5]) and the only thing holding the player in
 * is the movement clamp at |x| = 9.4. That is an invisible wall: you walk into
 * nothing and stop. The verge line below is the fix — burned fence posts standing
 * roughly where the clamp is, so the edge of the world is something you can see and
 * read as the edge of the road, rather than something you discover by bumping it.
 *
 * THE ROAD STAYS CLEAR. Nothing is placed within ROAD_HALF_W of the centreline. From
 * the spawn you can see the compound you are walking at, and that sightline is the
 * whole framing of the approach — clutter across it would turn a walk toward
 * somewhere into a walk through scenery.
 *
 * Props are DECORATION and never sim colliders, exactly as in setDressing: they can
 * only be looked at, never walked into, so no amount of dressing can trap a player or
 * block the gate.
 *
 * Deterministic per mission id, so an op's road looks the same every time you run it.
 */

import type { Mission } from '../fps/campaign';
import type { PropSpec } from './setDressing';
import { approachSpawn, approachBounds, hasApproach, findRearWall } from '../fps/approach';

/** Half-width of the walkable road kept free of props. */
export const ROAD_HALF_W = 2.6;
/** Where the verge posts stand — just inside the movement clamp, so they read as its edge. */
export const VERGE_X = 8.9;
/** Metres between verge posts down each side. */
export const VERGE_STEP = 4.2;
/** Clearance kept around the spawn and the gate mouth. */
export const APPROACH_CLEAR = 3.0;

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Roadside kinds, weighted by how often they should appear. */
const ROADSIDE: PropSpec['kind'][] = [
  'deadtree', 'deadtree', 'ashpile', 'ashpile', 'debris', 'wreck',
];

/**
 * The corridor's z range: from just inside the gate out to the spawn. Derived from
 * the same approach maths the spawn and the floor use, so dressing cannot end up
 * beyond the ground or inside the compound.
 */
export function corridorRange(mission: Mission): { near: number; far: number } {
  const spawnZ = approachSpawn(mission)[1];
  // Derived from the compound's OWN rear wall, not a constant. A fixed z was tuned
  // for the authored layouts (whose gate sits at 18.2) and collapsed the range to
  // nothing on a generated compound, whose gate is wherever its chain starts — so
  // those roads came out bare.
  const rear = findRearWall(mission.walls);
  const gateZ = rear ? rear.z + rear.d / 2 : 0;
  const near = gateZ + 1.3;  // clear of the gate mouth
  return { near, far: Math.max(near, spawnZ + 1) };
}

export function approachDressingFor(mission: Mission): PropSpec[] {
  if (!hasApproach(mission)) return [];

  const rng = mulberry(hashStr(`${mission.id}:road`));
  const { near, far } = corridorRange(mission);
  const spawn = approachSpawn(mission);
  const bounds = approachBounds(mission);
  const props: PropSpec[] = [];

  const tooCloseToSpawn = (x: number, z: number) =>
    Math.hypot(x - spawn[0], z - spawn[1]) < APPROACH_CLEAR;

  // ── The verge: two lines of burned fence posts marking where the road ends ──
  // Regular spacing with a little jitter so it reads as a fence someone built and
  // the fire took, not as a row of identical markers.
  for (let z = near; z <= far; z += VERGE_STEP) {
    for (const side of [-1, 1]) {
      const x = side * (VERGE_X + (rng() - 0.5) * 0.5);
      const zz = z + (rng() - 0.5) * 1.1;
      if (zz > bounds.maxZ) continue;
      props.push({
        kind: 'post',
        x, z: zz,
        rot: (rng() - 0.5) * 0.5,
        // Some posts are burned down to stumps.
        scale: rng() < 0.28 ? 0.45 + rng() * 0.25 : 0.85 + rng() * 0.35,
      });
    }
  }

  // ── Roadside: what the fire left along the way in ──
  for (let tries = 0; tries < 160 && props.length < 46; tries++) {
    const side = rng() < 0.5 ? -1 : 1;
    const x = side * (ROAD_HALF_W + rng() * (VERGE_X - ROAD_HALF_W - 0.6));
    const z = near + rng() * (far - near);
    if (tooCloseToSpawn(x, z)) continue;
    if (props.some((p) => Math.hypot(x - p.x, z - p.z) < 2.0)) continue;
    props.push({
      kind: ROADSIDE[(rng() * ROADSIDE.length) | 0],
      x, z,
      rot: rng() * Math.PI * 2,
      scale: 0.85 + rng() * 0.5,
    });
  }

  // ── One milestone at the roadside, near the spawn ──
  // A thing to start beside. It gives the opening frame a foreground object and
  // tells the player which way the road runs before they have taken a step.
  props.push({
    kind: 'milestone',
    x: -(ROAD_HALF_W + 0.7),
    z: spawn[1] - 2.4,
    rot: 0.25,
    scale: 1,
  });

  return props;
}
