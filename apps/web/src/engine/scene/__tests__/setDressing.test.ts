import { describe, it, expect } from 'vitest';
import { dressingFor, PROP_CLEAR, PROP_WALL_MIN, PROP_WALL_MAX } from '../setDressing';
import { CAMPAIGN } from '../../fps/campaign';
import type { CoverBox } from '../../fps';

const inBox = (x: number, z: number, b: CoverBox, pad: number) => Math.abs(x - b.x) < b.w / 2 + pad && Math.abs(z - b.z) < b.d / 2 + pad;
const wallDist = (x: number, z: number, walls: CoverBox[]) => {
  let m = Infinity;
  for (const b of walls) {
    const dx = Math.max(Math.abs(x - b.x) - b.w / 2, 0), dz = Math.max(Math.abs(z - b.z) - b.d / 2, 0);
    m = Math.min(m, Math.hypot(dx, dz));
  }
  return m;
};

describe('set dressing (A5)', () => {
  it('is deterministic for a given op', () => {
    const a = dressingFor(CAMPAIGN[0]);
    const b = dressingFor(CAMPAIGN[0]);
    expect(a).toEqual(b);
  });

  for (const m of CAMPAIGN) {
    describe(`${m.id}`, () => {
      const props = dressingFor(m);
      const avoid: [number, number][] = [m.start, ...m.enemies.map((e) => e.pos), ...m.objectives.map((o) => o.pos)];
      if (m.hostage) avoid.push(m.hostage);

      it('dresses the op with some clutter', () => {
        expect(props.length).toBeGreaterThan(0);
      });

      it('never places a prop inside a wall or cover block', () => {
        for (const p of props) {
          const hit = [...m.walls, ...m.cover].find((b) => inBox(p.x, p.z, b, 0.5));
          expect(hit, `prop ${p.kind} at [${p.x},${p.z}] overlaps geometry`).toBeUndefined();
        }
      });

      it('keeps every prop clear of enemies, objectives and the start (no hidden targets)', () => {
        for (const p of props) {
          const near = avoid.find(([ax, az]) => Math.hypot(p.x - ax, p.z - az) < PROP_CLEAR);
          expect(near, `prop ${p.kind} at [${p.x},${p.z}] is too close to play at [${near}]`).toBeUndefined();
        }
      });

      it('hugs a wall (not floating in the open, not clipping the wall)', () => {
        for (const p of props) {
          const dw = wallDist(p.x, p.z, m.walls);
          expect(dw).toBeGreaterThanOrEqual(PROP_WALL_MIN);
          expect(dw).toBeLessThanOrEqual(PROP_WALL_MAX);
        }
      });
    });
  }
});
