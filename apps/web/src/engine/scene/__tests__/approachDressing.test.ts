import { describe, it, expect } from 'vitest';
import {
  approachDressingFor, corridorRange, ROAD_HALF_W, VERGE_X, APPROACH_CLEAR,
} from '../approachDressing';
import { approachSpawn, approachBounds, approachFloor } from '../../fps/approach';
import { CAMPAIGN } from '../../fps/campaign';

const op = CAMPAIGN[0];

describe('the road only exists where there is an approach', () => {
  it('dresses every campaign op', () => {
    for (const m of CAMPAIGN) {
      expect(approachDressingFor(m).length, m.id).toBeGreaterThan(0);
    }
  });

  it('places nothing for a mission with no approach', () => {
    expect(approachDressingFor({ ...op, approach: undefined })).toEqual([]);
  });

  it('is deterministic — an op\'s road looks the same every run', () => {
    expect(approachDressingFor(op)).toEqual(approachDressingFor(op));
  });

  it('gives different ops different roads', () => {
    const a = JSON.stringify(approachDressingFor(CAMPAIGN[0]));
    const b = JSON.stringify(approachDressingFor(CAMPAIGN[1]));
    expect(a).not.toBe(b);
  });
});

describe('nothing is placed where it would break the walk', () => {
  it('keeps the road clear so the compound stays in view from the spawn', () => {
    // The sightline from spawn to gate is the entire framing of the approach.
    for (const m of CAMPAIGN) {
      for (const p of approachDressingFor(m)) {
        expect(Math.abs(p.x), `${m.id} prop on the road at x=${p.x}`)
          .toBeGreaterThanOrEqual(ROAD_HALF_W - 0.01);
      }
    }
  });

  it('stays inside the movement clamp and on the floor', () => {
    for (const m of CAMPAIGN) {
      const b = approachBounds(m);
      const f = approachFloor(m);
      for (const p of approachDressingFor(m)) {
        expect(Math.abs(p.x), m.id).toBeLessThanOrEqual(Math.abs(b.maxX) + 0.5);
        expect(p.z, m.id).toBeLessThanOrEqual(b.maxZ);
        expect(p.z, m.id).toBeGreaterThan(f.centerZ - f.depth / 2);
      }
    }
  });

  it('never crowds the gate mouth or reaches back into the compound', () => {
    const { near } = corridorRange(op);
    for (const p of approachDressingFor(op)) {
      expect(p.z).toBeGreaterThan(near - 1.5);
    }
  });

  it('leaves room around the spawn so nothing is in the player\'s face', () => {
    const spawn = approachSpawn(op);
    for (const p of approachDressingFor(op)) {
      if (p.kind === 'post' || p.kind === 'milestone') continue; // verge + marker are meant to be close
      expect(Math.hypot(p.x - spawn[0], p.z - spawn[1])).toBeGreaterThanOrEqual(APPROACH_CLEAR);
    }
  });
});

describe('the verge makes the invisible wall visible', () => {
  // Past the gate the compound's side walls have ended and only the movement clamp
  // holds the player in. Without the posts, that edge is discovered by bumping it.
  it('runs posts down both sides of the corridor', () => {
    const posts = approachDressingFor(op).filter((p) => p.kind === 'post');
    expect(posts.length).toBeGreaterThan(6);
    expect(posts.some((p) => p.x < 0)).toBe(true);
    expect(posts.some((p) => p.x > 0)).toBe(true);
  });

  it('stands them at the edge, near the clamp', () => {
    for (const p of approachDressingFor(op).filter((p) => p.kind === 'post')) {
      expect(Math.abs(p.x)).toBeGreaterThan(VERGE_X - 1);
      expect(Math.abs(p.x)).toBeLessThan(VERGE_X + 1);
    }
  });

  it('covers the length of the walk rather than clustering at one end', () => {
    const posts = approachDressingFor(op).filter((p) => p.kind === 'post');
    const zs = posts.map((p) => p.z);
    const { near, far } = corridorRange(op);
    expect(Math.min(...zs)).toBeLessThan(near + 6);
    expect(Math.max(...zs)).toBeGreaterThan(far - 6);
  });
});

describe('the roadside', () => {
  it('gives the walk something to look at without filling it', () => {
    const road = approachDressingFor(op).filter((p) => p.kind !== 'post');
    expect(road.length).toBeGreaterThan(3);
    expect(road.length).toBeLessThan(30);
  });

  it('puts a milestone by the spawn to open the shot on', () => {
    const spawn = approachSpawn(op);
    const stone = approachDressingFor(op).find((p) => p.kind === 'milestone');
    expect(stone).toBeDefined();
    expect(Math.abs(stone!.z - spawn[1])).toBeLessThan(5);
  });

  it('spaces props out instead of stacking them', () => {
    const all = approachDressingFor(op).filter((p) => p.kind !== 'post');
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        expect(Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z)).toBeGreaterThan(1.0);
      }
    }
  });
});
