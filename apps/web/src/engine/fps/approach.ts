/**
 * @module fps/approach
 * @description The walk in — the quiet phase in front of every breach.
 *
 * Every op used to open at the door: you spawned a few metres out with the first
 * room already awake, so the game began at a gunfight. The approach puts sixty to
 * ninety seconds in front of that. You spawn well outside the compound, you walk,
 * and nothing in there knows you are coming until you cross the threshold.
 *
 * WHY THIS IS NOT JUST A DIFFERENT SPAWN POINT. The campaign arena is a fixed box:
 * the player is clamped to roughly z ∈ [-17.6, 17.4] and the ground plane is 38m
 * deep, while missions already spawn at z = 16. There is no room out there to walk
 * through — the corridor has to be built. So an approach extends three things
 * together, and they must agree or the player walks into an invisible wall or off
 * the edge of the world:
 *
 *   1. the player's own movement clamp   (approachBounds)
 *   2. the ground plane's depth + centre (approachFloor)
 *   3. where the player starts           (approachSpawn)
 *
 * All of it is derived from the mission's existing `start` rather than authored per
 * layout, so a mission opts in with one line of copy and cannot end up with a spawn
 * that sits inside its own compound.
 *
 * Kept pure (no THREE, no React) so it unit-tests headlessly.
 */

import type { Mission } from './campaign';
import type { CoverBox } from './index';

/** How far in front of its normal start an op begins when it has an approach. */
export const APPROACH_LEN = 20;

/** The arena's authored bounds, as HuntScene clamps them without an approach. */
export const ARENA_BOUNDS = { minX: -9.4, maxX: 9.4, minZ: -17.6, maxZ: 17.4 } as const;

/** The authored ground plane, centred on the origin. */
export const ARENA_FLOOR = { width: 22, depth: 38 } as const;

/**
 * Margin kept between the spawn point and the far bound, so the player is standing
 * inside the world rather than pressed against its edge on the first frame.
 */
const SPAWN_MARGIN = 1.5;

export interface ApproachSpec {
  /**
   * The objective line while walking in. Prose, present tense, no distance and no
   * grid reference — during the approach the HUD marker is suppressed and this is
   * the only thing telling the player where to go.
   */
  line: string;
  /** Override the walk-in distance in metres. Defaults to APPROACH_LEN. */
  length?: number;
}

/** How far out this mission's approach runs. 0 when it has none. */
export function approachLength(mission: Pick<Mission, 'approach'>): number {
  if (!mission.approach) return 0;
  const len = mission.approach.length ?? APPROACH_LEN;
  return len > 0 ? len : 0;
}

export function hasApproach(mission: Pick<Mission, 'approach'>): boolean {
  return approachLength(mission) > 0;
}

/**
 * Where the player actually starts. Pushed straight back along +Z from the mission's
 * authored start, so it lands on the compound's own approach axis whatever the layout
 * looks like — no per-layout spawn points to keep in sync with the geometry.
 */
export function approachSpawn(mission: Pick<Mission, 'start' | 'approach'>): [number, number] {
  const len = approachLength(mission);
  if (len === 0) return mission.start;
  return [mission.start[0], mission.start[1] + len];
}

/**
 * The player's movement clamp, widened along +Z to cover the corridor. X and the far
 * (-Z) side are untouched: the compound is unchanged and only the walk-in is new.
 */
export function approachBounds(
  mission: Pick<Mission, 'start' | 'approach' | 'bounds'>,
): { minX: number; maxX: number; minZ: number; maxZ: number } {
  // A mission that states its own extent wins: a generated compound is as deep as
  // its room chain, and the authored arena's clamp would stop the player at the
  // second doorway.
  const base = mission.bounds ?? ARENA_BOUNDS;
  const len = approachLength(mission);
  if (len === 0) return { ...base };
  const spawnZ = approachSpawn(mission)[1];
  return {
    ...base,
    // Always leave the spawn inside the box, even if a mission starts unusually far
    // back or overrides the length.
    maxZ: Math.max(base.maxZ, spawnZ + SPAWN_MARGIN),
  };
}

/**
 * The ground plane, grown and shifted so it still covers the compound AND the new
 * corridor. Returns the plane's depth and the z its centre moves to — growing it
 * without moving the centre would extend it equally into -Z, which is off the back
 * of the level where nothing should be walkable.
 */
export function approachFloor(
  mission: Pick<Mission, 'start' | 'approach' | 'bounds'>,
): { width: number; depth: number; centerZ: number } {
  const width = mission.bounds
    ? Math.max(ARENA_FLOOR.width, (mission.bounds.maxX - mission.bounds.minX) + 6)
    : ARENA_FLOOR.width;
  // The back edge follows the mission's own depth, so a generated chain always has
  // ground under its deepest room.
  const far = mission.bounds ? mission.bounds.minZ - 3 : -ARENA_FLOOR.depth / 2;
  const len = approachLength(mission);
  if (len === 0) {
    const depth = mission.bounds ? (mission.bounds.maxZ + SPAWN_MARGIN) - far : ARENA_FLOOR.depth;
    return { width, depth, centerZ: mission.bounds ? far + depth / 2 : 0 };
  }

  const near = approachBounds(mission).maxZ + SPAWN_MARGIN;  // new front edge
  const depth = near - far;
  return { width, depth, centerZ: (near + far) / 2 };
}

/**
 * True while the player is still walking in — before the first objective (the breach)
 * is complete. This is what suppresses the objective marker and keeps the compound
 * asleep, so it deliberately reads the objective INDEX rather than a position: a
 * player who wanders back out after breaching is not approaching any more.
 */
export function isApproaching(
  mission: Pick<Mission, 'approach'>,
  objectiveIndex: number,
): boolean {
  return hasApproach(mission) && objectiveIndex === 0;
}

/**
 * The room that must be asleep during the walk in. The campaign's first objective
 * already carries `activateRoom: 1` to wake the front room on breach, but enemies are
 * constructed active, so that call has always been a no-op and room 1 was awake from
 * the first frame. The approach is what makes it mean something — so the scene has to
 * put room 1 down at setup.
 */
export const DORMANT_UNTIL_BREACH = 1;

/** Width of the gate cut into the rear wall. Matches the compound's interior
 *  doorways, which are 3.2m gaps between paired wall segments. */
export const GATE_W = 3.2;

/**
 * Open a gate in the compound's rear wall.
 *
 * Every layout is a walled box: the rear wall is one solid span across the full
 * width, and the player has always spawned INSIDE it. An approach puts them outside,
 * so without this they would spawn against a wall with no way in.
 *
 * The rear wall is found rather than named — it is the widest wall at the highest z,
 * which is what "the back of the compound" means in every authored layout. It is then
 * split into the same paired-segments-with-a-gap shape the interior doorways already
 * use, so the gate reads as built rather than as a hole.
 *
 * Returns the walls unchanged if no rear wall is found, so a layout that does not fit
 * the pattern degrades to a compound you cannot enter rather than to a crash.
 */
export function findRearWall(walls: CoverBox[]): CoverBox | undefined {
  // The rear wall runs across X (wide and thin) and sits furthest along +Z.
  let rear: CoverBox | undefined;
  for (const w of walls) {
    if (w.w <= w.d) continue;             // not an X-spanning wall
    if (!rear || w.z > rear.z) rear = w;
  }
  return rear;
}

export function openRearGate(walls: CoverBox[], gap = GATE_W): CoverBox[] {
  if (walls.length === 0) return walls;

  const rear = findRearWall(walls);
  if (!rear || rear.w <= gap) return walls;

  const segW = (rear.w - gap) / 2;
  const offset = gap / 2 + segW / 2;
  return walls.flatMap((w) =>
    w === rear
      ? [
          { ...w, x: w.x - offset, w: segW },
          { ...w, x: w.x + offset, w: segW },
        ]
      : [w],
  );
}

/**
 * Listening: stand still and the world gets louder.
 *
 * Holding Listen pins the player in place, and in exchange distant sound carries.
 * That is the whole trade the approach is built on — stillness has to be worth
 * something mechanically or "still hunt" is only a title.
 */
export const LISTEN = {
  /** Movement multiplier while listening. Zero: you stop dead. */
  MOVE: 0,
  /** Multiplies the distance at which a sound has fallen to half loudness. */
  HALF_LOUD_MULT: 1.9,
  /** Multiplies the range beyond which a source is inaudible. */
  RANGE_MULT: 2.2,
  /** Seconds to ramp the effect in and out, so it never pops. */
  RAMP: 0.25,
} as const;

/**
 * Eased 0..1 listening weight. Held ramps toward 1, released back to 0, at a rate
 * that crosses the whole range in LISTEN.RAMP seconds.
 */
export function listenWeight(current: number, held: boolean, dt: number): number {
  const target = held ? 1 : 0;
  const step = LISTEN.RAMP > 0 ? dt / LISTEN.RAMP : 1;
  if (step >= 1) return target;
  const next = current + (target - current) * step;
  return Math.min(1, Math.max(0, next));
}
