import { describe, it, expect } from 'vitest';
import {
  generateContract, objectivesFor, roomCountFor, zoneFor,
  CONTRACT_ROOMS_MIN, CONTRACT_ROOMS_MAX, CONTRACT_ZONES,
} from '../contracts';
import { buildChain, seedFromString, CHAIN_START_Z, ROOM_W } from '../endless';
import { approachSpawn, approachBounds, approachFloor, hasApproach, openRearGate } from '../approach';
import { ZONE_THEMES } from '../campaign';

const A = generateContract({ id: 'alpha' });
const B = generateContract({ id: 'bravo' });

describe('a contract is a different compound every time', () => {
  it('two contracts do not share a layout', () => {
    expect(JSON.stringify(A.walls)).not.toBe(JSON.stringify(B.walls));
    expect(JSON.stringify(A.cover)).not.toBe(JSON.stringify(B.cover));
    expect(JSON.stringify(A.enemies)).not.toBe(JSON.stringify(B.enemies));
  });

  it('is deterministic, so the same job is the same job for everyone', () => {
    expect(generateContract({ id: 'alpha' })).toEqual(A);
  });

  it('varies room count and zone across ids', () => {
    const counts = new Set<number>();
    const zones = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const seed = seedFromString(`job-${i}`);
      counts.add(roomCountFor(seed));
      zones.add(zoneFor(seed));
    }
    expect(counts.size).toBeGreaterThan(1);
    expect(zones.size).toBeGreaterThan(1);
  });

  it('keeps room counts inside the short-job range', () => {
    for (let i = 0; i < 60; i++) {
      const n = roomCountFor(seedFromString(`job-${i}`));
      expect(n).toBeGreaterThanOrEqual(CONTRACT_ROOMS_MIN);
      expect(n).toBeLessThanOrEqual(CONTRACT_ROOMS_MAX);
    }
  });

  it('only ever picks a zone the renderer has a theme for', () => {
    for (const z of CONTRACT_ZONES) expect(ZONE_THEMES[z]).toBeDefined();
    for (let i = 0; i < 40; i++) {
      expect(ZONE_THEMES[zoneFor(seedFromString(`job-${i}`))]).toBeDefined();
    }
  });
});

describe('it is an ordinary mission, so everything downstream works', () => {
  it('carries geometry, defenders and an objective chain', () => {
    expect(A.walls.length).toBeGreaterThan(0);
    expect(A.cover.length).toBeGreaterThan(0);
    expect(A.enemies.length).toBeGreaterThan(0);
    expect(A.objectives.length).toBeGreaterThan(2);
  });

  it('has a walk in, and a rear wall the gate can be cut into', () => {
    expect(hasApproach(A)).toBe(true);
    // The chain's entry cap is the widest wall at the highest z, which is exactly
    // what openRearGate looks for — so the approach works with no special case.
    const gated = openRearGate(A.walls);
    expect(gated.length).toBe(A.walls.length + 1);
  });

  it('spawns outside its own compound, inside the clamp, on the floor', () => {
    for (const id of ['alpha', 'bravo', 'charlie', 'delta']) {
      const m = generateContract({ id });
      const spawnZ = approachSpawn(m)[1];
      const b = approachBounds(m);
      const f = approachFloor(m);
      expect(spawnZ, id).toBeGreaterThan(m.start[1]);
      expect(spawnZ, id).toBeLessThan(b.maxZ);
      expect(spawnZ, id).toBeLessThan(f.centerZ + f.depth / 2);
    }
  });

  it('states bounds deep enough to reach its own last room', () => {
    // The authored arena clamps at z = -17.6; a generated chain runs far past that,
    // and inheriting the clamp would stop the player at the second doorway.
    for (const id of ['alpha', 'bravo', 'charlie']) {
      const m = generateContract({ id });
      const deepest = Math.min(...m.walls.map((w) => w.z - w.d / 2));
      expect(m.bounds, id).toBeDefined();
      expect(m.bounds!.minZ, id).toBeLessThan(-17.6);
      expect(m.bounds!.minZ, id).toBeGreaterThan(deepest);
      // And the floor must reach under it.
      const f = approachFloor(m);
      expect(f.centerZ - f.depth / 2, id).toBeLessThanOrEqual(m.bounds!.minZ);
    }
  });

  it('keeps the player inside the room width', () => {
    expect(A.bounds!.maxX).toBeLessThan(ROOM_W / 2);
    expect(A.bounds!.minX).toBeGreaterThan(-ROOM_W / 2);
  });
});

describe('the objective chain', () => {
  const rooms = buildChain(0, 3, CHAIN_START_Z, seedFromString('x'));
  const objs = objectivesFor(rooms, 0.3);

  it('is breach, then clear-and-push per room, then extract', () => {
    expect(objs[0].kind).toBe('reach');
    expect(objs[0].text).toContain('BREACH');
    expect(objs).toHaveLength(rooms.length * 2 + 1);
    expect(objs[objs.length - 1].text).toContain('EXTRACT');
  });

  it('wakes each room only as you reach it, so the compound sleeps ahead of you', () => {
    // This is what lets the approach work: nothing is awake until it is breached.
    const wakes = objs.filter((o) => o.activateRoom !== undefined).map((o) => o.activateRoom);
    expect(wakes).toEqual([1, 2, 3]);
  });

  it('clears every room it generates, tagged to match the defenders', () => {
    const clears = objs.filter((o) => o.kind === 'clear').map((o) => o.room);
    expect(clears).toEqual([1, 2, 3]);
    // Defenders carry room = index + 1, so every clear objective has someone in it.
    const tags = new Set(rooms.flatMap((r) => r.enemies.map((e) => e.room)));
    for (const c of clears) expect(tags.has(c)).toBe(true);
  });

  it('extracts back toward the gate, not deeper in', () => {
    const last = objs[objs.length - 1];
    const deepest = Math.min(...rooms.map((r) => r.zFar));
    expect(last.pos[1]).toBeGreaterThan(deepest);
    // Specifically: back at the entrance, not at the far end.
    expect(last.pos[1]).toBeGreaterThan(rooms[0].zNear - 1);
  });
});
