import { describe, it, expect } from 'vitest';
import {
  APPROACH_LEN, ARENA_BOUNDS, ARENA_FLOOR, GATE_W, LISTEN, DORMANT_UNTIL_BREACH,
  approachLength, hasApproach, approachSpawn, approachBounds, approachFloor,
  isApproaching, openRearGate, listenWeight,
} from '../approach';
import { CAMPAIGN } from '../campaign';
import type { CoverBox } from '../index';

const withApproach = { start: [0, 16] as [number, number], approach: { line: 'walk it' } };
const without = { start: [0, 16] as [number, number], approach: undefined };

describe('opting in', () => {
  it('a mission without an approach is untouched in every respect', () => {
    expect(hasApproach(without)).toBe(false);
    expect(approachLength(without)).toBe(0);
    expect(approachSpawn(without)).toEqual([0, 16]);
    expect(approachBounds(without)).toEqual({ ...ARENA_BOUNDS });
    expect(approachFloor(without)).toEqual({ width: ARENA_FLOOR.width, depth: ARENA_FLOOR.depth, centerZ: 0 });
  });

  it('defaults to APPROACH_LEN and honours an override', () => {
    expect(approachLength(withApproach)).toBe(APPROACH_LEN);
    expect(approachLength({ approach: { line: 'x', length: 35 } })).toBe(35);
  });

  it('treats a zero or negative length as no approach', () => {
    expect(hasApproach({ approach: { line: 'x', length: 0 } })).toBe(false);
    expect(hasApproach({ approach: { line: 'x', length: -5 } })).toBe(false);
  });
});

describe('the corridor holds together', () => {
  // These three have to agree. If the spawn sits outside the clamp the player is
  // shoved on frame one; if it sits off the floor they walk on nothing.
  it('spawns back along +Z from the authored start', () => {
    expect(approachSpawn(withApproach)).toEqual([0, 16 + APPROACH_LEN]);
  });

  it('keeps the spawn inside the movement clamp', () => {
    for (const len of [5, 20, 40, 120]) {
      const m = { start: [0, 16] as [number, number], approach: { line: 'x', length: len } };
      const spawnZ = approachSpawn(m)[1];
      const b = approachBounds(m);
      expect(spawnZ).toBeLessThan(b.maxZ);
      expect(spawnZ).toBeGreaterThan(b.minZ);
    }
  });

  it('keeps the spawn on the floor', () => {
    for (const len of [5, 20, 40, 120]) {
      const m = { start: [0, 16] as [number, number], approach: { line: 'x', length: len } };
      const spawnZ = approachSpawn(m)[1];
      const f = approachFloor(m);
      expect(spawnZ).toBeLessThan(f.centerZ + f.depth / 2);
      expect(spawnZ).toBeGreaterThan(f.centerZ - f.depth / 2);
    }
  });

  it('only grows the arena forward — the compound end never moves', () => {
    const b = approachBounds(withApproach);
    expect(b.minZ).toBe(ARENA_BOUNDS.minZ);
    expect(b.minX).toBe(ARENA_BOUNDS.minX);
    expect(b.maxX).toBe(ARENA_BOUNDS.maxX);
    expect(b.maxZ).toBeGreaterThan(ARENA_BOUNDS.maxZ);

    const f = approachFloor(withApproach);
    expect(f.centerZ - f.depth / 2).toBeCloseTo(-ARENA_FLOOR.depth / 2, 6);
    expect(f.width).toBe(ARENA_FLOOR.width);
  });

  it('the floor still covers the whole walkable box', () => {
    const b = approachBounds(withApproach);
    const f = approachFloor(withApproach);
    expect(f.centerZ + f.depth / 2).toBeGreaterThanOrEqual(b.maxZ);
    expect(f.centerZ - f.depth / 2).toBeLessThanOrEqual(b.minZ);
  });
});

describe('isApproaching', () => {
  it('is true only on the breach objective, and only with an approach', () => {
    expect(isApproaching(withApproach, 0)).toBe(true);
    expect(isApproaching(withApproach, 1)).toBe(false);
    expect(isApproaching(without, 0)).toBe(false);
  });

  it('does not come back once the player has breached', () => {
    // Reads the objective index, not a position, so walking back out of the
    // compound cannot re-suppress the marker or re-sleep the room.
    for (const i of [1, 2, 3, 4]) expect(isApproaching(withApproach, i)).toBe(false);
  });
});

describe('openRearGate', () => {
  const rear: CoverBox = { x: 0, z: 18.2, w: 20.6, d: 0.6, h: 3.4 };
  const side: CoverBox = { x: -10, z: 0, w: 0.6, d: 37, h: 3.4 };
  const inner: CoverBox = { x: -5.8, z: 8, w: 8.4, d: 0.6, h: 3.4 };

  it('splits the rear wall into two segments around a centred gap', () => {
    const out = openRearGate([side, rear, inner]);
    expect(out).toHaveLength(4);
    const segs = out.filter((w) => w.z === 18.2).sort((a, b) => a.x - b.x);
    expect(segs).toHaveLength(2);
    // The gap between the inner edges is exactly GATE_W.
    const gap = (segs[1].x - segs[1].w / 2) - (segs[0].x + segs[0].w / 2);
    expect(gap).toBeCloseTo(GATE_W, 6);
  });

  it('preserves the wall\'s total span, height and depth', () => {
    const out = openRearGate([rear]);
    const span = Math.max(...out.map((w) => w.x + w.w / 2)) - Math.min(...out.map((w) => w.x - w.w / 2));
    expect(span).toBeCloseTo(rear.w, 6);
    for (const w of out) {
      expect(w.h).toBe(rear.h);
      expect(w.d).toBe(rear.d);
      expect(w.z).toBe(rear.z);
    }
  });

  it('leaves every other wall untouched', () => {
    const out = openRearGate([side, rear, inner]);
    expect(out).toContain(side);
    expect(out).toContain(inner);
  });

  it('picks the REAR wall, not a side wall or a nearer cross wall', () => {
    const out = openRearGate([side, inner, rear]);
    // Only the z=18.2 wall got split.
    expect(out.filter((w) => w.z === 18.2)).toHaveLength(2);
    expect(out.filter((w) => w.z === 8)).toHaveLength(1);
    expect(out.filter((w) => w.z === 0)).toHaveLength(1);
  });

  it('degrades safely rather than throwing', () => {
    expect(openRearGate([])).toEqual([]);
    // Nothing wide enough to hold a gate.
    const narrow: CoverBox = { x: 0, z: 5, w: 2, d: 0.6, h: 3 };
    expect(openRearGate([narrow])).toEqual([narrow]);
    // No X-spanning wall at all.
    expect(openRearGate([side])).toEqual([side]);
  });
});

describe('listenWeight', () => {
  it('ramps toward 1 while held and back to 0 when released', () => {
    let w = 0;
    for (let i = 0; i < 60; i++) w = listenWeight(w, true, 1 / 60);
    expect(w).toBeGreaterThan(0.9);
    for (let i = 0; i < 60; i++) w = listenWeight(w, false, 1 / 60);
    expect(w).toBeLessThan(0.1);
  });

  it('stays inside 0..1 even on a huge frame step', () => {
    expect(listenWeight(0, true, 10)).toBe(1);
    expect(listenWeight(1, false, 10)).toBe(0);
  });

  it('pins the player when fully listening', () => {
    expect(LISTEN.MOVE).toBe(0);
  });
});

describe('the campaign opts in', () => {
  it('every doorkicker op has an approach line', () => {
    for (const m of CAMPAIGN) {
      expect(m.approach, `${m.id} has no approach`).toBeDefined();
      expect(m.approach!.line.length).toBeGreaterThan(0);
    }
  });

  it('no approach line shouts a distance or a grid reference at the player', () => {
    // The marker is suppressed during the walk in, so the line IS the navigation.
    // It has to read as a person talking, not as a HUD element.
    for (const m of CAMPAIGN) {
      expect(m.approach!.line, m.id).not.toMatch(/\d+\s*m\b|\bgrid\b|\bwaypoint\b/i);
    }
  });

  it('every op spawns outside its own compound, on the floor, inside the clamp', () => {
    for (const m of CAMPAIGN) {
      const spawnZ = approachSpawn(m)[1];
      expect(spawnZ, m.id).toBeGreaterThan(m.start[1]);
      const b = approachBounds(m);
      const f = approachFloor(m);
      expect(spawnZ, m.id).toBeLessThan(b.maxZ);
      expect(spawnZ, m.id).toBeLessThan(f.centerZ + f.depth / 2);
    }
  });

  it('the front room is the one held asleep during the walk in', () => {
    // twoRoom() wakes room 1 on the breach objective; the approach is what finally
    // makes that call mean something, so the two must name the same room.
    for (const m of CAMPAIGN) {
      expect(m.objectives[0].activateRoom ?? DORMANT_UNTIL_BREACH).toBe(DORMANT_UNTIL_BREACH);
    }
  });
});
