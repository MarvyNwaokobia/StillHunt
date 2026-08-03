import * as THREE from 'three';
import type { CoverBox } from '../sim/Cover';

/**
 * Rotated-block collision math for the verb sim (CLONE_PLAN.md slice 6).
 *
 * The sim's world blocks ARE the game's CoverBox type — the same yawed boxes
 * ashfallLayout derives for rendering, camera occlusion, and (in the legacy
 * sim) shot blocking. One layout, every system agrees where the walls are.
 *
 * Rotation convention matches ashfallLayout.rot()/THREE rotateY:
 *   world = [c·lx + s·lz, -s·lx + c·lz]  →  local = [c·dx - s·dz, s·dx + c·dz]
 */

export type SimBlock = CoverBox;

/** Is the point inside the block? Blocks rise from the ground to `height`. */
export function pointInBlock(px: number, py: number, pz: number, b: SimBlock): boolean {
  if (py < 0 || py > b.height) return false;
  const yaw = b.yaw ?? 0;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const dx = px - b.x;
  const dz = pz - b.z;
  const lx = c * dx - s * dz;
  const lz = s * dx + c * dz;
  return Math.abs(lx) <= b.hx && Math.abs(lz) <= b.hz;
}

/** Push a ground circle (radius r) out of the block's footprint, in place. */
export function pushCircleOut(pos: THREE.Vector3, r: number, b: SimBlock): void {
  const yaw = b.yaw ?? 0;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const dx = pos.x - b.x;
  const dz = pos.z - b.z;
  let lx = c * dx - s * dz;
  let lz = s * dx + c * dz;

  const cx = THREE.MathUtils.clamp(lx, -b.hx, b.hx);
  const cz = THREE.MathUtils.clamp(lz, -b.hz, b.hz);
  const ox = lx - cx;
  const oz = lz - cz;
  const d2 = ox * ox + oz * oz;
  if (d2 >= r * r) return;

  if (d2 < 1e-9) {
    // Centre is inside the box: exit along the shallowest local axis.
    const pushX = b.hx + r - Math.abs(lx);
    const pushZ = b.hz + r - Math.abs(lz);
    if (pushX < pushZ) lx += lx >= 0 ? pushX : -pushX;
    else lz += lz >= 0 ? pushZ : -pushZ;
  } else {
    const d = Math.sqrt(d2);
    const push = (r - d) / d;
    lx += ox * push;
    lz += oz * push;
  }

  pos.x = b.x + c * lx + s * lz;
  pos.z = b.z + (-s * lx + c * lz);
}
