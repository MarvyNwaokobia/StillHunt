import * as THREE from 'three';
import { pointInBlock, type SimBlock } from './blocks';

/**
 * The Rift Edge — the signature verb (CLONE_PLAN.md slice 1).
 *
 * A thrown heavy blade with four states:
 *
 *   held → thrown → embedded → recalling → held
 *
 * Throw: travels with slight gravity drop, embeds in the first dummy or world
 * block it crosses (or pitches into the ground at max range). Recall: rips
 * free after a beat, then flies back to the hero's HAND along a magnet arc —
 * a quadratic bezier whose far endpoint re-resolves every frame, so it tracks
 * a moving hero and sweeps sideways through the space between (hitting
 * anything on the way). The catch is the whole point: everything downstream
 * (audio, camera punch, follow-up window) keys off the `catch` event.
 *
 * Headless: vector math only, no rendering. The scene reads `pos`, `dir` and
 * `spin` to draw the blade; the sim owns damage when edge events say so.
 */

export type EdgeState = 'held' | 'thrown' | 'embedded' | 'recalling';

/** What the edge can embed into. */
export type EmbedTarget =
  | { kind: 'enemy'; id: number }
  | { kind: 'world' }
  | { kind: 'ground' };

export type EdgeEvent =
  | { type: 'throw'; dir: THREE.Vector3 }
  | { type: 'embed'; target: EmbedTarget; pos: THREE.Vector3 }
  | { type: 'recallStart'; distance: number }
  | { type: 'recallSweep'; pos: THREE.Vector3; dir: THREE.Vector3 }
  | { type: 'catch'; pos: THREE.Vector3 };

export interface EdgeHitProbe {
  /** Return the id of a living enemy within `radius` of `pos` (torso band), or null. */
  enemyAt(pos: THREE.Vector3, radius: number): number | null;
  /** Current world position of a (possibly moving) enemy the edge is embedded in. */
  enemyPos(id: number): THREE.Vector3 | null;
}

const THROW_SPEED = 26;        // m/s
const THROW_GRAVITY = 2.2;     // m/s² of drop — a heavy blade, not a bullet
const THROW_MAX_RANGE = 30;    // m before it pitches into the ground
const THROW_HIT_RADIUS = 0.55; // m — generous, the throw should feel magnetic
const RIP_DELAY = 0.09;        // s between recall press and the blade tearing free
const RECALL_SPEED = 27;       // m/s along the arc
const RECALL_MIN_TIME = 0.22;  // s — even point-blank recalls read as a move
const RECALL_SWEEP_RADIUS = 0.7;
/** Sideways bulge of the return arc as a fraction of the return distance. */
const ARC_BULGE = 0.38;
const ARC_BULGE_MIN = 1.0;
const ARC_BULGE_MAX = 4.5;

export class RiftEdge {
  state: EdgeState = 'held';
  readonly pos = new THREE.Vector3();
  /** Travel direction (render aligns the blade to this). */
  readonly dir = new THREE.Vector3(0, 0, 1);
  /** Accumulated spin angle for the render layer (rad). */
  spin = 0;

  private vel = new THREE.Vector3();
  private travelled = 0;
  private embedTarget: EmbedTarget | null = null;
  private embedOffset = new THREE.Vector3(); // offset from a pinned enemy's centre
  private ripTimer = 0;

  // Recall arc bookkeeping. P0 fixed at rip point; P2 is the live hand position;
  // the control point's side is chosen once at recall start so the arc is stable.
  private arcStart = new THREE.Vector3();
  private arcSide = new THREE.Vector3();
  private arcT = 0;
  private arcDuration = 1;

  private listeners: Array<(e: EdgeEvent) => void> = [];

  onEvent(cb: (e: EdgeEvent) => void): () => void {
    this.listeners.push(cb);
    return () => { this.listeners = this.listeners.filter((l) => l !== cb); };
  }

  private emit(e: EdgeEvent) {
    for (const l of this.listeners) l(e);
  }

  /** Throw from `handPos` along `aimDir` (normalized by the sim). */
  throw(handPos: THREE.Vector3, aimDir: THREE.Vector3) {
    if (this.state !== 'held') return;
    this.state = 'thrown';
    this.pos.copy(handPos);
    this.dir.copy(aimDir).normalize();
    this.vel.copy(this.dir).multiplyScalar(THROW_SPEED);
    this.travelled = 0;
    this.spin = 0;
    this.emit({ type: 'throw', dir: this.dir.clone() });
  }

  /** Begin the recall. Works mid-flight too (the throw bends home). */
  recall(handPos: THREE.Vector3) {
    if (this.state === 'held' || this.state === 'recalling') return;
    const fromFlight = this.state === 'thrown';
    this.state = 'recalling';
    this.ripTimer = fromFlight ? 0 : RIP_DELAY;
    this.arcStart.copy(this.pos);
    this.arcT = 0;

    const home = new THREE.Vector3().subVectors(handPos, this.pos);
    const dist = home.length();
    this.arcDuration = Math.max(RECALL_MIN_TIME, dist / RECALL_SPEED);

    // Pick the arc's side: perpendicular to the return line, biased to sweep
    // across the hero's front (feels cinematic, and drags the blade through
    // anything standing between you and it).
    const flat = home.clone().setY(0).normalize();
    this.arcSide.set(-flat.z, 0, flat.x);
    if (Math.random() < 0.5) this.arcSide.negate();

    this.emit({ type: 'recallStart', distance: dist });
  }

  /** 0..1 how far along the return arc (drives the rising whistle). */
  get recallProgress(): number {
    return this.state === 'recalling' ? this.arcT : 0;
  }

  /** Hard reset to the hand (round restarts) — no events, no flight. */
  reset(handPos: THREE.Vector3) {
    this.state = 'held';
    this.embedTarget = null;
    this.ripTimer = 0;
    this.arcT = 0;
    this.spin = 0;
    this.pos.copy(handPos);
  }

  update(dt: number, handPos: THREE.Vector3, probe: EdgeHitProbe, blocks: SimBlock[]) {
    switch (this.state) {
      case 'held':
        this.pos.copy(handPos);
        break;
      case 'thrown':
        this.updateThrown(dt, probe, blocks);
        break;
      case 'embedded':
        this.updateEmbedded(probe);
        break;
      case 'recalling':
        this.updateRecalling(dt, handPos);
        break;
    }
  }

  private updateThrown(dt: number, probe: EdgeHitProbe, blocks: SimBlock[]) {
    this.spin += dt * 18;
    this.vel.y -= THROW_GRAVITY * dt;

    // Substep so the blade can't tunnel through graybox blocks at 26 m/s.
    const steps = 2;
    for (let i = 0; i < steps; i++) {
      const stepLen = (this.vel.length() * dt) / steps;
      this.pos.addScaledVector(this.dir.copy(this.vel).normalize(), stepLen);
      this.travelled += stepLen;

      const enemy = probe.enemyAt(this.pos, THROW_HIT_RADIUS);
      if (enemy !== null) {
        this.embed({ kind: 'enemy', id: enemy }, probe);
        return;
      }
      if (this.insideBlock(blocks)) {
        this.embed({ kind: 'world' }, probe);
        return;
      }
      if (this.pos.y <= 0.05 || this.travelled >= THROW_MAX_RANGE) {
        this.pos.y = Math.max(this.pos.y, 0.05);
        this.embed({ kind: 'ground' }, probe);
        return;
      }
    }
  }

  private embed(target: EmbedTarget, probe: EdgeHitProbe) {
    this.state = 'embedded';
    this.embedTarget = target;
    if (target.kind === 'enemy') {
      const centre = probe.enemyPos(target.id);
      if (centre) this.embedOffset.subVectors(this.pos, centre);
    }
    this.emit({ type: 'embed', target, pos: this.pos.clone() });
  }

  /** Pinned to an enemy, the blade rides their knockback; if they die/despawn it stays put. */
  private updateEmbedded(probe: EdgeHitProbe) {
    if (this.embedTarget?.kind !== 'enemy') return;
    const centre = probe.enemyPos(this.embedTarget.id);
    if (centre) this.pos.copy(centre).add(this.embedOffset);
  }

  private updateRecalling(dt: number, handPos: THREE.Vector3) {
    if (this.ripTimer > 0) {
      this.ripTimer -= dt;
      return;
    }
    this.spin += dt * 24;
    this.arcT = Math.min(1, this.arcT + dt / this.arcDuration);

    // Quadratic bezier with a LIVE endpoint: P2 is wherever the hand is now.
    const t = this.arcT;
    const line = new THREE.Vector3().subVectors(handPos, this.arcStart);
    const bulge = THREE.MathUtils.clamp(line.length() * ARC_BULGE, ARC_BULGE_MIN, ARC_BULGE_MAX);
    const ctrl = new THREE.Vector3()
      .copy(this.arcStart).addScaledVector(line, 0.5)
      .addScaledVector(this.arcSide, bulge);
    ctrl.y += 0.6; // lift the mid-arc so ground recalls hop up into the hand

    const a = new THREE.Vector3().lerpVectors(this.arcStart, ctrl, t);
    const b = new THREE.Vector3().lerpVectors(ctrl, handPos, t);
    const next = new THREE.Vector3().lerpVectors(a, b, t);

    this.dir.subVectors(next, this.pos);
    if (this.dir.lengthSq() > 1e-8) this.dir.normalize();
    this.pos.copy(next);

    // The sim resolves sweep damage off this event (it owns enemy state).
    this.emit({ type: 'recallSweep', pos: this.pos.clone(), dir: this.dir.clone() });

    if (t >= 1) {
      this.state = 'held';
      this.embedTarget = null;
      this.pos.copy(handPos);
      this.emit({ type: 'catch', pos: handPos.clone() });
    }
  }

  private insideBlock(blocks: SimBlock[]): boolean {
    const p = this.pos;
    for (const b of blocks) {
      if (pointInBlock(p.x, p.y, p.z, b)) return true;
    }
    return false;
  }
}

export { RECALL_SWEEP_RADIUS, THROW_MAX_RANGE };
