import * as THREE from 'three';

/**
 * The boss framework (CLONE_PLAN.md slice 4b) — a reusable brain that drives
 * a boss-flagged body owned by VerbSim. Future bosses are new brains (or new
 * move tables), not new engines.
 *
 * The contract with the rest of the game:
 *  - the brain writes the SAME `ai` field enemies use ('windup'/'strike'/…),
 *    so every readability system built in slice 4a — amber telegraph pulses,
 *    spatial tells, off-screen threat arrows — works on a boss for free
 *  - every move is telegraphed and dodgeable; phases only shrink the windups
 *  - phase transitions are a BEAT: the boss plants, roars, and is briefly
 *    invulnerable while the fight re-teaches itself
 *
 * CINDER (zone 1 finale, "he struck the match"):
 *   phase 1: torchSwing (two-hit melee) · emberToss (fan of three slow shots)
 *   phase 2: + flameRush (telegraphed line charge, long punish window)
 *   phase 3: + ashRing (planted AoE burst — run or dash out), all windups fast
 */

export type BossMove = 'torchSwing' | 'emberToss' | 'flameRush' | 'ashRing';

export type BossEvent =
  | { type: 'bossWindup'; move: BossMove; pos: THREE.Vector3; windup: number }
  | { type: 'bossStrike'; move: BossMove; pos: THREE.Vector3; hit: boolean }
  | { type: 'bossPhase'; phase: 2 | 3; pos: THREE.Vector3 };

/** What the brain needs from its body (structurally satisfied by DummyState). */
export interface BossBody {
  pos: THREE.Vector3;
  yaw: number;
  hp: number;
  maxHp: number;
  ai: string;          // shared enemy ai field — drives telegraphs/arrows
  aiT: number;
  windupTotal: number;
  bossPhase?: number;
}

/** Everything the brain may do to the world, supplied by VerbSim. */
export interface BossCtx {
  heroPos: THREE.Vector3;
  heroDead: boolean;
  damageHero(amount: number, from: THREE.Vector3): void;
  spawnProjectile(from: THREE.Vector3, dir: THREE.Vector3, speed: number, damage: number): void;
  emit(e: BossEvent): void;
}

interface MoveSpec {
  windup: number;
  cooldown: number;
  recover: number;
  minPhase: 1 | 2 | 3;
  minRange: number;
  maxRange: number;
}

const MOVES: Record<BossMove, MoveSpec> = {
  ashRing:   { windup: 1.1,  cooldown: 6.5, recover: 1.0, minPhase: 3, minRange: 0,   maxRange: 4.5 },
  flameRush: { windup: 0.95, cooldown: 5.5, recover: 1.3, minPhase: 2, minRange: 6.5, maxRange: 100 },
  torchSwing:{ windup: 0.65, cooldown: 1.4, recover: 0.7, minPhase: 1, minRange: 0,   maxRange: 2.6 },
  emberToss: { windup: 0.8,  cooldown: 3.4, recover: 0.8, minPhase: 1, minRange: 5,   maxRange: 15 },
};
/** Priority when several are legal: the spectacle first. */
const MOVE_PRIORITY: BossMove[] = ['ashRing', 'flameRush', 'torchSwing', 'emberToss'];

const SWING_DAMAGE = 14;
const SWING_RANGE = 2.6;
const SWING_SECOND_HIT_AT = 0.35;

const TOSS_COUNT = 3;
const TOSS_SPREAD = (14 * Math.PI) / 180;
const TOSS_SPEED = 8;
const TOSS_DAMAGE = 12;

const RUSH_SPEED = 14;
const RUSH_MAX_TIME = 1.15;
const RUSH_DAMAGE = 20;
const RUSH_CONTACT = 1.15;

const RING_RADIUS = 4;
const RING_DAMAGE = 22;

const APPROACH_SPEED = 1.9;
const APPROACH_SPEED_P3 = 2.3;
const TURN_LERP = 8;

const PHASE_TRANSITION_TIME = 1.8;
/** Windup multiplier per phase — the fight speeds up, the grammar doesn't change. */
const WINDUP_MULT = [1, 0.85, 0.72];

export class BossBrain {
  private state: 'approach' | 'windup' | 'strike' | 'rush' | 'recover' | 'phase' = 'approach';
  private move: BossMove | null = null;
  private t = 0;
  private phase: 1 | 2 | 3 = 1;
  private cds: Record<BossMove, number> = { torchSwing: 1.2, emberToss: 2.0, flameRush: 3.0, ashRing: 4.0 };
  private recoverAfter = 0.7;
  private rushDir = new THREE.Vector3(0, 0, 1);
  private rushHit = false;
  private swingSecondDone = false;

  /** Phase transitions are a beat, not a health check: no damage lands. */
  get invulnerable(): boolean {
    return this.state === 'phase';
  }

  get currentPhase(): number {
    return this.phase;
  }

  reset() {
    this.state = 'approach';
    this.move = null;
    this.t = 0;
    this.phase = 1;
    this.cds = { torchSwing: 1.2, emberToss: 2.0, flameRush: 3.0, ashRing: 4.0 };
  }

  update(body: BossBody, ctx: BossCtx, dt: number) {
    for (const k of Object.keys(this.cds) as BossMove[]) {
      this.cds[k] = Math.max(0, this.cds[k] - dt);
    }
    body.bossPhase = this.phase;

    // Phase crossings interrupt everything except a rush in motion.
    const frac = body.hp / body.maxHp;
    const wantPhase: 1 | 2 | 3 = frac <= 1 / 3 ? 3 : frac <= 2 / 3 ? 2 : 1;
    if (wantPhase > this.phase && this.state !== 'phase' && this.state !== 'rush') {
      this.phase = wantPhase;
      this.state = 'phase';
      this.t = PHASE_TRANSITION_TIME;
      body.ai = 'phase';
      ctx.emit({ type: 'bossPhase', phase: wantPhase as 2 | 3, pos: body.pos.clone().setY(1.3) });
      return;
    }

    const toHero = new THREE.Vector3().subVectors(ctx.heroPos, body.pos).setY(0);
    const dist = toHero.length();
    const heroDir = dist > 1e-4 ? toHero.clone().normalize() : new THREE.Vector3(0, 0, 1);

    // Face the hero except while planted (rush/ring windups aim then commit).
    const planted = (this.state === 'windup' && (this.move === 'flameRush' || this.move === 'ashRing'))
      || this.state === 'rush';
    if (!planted) {
      body.yaw = dampAngle(body.yaw, Math.atan2(heroDir.x, heroDir.z), TURN_LERP, dt);
    }

    switch (this.state) {
      case 'approach': {
        body.ai = 'reposition';
        if (ctx.heroDead) return;
        const move = this.chooseMove(dist);
        if (move) {
          this.startWindup(move, body, ctx, heroDir);
          return;
        }
        const speed = this.phase >= 3 ? APPROACH_SPEED_P3 : APPROACH_SPEED;
        if (dist > 2.2) body.pos.addScaledVector(heroDir, speed * dt);
        return;
      }

      case 'windup': {
        this.t -= dt;
        body.aiT = this.t;
        if (this.t <= 0) this.fire(body, ctx, dist);
        return;
      }

      case 'strike': {
        this.t -= dt;
        body.aiT = this.t;
        // Torch swing's second hit lands mid-strike, wider.
        if (this.move === 'torchSwing' && !this.swingSecondDone
          && this.t <= SWING_SECOND_HIT_AT) {
          this.swingSecondDone = true;
          const d2 = body.pos.distanceTo(ctx.heroPos);
          const hit = d2 <= SWING_RANGE + 0.8 && !ctx.heroDead;
          if (hit) ctx.damageHero(SWING_DAMAGE, body.pos);
          ctx.emit({ type: 'bossStrike', move: 'torchSwing', pos: body.pos.clone().setY(1.3), hit });
        }
        if (this.t <= 0) this.enterRecover(body);
        return;
      }

      case 'rush': {
        this.t -= dt;
        body.ai = 'strike'; // keeps the threat systems hot for the whole charge
        body.pos.addScaledVector(this.rushDir, RUSH_SPEED * dt);
        if (!this.rushHit && !ctx.heroDead) {
          if (body.pos.distanceTo(ctx.heroPos) <= RUSH_CONTACT) {
            this.rushHit = true;
            ctx.damageHero(RUSH_DAMAGE, body.pos);
            ctx.emit({ type: 'bossStrike', move: 'flameRush', pos: body.pos.clone().setY(1.3), hit: true });
          }
        }
        if (this.t <= 0) {
          if (!this.rushHit) {
            ctx.emit({ type: 'bossStrike', move: 'flameRush', pos: body.pos.clone().setY(1.3), hit: false });
          }
          this.enterRecover(body);
        }
        return;
      }

      case 'recover': {
        body.ai = 'recover';
        this.t -= dt;
        if (this.t <= 0) {
          this.state = 'approach';
          this.move = null;
        }
        return;
      }

      case 'phase': {
        this.t -= dt;
        body.aiT = this.t;
        if (this.t <= 0) {
          this.state = 'approach';
          body.ai = 'reposition';
        }
        return;
      }
    }
  }

  /** Deterministic choreography: fixed priority, gated by phase/range/cooldown. */
  private chooseMove(dist: number): BossMove | null {
    for (const m of MOVE_PRIORITY) {
      const spec = MOVES[m];
      if (this.phase < spec.minPhase) continue;
      if (this.cds[m] > 0) continue;
      if (dist < spec.minRange || dist > spec.maxRange) continue;
      return m;
    }
    return null;
  }

  private startWindup(move: BossMove, body: BossBody, ctx: BossCtx, heroDir: THREE.Vector3) {
    const windup = MOVES[move].windup * WINDUP_MULT[this.phase - 1];
    this.move = move;
    this.state = 'windup';
    this.t = windup;
    body.ai = 'windup';
    body.aiT = windup;
    body.windupTotal = windup;
    if (move === 'flameRush') this.rushDir.copy(heroDir); // aim locked at the plant
    ctx.emit({ type: 'bossWindup', move, pos: body.pos.clone().setY(1.3), windup });
  }

  private fire(body: BossBody, ctx: BossCtx, dist: number) {
    const move = this.move!;
    this.cds[move] = MOVES[move].cooldown;
    this.recoverAfter = MOVES[move].recover;

    switch (move) {
      case 'torchSwing': {
        this.state = 'strike';
        this.t = SWING_SECOND_HIT_AT + 0.15;
        this.swingSecondDone = false;
        body.ai = 'strike';
        const hit = dist <= SWING_RANGE + 0.45 && !ctx.heroDead;
        if (hit) ctx.damageHero(SWING_DAMAGE, body.pos);
        ctx.emit({ type: 'bossStrike', move, pos: body.pos.clone().setY(1.3), hit });
        return;
      }
      case 'emberToss': {
        this.state = 'strike';
        this.t = 0.15;
        body.ai = 'strike';
        const from = body.pos.clone().setY(1.35);
        const aimFlat = ctx.heroPos.clone().setY(1.0).sub(from).setY(0).normalize();
        for (let i = 0; i < TOSS_COUNT; i++) {
          const angle = (i - (TOSS_COUNT - 1) / 2) * TOSS_SPREAD;
          const dir = aimFlat.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
          dir.y = -0.02; // gentle arc down toward torso height
          ctx.spawnProjectile(from, dir.normalize(), TOSS_SPEED, TOSS_DAMAGE);
        }
        ctx.emit({ type: 'bossStrike', move, pos: from, hit: false });
        return;
      }
      case 'flameRush': {
        this.state = 'rush';
        this.t = RUSH_MAX_TIME;
        this.rushHit = false;
        body.ai = 'strike';
        return;
      }
      case 'ashRing': {
        this.state = 'strike';
        this.t = 0.2;
        body.ai = 'strike';
        const hit = dist <= RING_RADIUS && !ctx.heroDead;
        if (hit) ctx.damageHero(RING_DAMAGE, body.pos);
        ctx.emit({ type: 'bossStrike', move, pos: body.pos.clone().setY(0.2), hit });
        return;
      }
    }
  }

  private enterRecover(body: BossBody) {
    this.state = 'recover';
    this.t = this.recoverAfter;
    body.ai = 'recover';
  }
}

export { RING_RADIUS as BOSS_RING_RADIUS };

function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * (1 - Math.exp(-lambda * dt));
}
