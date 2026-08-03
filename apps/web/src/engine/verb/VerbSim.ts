import * as THREE from 'three';
import {
  RiftEdge, RECALL_SWEEP_RADIUS,
  type EdgeEvent, type EdgeState,
} from './RiftEdge';
import { BossBrain, type BossEvent } from './Boss';
import { pointInBlock, pushCircleOut, type SimBlock } from './blocks';

/**
 * Headless graybox sim for the Verb (CLONE_PLAN.md slices 1 + 4).
 *
 * Slice 1 built the hero's verb (melee string, throw, magnet recall, catch
 * follow-up, dash). Slice 4 wakes the other side up: dummies with an
 * `archetype` are ENEMIES that fight back —
 *
 *   rusher  — closes distance, telegraphed melee lunge
 *   gunner  — kites to range, telegraphed shot with real travel time
 *             (blocks are cover: shots die on them)
 *   bulwark — slow wall; a front guard eats damage into POSTURE instead of
 *             HP until it breaks. Turns slowly, so the recall arc through
 *             its back is the counter the verb was born for.
 *
 * Fairness comes from the GoW rule: an AGGRESSION TOKEN DIRECTOR grants at
 * most ENGAGE_TOKENS attack rights at once; everyone else circles. Every
 * attack has a windup the player can hear (scene plays spatial tells) and
 * dodge — the dash carries i-frames now.
 *
 * Dummies WITHOUT an archetype stay inert training props (slice 1 tests).
 * The sim emits events; all juice lives in the scene layer.
 */

export type Archetype = 'rusher' | 'gunner' | 'bulwark';

export interface DummySpec {
  pos: [number, number];
  /** Legacy inert shambler (training prop) — walks, never attacks. */
  walker?: boolean;
  /** Combat archetype; omit for an inert training dummy. */
  archetype?: Archetype;
  /** Boss body: driven by a BossBrain (see Boss.ts), ignores the token director. */
  boss?: boolean;
}

export interface VerbSimOptions {
  dummies: DummySpec[];
  blocks?: SimBlock[];
  heroPos?: [number, number];
}

/** Enemy attack state; inert dummies stay 'idle' forever.
 *  'phase' is boss-only: the invulnerable transition beat. */
export type EnemyAI = 'idle' | 'reposition' | 'windup' | 'strike' | 'recover' | 'broken' | 'phase';

export interface DummyState {
  id: number;
  pos: THREE.Vector3;
  hp: number;
  maxHp: number;
  dead: boolean;
  flash: number;
  respawn: number;
  walker: boolean;
  archetype?: Archetype;
  spawn: THREE.Vector3;
  vel: THREE.Vector3;
  stagger: number;
  // ── Slice 4 ──
  yaw: number;           // facing; bulwarks turn slowly (flankable)
  ai: EnemyAI;
  aiT: number;           // seconds left in the current ai state
  windupTotal: number;   // length of the running windup (for telegraph ramps)
  hasToken: boolean;
  attackCd: number;
  orbitDir: 1 | -1;
  posture: number;       // bulwark: guard damage absorbed so far
  guardUp: boolean;      // bulwark: front guard active
  // ── Boss (slice 4b) ──
  boss: boolean;
  radius: number;        // body radius: 0.45 troops, 0.7 boss
  bossPhase?: number;
}

export interface EnemyProjectile {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  alive: boolean;
  travelled: number;
  damage: number;
}

export type MeleeStage = 0 | 1 | 2 | 3;

export type VerbEvent =
  | { type: 'meleeSwing'; stage: MeleeStage; buffed: boolean }
  | { type: 'meleeHit'; stage: MeleeStage; dummyId: number; pos: THREE.Vector3; damage: number; buffed: boolean }
  | { type: 'meleeWhiff'; stage: MeleeStage }
  | { type: 'recallHit'; dummyId: number; pos: THREE.Vector3 }
  | { type: 'dummyDeath'; dummyId: number; pos: THREE.Vector3 }
  | { type: 'dash' }
  // ── Slice 4 ──
  | { type: 'enemyWindup'; dummyId: number; archetype: Archetype; pos: THREE.Vector3; windup: number }
  | { type: 'enemyStrike'; dummyId: number; archetype: Archetype; pos: THREE.Vector3; hit: boolean }
  | { type: 'enemyShot'; dummyId: number; pos: THREE.Vector3 }
  | { type: 'guardBlock'; dummyId: number; pos: THREE.Vector3 }
  | { type: 'postureBreak'; dummyId: number; pos: THREE.Vector3 }
  | { type: 'heroHit'; damage: number; pos: THREE.Vector3; dir: THREE.Vector3 }
  | { type: 'heroDown'; pos: THREE.Vector3 }
  | BossEvent
  | Exclude<EdgeEvent, { type: 'recallSweep' }>;

// ── Hero tuning ──────────────────────────────────────────────────────────────

const MOVE_SPEED = 5.2;
const AIM_MOVE_SPEED = 2.6;
const TURN_LERP = 14;

const DASH_SPEED = 11;
const DASH_TIME = 0.16;
const DASH_COOLDOWN = 0.45;
/** The dodge: invulnerable from the dash press for this long. */
const DASH_IFRAMES = 0.28;
/** Post-hit mercy window so packs can't shred instantly. */
const HIT_IFRAMES = 0.6;

const HERO_MAX_HP = 100;
const HERO_HIT_KNOCKBACK = 2.6;

const MELEE_RANGE = 1.9;
const MELEE_ARC_COS = Math.cos((70 * Math.PI) / 180 / 2 + 0.5);
const MAGNET_RANGE = 3.2;
const LUNGE_DIST = 0.55;

interface StrikeSpec { active: number; cancel: number; recover: number; damage: number; knockback: number }
const ARMED: StrikeSpec[] = [
  { active: 0.12, cancel: 0.26, recover: 0.42, damage: 8,  knockback: 1.6 },
  { active: 0.12, cancel: 0.26, recover: 0.42, damage: 8,  knockback: 1.8 },
  { active: 0.17, cancel: 0.40, recover: 0.55, damage: 14, knockback: 4.2 },
];
const UNARMED: StrikeSpec[] = [
  { active: 0.09, cancel: 0.20, recover: 0.34, damage: 6,  knockback: 1.2 },
  { active: 0.09, cancel: 0.20, recover: 0.34, damage: 6,  knockback: 1.4 },
  { active: 0.14, cancel: 0.32, recover: 0.46, damage: 10, knockback: 3.4 },
];
const CATCH_FOLLOWUP_WINDOW = 0.28;
const CATCH_FOLLOWUP_MULT = 1.5;

const INPUT_BUFFER = 0.2;

const THROW_DAMAGE = 22;
const THROW_KNOCKBACK = 5;
const RECALL_DAMAGE = 12;
const RECALL_KNOCKBACK = 3;

// ── Enemy tuning ─────────────────────────────────────────────────────────────

/** The GoW fairness rule: at most this many enemies may attack at once. */
const ENGAGE_TOKENS = 2;

interface ArchetypeSpec {
  hp: number;
  speed: number;
  turnLerp: number;      // low = flankable
  engageRange: number;   // wants a token inside this
  attackRange: number;
  windup: number;        // telegraph the player hears/sees
  strikeDur: number;
  recover: number;
  damage: number;
  cooldown: number;      // after an attack, before wanting a token again
  orbitRadius: number;   // tokenless circling distance
}

export const ARCHETYPES: Record<Archetype, ArchetypeSpec> = {
  rusher: {
    hp: 50, speed: 2.7, turnLerp: 10,
    engageRange: 13, attackRange: 1.9, windup: 0.55, strikeDur: 0.12,
    recover: 0.4, damage: 12, cooldown: 1.6, orbitRadius: 5.5,
  },
  gunner: {
    hp: 40, speed: 2.2, turnLerp: 10,
    engageRange: 15, attackRange: 14, windup: 0.7, strikeDur: 0.05,
    recover: 0.45, damage: 10, cooldown: 2.4, orbitRadius: 9,
  },
  bulwark: {
    hp: 90, speed: 1.35, turnLerp: 2.2,
    engageRange: 8, attackRange: 2.3, windup: 0.9, strikeDur: 0.16,
    recover: 0.6, damage: 18, cooldown: 2.2, orbitRadius: 4.5,
  },
};

/** Guard damage a bulwark absorbs before the break. */
const POSTURE_BREAK = 30;
const POSTURE_BROKEN_TIME = 2.6;
/** Attacks travelling INTO the bulwark's facing get guarded. */
const GUARD_FACING_DOT = -0.25;
const GUARD_DAMAGE_MULT = 0.25;

const GUNNER_KITE_RANGE = 6;   // backs away inside this
const PROJECTILE_SPEED = 10;
const PROJECTILE_RADIUS = 0.6; // vs hero
const PROJECTILE_MAX_DIST = 34;

const DUMMY_HP = 60;
const DUMMY_RADIUS = 0.45;
const BOSS_HP = 220;
const BOSS_RADIUS = 0.7;
const HERO_RADIUS = 0.4;
const DUMMY_RESPAWN = 2.5;
const WALKER_SPEED = 1.15;
const WALKER_STOP = 2.0;
const KNOCKBACK_DECAY = 6;

const HAND_HEIGHT = 1.25;
const HAND_RIGHT = 0.35;

/** Playable ring: matches Ashfall's ROAM bound so nobody kites into the void. */
const WORLD_RADIUS = 26;

const AIM_CONE_COS = Math.cos((12 * Math.PI) / 180);

// ─────────────────────────────────────────────────────────────────────────────

export class VerbSim {
  readonly heroPos: THREE.Vector3;
  heroYaw = 0;
  readonly edge = new RiftEdge();
  respawnEnabled = true;
  /** Off during title/intro/beat phases: enemies hold instead of hunting. */
  combatEnabled = true;

  private dummies: DummyState[] = [];
  private blocks: SimBlock[];
  private projectiles: EnemyProjectile[] = [];

  private moveX = 0;
  private moveY = 0;
  private cameraYaw = 0;
  private aiming = false;

  private attackBuffer = -1;
  private meleeStage: MeleeStage = 0;
  private meleeT = 0;
  private meleeHitDone = false;
  private meleeBuffed = false;
  private strikes: StrikeSpec[] = ARMED;

  private dashT = 0;
  private dashCooldown = 0;
  private dashDir = new THREE.Vector3(0, 0, 1);

  private catchWindow = 0;
  private sweepHit = new Set<number>();

  private _heroHp = HERO_MAX_HP;
  private heroInvulnT = 0;
  private heroKnock = new THREE.Vector3();
  private heroDead = false;

  private time = 0;
  private listeners: Array<(e: VerbEvent) => void> = [];

  private bossBrain: BossBrain | null = null;

  constructor(opts: VerbSimOptions) {
    this.heroPos = new THREE.Vector3(opts.heroPos?.[0] ?? 0, 0, opts.heroPos?.[1] ?? 8);
    this.blocks = opts.blocks ?? [];
    this.buildRoster(opts.dummies);
    this.edge.onEvent((e) => this.onEdgeEvent(e));
  }

  /** Swap the enemy roster (round changes: troops → boss). Resets the round. */
  setRoster(specs: DummySpec[]) {
    this.buildRoster(specs);
    this.resetRound();
  }

  private buildRoster(specs: DummySpec[]) {
    this.bossBrain = specs.some((s) => s.boss) ? new BossBrain() : null;
    this.dummies = specs.map((d, i) => {
      const hp = d.boss ? BOSS_HP : d.archetype ? ARCHETYPES[d.archetype].hp : DUMMY_HP;
      return {
        id: i,
        pos: new THREE.Vector3(d.pos[0], 0, d.pos[1]),
        hp,
        maxHp: hp,
        dead: false,
        flash: 0,
        respawn: 0,
        walker: !!d.walker,
        archetype: d.archetype,
        spawn: new THREE.Vector3(d.pos[0], 0, d.pos[1]),
        vel: new THREE.Vector3(),
        stagger: 0,
        // Spawn aware: face the hero (bulwarks turn too slowly to fake this).
        yaw: Math.atan2(this.heroPos.x - d.pos[0], this.heroPos.z - d.pos[1]),
        ai: 'idle' as const,
        aiT: 0,
        windupTotal: 1,
        hasToken: false,
        attackCd: 0.6 + i * 0.4, // stagger first attacks so the opener is readable
        orbitDir: (i % 2 === 0 ? 1 : -1) as 1 | -1,
        posture: 0,
        guardUp: d.archetype === 'bulwark',
        boss: !!d.boss,
        radius: d.boss ? BOSS_RADIUS : DUMMY_RADIUS,
      };
    });
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  setMove(x: number, y: number) { this.moveX = x; this.moveY = y; }
  setCameraYaw(yaw: number) { this.cameraYaw = yaw; }
  setAiming(aiming: boolean) { this.aiming = aiming; }

  pressAttack() {
    if (this.heroDead) return;
    if (this.aiming && this.edge.state === 'held') {
      this.throwEdge();
      return;
    }
    this.attackBuffer = this.time + INPUT_BUFFER;
  }

  pressThrow() {
    if (this.heroDead) return;
    if (this.edge.state === 'held') this.throwEdge();
  }

  pressRecall() {
    if (this.heroDead) return;
    this.edge.recall(this.handPos());
  }

  pressDash() {
    if (this.heroDead) return;
    if (this.dashCooldown > 0 || this.dashT > 0) return;
    const dir = this.moveWorldDir();
    this.dashDir.copy(dir.lengthSq() > 1e-4 ? dir : this.facingDir());
    this.dashT = DASH_TIME;
    this.dashCooldown = DASH_COOLDOWN;
    this.heroInvulnT = Math.max(this.heroInvulnT, DASH_IFRAMES); // the dodge
    this.emit({ type: 'dash' });
  }

  // ── Public state ───────────────────────────────────────────────────────────

  onEvent(cb: (e: VerbEvent) => void): () => void {
    this.listeners.push(cb);
    return () => { this.listeners = this.listeners.filter((l) => l !== cb); };
  }

  getDummies(): readonly DummyState[] { return this.dummies; }
  getProjectiles(): readonly EnemyProjectile[] { return this.projectiles; }
  get allDown(): boolean { return this.dummies.every((d) => d.dead); }
  get isAiming() { return this.aiming; }
  get edgeState(): EdgeState { return this.edge.state; }
  get meleeState(): { stage: MeleeStage; t: number } { return { stage: this.meleeStage, t: this.meleeT }; }
  get armed(): boolean { return this.edge.state === 'held'; }
  get dashing(): boolean { return this.dashT > 0; }
  get heroHp(): number { return this._heroHp; }
  get heroMaxHp(): number { return HERO_MAX_HP; }
  get heroIsDown(): boolean { return this.heroDead; }

  softLockTarget(): THREE.Vector3 | null {
    let best: DummyState | null = null;
    let bestD = Infinity;
    for (const d of this.dummies) {
      if (d.dead) continue;
      const dist = d.pos.distanceToSquared(this.heroPos);
      if (dist < bestD) { bestD = dist; best = d; }
    }
    return best ? best.pos : null;
  }

  handPos(): THREE.Vector3 {
    const f = this.facingDir();
    const right = new THREE.Vector3(-f.z, 0, f.x);
    return this.heroPos.clone()
      .addScaledVector(right, HAND_RIGHT)
      .setY(HAND_HEIGHT);
  }

  /** Dev/probe helper: drop every living dummy through the normal damage
   *  path so death events (and the kill moment) fire exactly as in play. */
  debugKillAll() {
    const dir = this.facingDir();
    for (const d of this.dummies) {
      if (!d.dead) {
        d.guardUp = false; // a debug kill ignores the shield
        this.damageDummy(d, d.hp, dir, 2);
      }
    }
  }

  /** Round restart: everyone back up, blade back in the hand, hero stays put. */
  resetRound() {
    for (const d of this.dummies) {
      d.dead = false;
      d.hp = d.maxHp;
      d.pos.copy(d.spawn);
      d.vel.set(0, 0, 0);
      d.flash = 0;
      d.stagger = 0;
      d.respawn = 0;
      d.ai = 'idle';
      d.aiT = 0;
      d.hasToken = false;
      d.attackCd = 0.6 + d.id * 0.4;
      d.posture = 0;
      d.guardUp = d.archetype === 'bulwark';
      d.yaw = Math.atan2(this.heroPos.x - d.spawn.x, this.heroPos.z - d.spawn.z);
    }
    this.bossBrain?.reset();
    this.projectiles = [];
    this._heroHp = HERO_MAX_HP;
    this.heroDead = false;
    this.heroInvulnT = 0;
    this.heroKnock.set(0, 0, 0);
    this.meleeStage = 0;
    this.meleeT = 0;
    this.attackBuffer = -1;
    this.catchWindow = 0;
    this.edge.reset(this.handPos());
  }

  // ── Tick ───────────────────────────────────────────────────────────────────

  step(dt: number) {
    this.time += dt;
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.catchWindow = Math.max(0, this.catchWindow - dt);
    this.heroInvulnT = Math.max(0, this.heroInvulnT - dt);

    this.updateHero(dt);
    this.updateMelee(dt);
    this.assignTokens();
    this.updateDummies(dt);
    this.updateProjectiles(dt);
    this.resolveBodies();
    this.edge.update(dt, this.handPos(), this.probe, this.blocks);
  }

  private updateHero(dt: number) {
    // Knockback from enemy hits rides on top of everything.
    if (this.heroKnock.lengthSq() > 1e-4) {
      this.heroPos.addScaledVector(this.heroKnock, dt);
      this.heroKnock.multiplyScalar(Math.max(0, 1 - KNOCKBACK_DECAY * dt));
    }
    if (this.heroDead) {
      this.pushOutOfBlocks(this.heroPos, HERO_RADIUS);
      return;
    }
    if (this.dashT > 0) {
      this.dashT -= dt;
      this.heroPos.addScaledVector(this.dashDir, DASH_SPEED * dt);
    } else if (this.meleeStage === 0) {
      const dir = this.moveWorldDir();
      const speed = this.aiming ? AIM_MOVE_SPEED : MOVE_SPEED;
      this.heroPos.addScaledVector(dir, speed * dt);

      const face = this.aiming
        ? new THREE.Vector3(-Math.sin(this.cameraYaw), 0, -Math.cos(this.cameraYaw))
        : dir;
      if (face.lengthSq() > 1e-4) {
        const target = Math.atan2(face.x, face.z);
        this.heroYaw = dampAngle(this.heroYaw, target, TURN_LERP, dt);
      }
    }
    this.pushOutOfBlocks(this.heroPos, HERO_RADIUS);
  }

  private updateMelee(dt: number) {
    if (this.heroDead) { this.meleeStage = 0; return; }
    if (this.meleeStage === 0) {
      if (this.attackBuffer >= this.time) this.startStrike(1);
      return;
    }

    this.meleeT += dt;
    const spec = this.strikes[this.meleeStage - 1];

    if (!this.meleeHitDone && this.meleeT >= spec.active) {
      this.meleeHitDone = true;
      this.resolveStrike(spec);
    }
    if (this.meleeT >= spec.cancel && this.attackBuffer >= this.time && this.meleeStage < 3) {
      this.startStrike((this.meleeStage + 1) as MeleeStage);
      return;
    }
    if (this.meleeT >= spec.recover) {
      this.meleeStage = 0;
      this.meleeT = 0;
    }
  }

  private startStrike(stage: MeleeStage) {
    this.attackBuffer = -1;
    this.strikes = this.armed ? ARMED : UNARMED;
    this.meleeStage = stage;
    this.meleeHitDone = false;
    this.meleeBuffed = stage === 1 && this.catchWindow > 0;
    this.meleeT = this.meleeBuffed ? this.strikes[0].active : 0;
    this.catchWindow = 0;

    const target = this.nearestInMagnetRange();
    if (target) {
      const to = new THREE.Vector3().subVectors(target.pos, this.heroPos).setY(0);
      if (to.lengthSq() > 1e-4) {
        this.heroYaw = Math.atan2(to.x, to.z);
        const gap = to.length() - (MELEE_RANGE - 0.4);
        if (gap > 0) this.heroPos.addScaledVector(to.normalize(), Math.min(LUNGE_DIST, gap));
      }
    }
    this.emit({ type: 'meleeSwing', stage, buffed: this.meleeBuffed });
  }

  private resolveStrike(spec: StrikeSpec) {
    const facing = this.facingDir();
    const mult = this.meleeBuffed ? CATCH_FOLLOWUP_MULT : 1;
    let landed = false;

    for (const d of this.dummies) {
      if (d.dead) continue;
      const to = new THREE.Vector3().subVectors(d.pos, this.heroPos).setY(0);
      const dist = to.length();
      if (dist > MELEE_RANGE + d.radius) continue;
      if (dist > 0.01 && to.normalize().dot(facing) < MELEE_ARC_COS) continue;

      landed = true;
      const dealt = this.damageDummy(d, Math.round(spec.damage * mult), facing, spec.knockback);
      if (dealt > 0) {
        this.emit({
          type: 'meleeHit', stage: this.meleeStage, dummyId: d.id,
          pos: d.pos.clone().setY(1.1), damage: dealt,
          buffed: this.meleeBuffed,
        });
      }
    }
    if (!landed) this.emit({ type: 'meleeWhiff', stage: this.meleeStage });
  }

  private throwEdge() {
    const hand = this.handPos();
    const dir = this.aimDir(hand);
    this.edge.throw(hand, dir);
  }

  private aimDir(from: THREE.Vector3): THREE.Vector3 {
    const forward = new THREE.Vector3(
      -Math.sin(this.cameraYaw), 0, -Math.cos(this.cameraYaw));
    let best: THREE.Vector3 | null = null;
    let bestDot = AIM_CONE_COS;
    for (const d of this.dummies) {
      if (d.dead) continue;
      const chest = d.pos.clone().setY(1.1);
      const to = chest.clone().sub(from).normalize();
      const dot = to.clone().setY(0).normalize().dot(forward);
      if (dot > bestDot) { bestDot = dot; best = chest.clone().sub(from).normalize(); }
    }
    return best ?? forward;
  }

  private onEdgeEvent(e: EdgeEvent) {
    if (e.type === 'embed' && e.target.kind === 'enemy') {
      const d = this.dummies[e.target.id];
      if (d && !d.dead) {
        this.damageDummy(d, THROW_DAMAGE, this.edge.dir, THROW_KNOCKBACK);
      }
    }
    if (e.type === 'recallStart') this.sweepHit.clear();
    if (e.type === 'recallSweep') {
      for (const d of this.dummies) {
        if (d.dead || this.sweepHit.has(d.id)) continue;
        const flat = d.pos.clone().setY(0).distanceTo(e.pos.clone().setY(0));
        if (flat <= RECALL_SWEEP_RADIUS + d.radius && e.pos.y < 1.9) {
          this.sweepHit.add(d.id);
          const dealt = this.damageDummy(d, RECALL_DAMAGE, e.dir, RECALL_KNOCKBACK);
          if (dealt > 0) this.emit({ type: 'recallHit', dummyId: d.id, pos: d.pos.clone().setY(1.1) });
        }
      }
      return;
    }
    if (e.type === 'catch') this.catchWindow = CATCH_FOLLOWUP_WINDOW;
    this.emit(e);
  }

  /**
   * Damage with the bulwark guard rule: attacks travelling into an intact
   * front guard deal 25% and feed POSTURE; the rest lands whole. Returns HP
   * actually dealt (0 when fully... the guard never fully zeroes — chip stays).
   */
  private damageDummy(d: DummyState, amount: number, dir: THREE.Vector3, knockback: number): number {
    // Boss rules: phase transitions are sacred, and 220kg doesn't fly.
    if (d.boss && this.bossBrain?.invulnerable) return 0;
    if (d.boss) knockback *= 0.15;

    let dealt = amount;
    if (d.archetype === 'bulwark' && d.guardUp && d.ai !== 'broken') {
      const facing = new THREE.Vector3(Math.sin(d.yaw), 0, Math.cos(d.yaw));
      const flat = dir.clone().setY(0);
      const intoFace = flat.lengthSq() > 1e-4 && flat.normalize().dot(facing) < GUARD_FACING_DOT;
      if (intoFace) {
        dealt = Math.max(1, Math.round(amount * GUARD_DAMAGE_MULT));
        d.posture += amount;
        this.emit({ type: 'guardBlock', dummyId: d.id, pos: d.pos.clone().setY(1.2) });
        if (d.posture >= POSTURE_BREAK) {
          d.guardUp = false;
          d.ai = 'broken';
          d.aiT = POSTURE_BROKEN_TIME;
          this.releaseToken(d);
          this.emit({ type: 'postureBreak', dummyId: d.id, pos: d.pos.clone().setY(1.2) });
        }
      }
    }

    d.hp -= dealt;
    d.flash = 0.28;
    d.stagger = Math.max(d.stagger, 0.25);
    const push = dir.clone().setY(0);
    if (push.lengthSq() > 1e-4) d.vel.addScaledVector(push.normalize(), knockback);
    if (d.hp <= 0) {
      d.dead = true;
      d.respawn = DUMMY_RESPAWN;
      this.releaseToken(d);
      this.emit({ type: 'dummyDeath', dummyId: d.id, pos: d.pos.clone() });
    }
    return dealt;
  }

  private damageHero(amount: number, from: THREE.Vector3) {
    if (this.heroDead || this.heroInvulnT > 0) return;
    this._heroHp -= amount;
    this.heroInvulnT = HIT_IFRAMES;
    const dir = new THREE.Vector3().subVectors(this.heroPos, from).setY(0);
    if (dir.lengthSq() > 1e-4) this.heroKnock.addScaledVector(dir.normalize(), HERO_HIT_KNOCKBACK);
    this.emit({
      type: 'heroHit', damage: amount,
      pos: this.heroPos.clone().setY(1.1),
      dir: dir.clone(),
    });
    if (this._heroHp <= 0) {
      this._heroHp = 0;
      this.heroDead = true;
      for (const d of this.dummies) this.releaseToken(d);
      this.emit({ type: 'heroDown', pos: this.heroPos.clone() });
    }
  }

  // ── The aggression token director ──────────────────────────────────────────

  /** Nearest hungry enemies get the ENGAGE_TOKENS attack rights; ties go on. */
  private assignTokens() {
    if (this.heroDead || !this.combatEnabled) return;
    let held = 0;
    for (const d of this.dummies) if (d.hasToken && !d.dead) held++;

    if (held >= ENGAGE_TOKENS) return;
    const hungry = this.dummies
      .filter((d) =>
        !d.dead && d.archetype && !d.hasToken && d.attackCd <= 0 &&
        (d.ai === 'idle' || d.ai === 'reposition') &&
        d.pos.distanceTo(this.heroPos) <= ARCHETYPES[d.archetype].engageRange)
      .sort((a, b) => a.pos.distanceTo(this.heroPos) - b.pos.distanceTo(this.heroPos));

    for (const d of hungry) {
      if (held >= ENGAGE_TOKENS) break;
      d.hasToken = true;
      held++;
    }
  }

  private releaseToken(d: DummyState) {
    d.hasToken = false;
  }

  // ── Enemies ────────────────────────────────────────────────────────────────

  private updateDummies(dt: number) {
    for (const d of this.dummies) {
      d.flash = Math.max(0, d.flash - dt);
      d.stagger = Math.max(0, d.stagger - dt);
      d.attackCd = Math.max(0, d.attackCd - dt);

      if (d.dead) {
        if (!this.respawnEnabled) continue;
        d.respawn -= dt;
        if (d.respawn <= 0) {
          d.dead = false;
          d.hp = d.maxHp;
          d.pos.copy(d.spawn);
          d.vel.set(0, 0, 0);
        }
        continue;
      }

      if (d.vel.lengthSq() > 1e-4) {
        d.pos.addScaledVector(d.vel, dt);
        d.vel.multiplyScalar(Math.max(0, 1 - KNOCKBACK_DECAY * dt));
      }

      if (d.boss) {
        if (!this.combatEnabled) { d.ai = 'idle'; continue; }
        this.bossBrain?.update(d, {
          heroPos: this.heroPos,
          heroDead: this.heroDead,
          damageHero: (amount, from) => this.damageHero(amount, from),
          spawnProjectile: (from, dir, speed, damage) =>
            this.spawnProjectile(from, dir, speed, damage),
          emit: (e) => this.emit(e),
        }, dt);
        this.pushOutOfBlocks(d.pos, d.radius);
        continue;
      }

      if (d.archetype) {
        this.updateEnemy(d, dt);
        this.pushOutOfBlocks(d.pos, d.radius);
        continue;
      }

      // Legacy inert walker prop.
      if (d.walker && d.stagger <= 0) {
        const to = new THREE.Vector3().subVectors(this.heroPos, d.pos).setY(0);
        if (to.length() > WALKER_STOP) {
          d.pos.addScaledVector(to.normalize(), WALKER_SPEED * dt);
        }
      }
    }
  }

  private updateEnemy(d: DummyState, dt: number) {
    const spec = ARCHETYPES[d.archetype!];
    const toHero = new THREE.Vector3().subVectors(this.heroPos, d.pos).setY(0);
    const dist = toHero.length();
    const heroDir = dist > 1e-4 ? toHero.clone().normalize() : new THREE.Vector3(0, 0, 1);

    if (!this.combatEnabled) {
      // Hold: face the hero, stand ready, attack nothing.
      d.ai = 'idle';
      d.yaw = dampAngle(d.yaw, Math.atan2(heroDir.x, heroDir.z), spec.turnLerp, dt);
      return;
    }

    // Face the hero — bulwarks slowly, which is what makes them flankable.
    if (d.ai !== 'broken') {
      d.yaw = dampAngle(d.yaw, Math.atan2(heroDir.x, heroDir.z), spec.turnLerp, dt);
    }

    switch (d.ai) {
      case 'idle':
      case 'reposition': {
        if (this.heroDead) { d.ai = 'idle'; return; }
        d.ai = 'reposition';
        if (d.stagger > 0) return;

        if (d.hasToken) {
          // Token holders close to their attack distance and wind up.
          const wantRange = d.archetype === 'gunner'
            ? THREE.MathUtils.clamp(dist, GUNNER_KITE_RANGE + 1, spec.attackRange - 1)
            : spec.attackRange - 0.3;
          const inRange = d.archetype === 'gunner'
            ? dist >= GUNNER_KITE_RANGE && dist <= spec.attackRange && this.hasLineOfSight(d.pos, this.heroPos)
            : dist <= spec.attackRange;
          if (inRange) {
            d.ai = 'windup';
            d.aiT = spec.windup;
            d.windupTotal = spec.windup;
            this.emit({
              type: 'enemyWindup', dummyId: d.id, archetype: d.archetype!,
              pos: d.pos.clone().setY(1.1), windup: spec.windup,
            });
          } else if (dist > wantRange) {
            d.pos.addScaledVector(heroDir, spec.speed * dt);
          } else if (d.archetype === 'gunner' && dist < GUNNER_KITE_RANGE) {
            d.pos.addScaledVector(heroDir, -spec.speed * dt); // kite away
          } else if (d.archetype === 'gunner') {
            // In the band but no clear shot: sidestep for a lane.
            const tang = new THREE.Vector3(-heroDir.z, 0, heroDir.x);
            d.pos.addScaledVector(tang, spec.speed * 0.8 * d.orbitDir * dt);
          }
        } else {
          // No token: circle at orbit radius — threatening, never mobbing.
          const tang = new THREE.Vector3(-heroDir.z, 0, heroDir.x);
          const radialErr = dist - spec.orbitRadius;
          d.pos.addScaledVector(heroDir, THREE.MathUtils.clamp(radialErr, -1, 1) * spec.speed * 0.6 * dt);
          d.pos.addScaledVector(tang, spec.speed * 0.55 * d.orbitDir * dt);
        }
        return;
      }

      case 'windup': {
        d.aiT -= dt;
        // Rushers creep in during the windup; the others plant.
        if (d.archetype === 'rusher' && dist > 1.2) {
          d.pos.addScaledVector(heroDir, spec.speed * 0.5 * dt);
        }
        if (d.aiT <= 0) {
          d.ai = 'strike';
          d.aiT = spec.strikeDur;
          this.resolveEnemyStrike(d, spec, dist);
        }
        return;
      }

      case 'strike': {
        d.aiT -= dt;
        if (d.aiT <= 0) {
          d.ai = 'recover';
          d.aiT = spec.recover;
        }
        return;
      }

      case 'recover': {
        d.aiT -= dt;
        if (d.aiT <= 0) {
          d.ai = 'reposition';
          d.attackCd = spec.cooldown + Math.random() * 0.8;
          this.releaseToken(d);
        }
        return;
      }

      case 'broken': {
        d.aiT -= dt;
        if (d.aiT <= 0) {
          d.ai = 'reposition';
          d.posture = 0;
          d.guardUp = true;
          d.attackCd = 1.0;
        }
        return;
      }
    }
  }

  private resolveEnemyStrike(d: DummyState, spec: ArchetypeSpec, dist: number) {
    if (d.archetype === 'gunner') {
      // A real projectile with travel time — the dash dodges it, cover eats it.
      const from = d.pos.clone().setY(1.2);
      const aim = this.heroPos.clone().setY(1.0).sub(from).normalize();
      this.spawnProjectile(from, aim, PROJECTILE_SPEED, ARCHETYPES.gunner.damage);
      this.emit({ type: 'enemyShot', dummyId: d.id, pos: from.clone() });
      this.emit({
        type: 'enemyStrike', dummyId: d.id, archetype: d.archetype!,
        pos: d.pos.clone().setY(1.1), hit: false,
      });
      return;
    }

    // Melee archetypes: connect if the hero is still inside the reach.
    const hit = dist <= spec.attackRange + 0.45 && this.heroInvulnT <= 0 && !this.heroDead;
    if (hit) this.damageHero(spec.damage, d.pos);
    this.emit({
      type: 'enemyStrike', dummyId: d.id, archetype: d.archetype!,
      pos: d.pos.clone().setY(1.1), hit,
    });
  }

  private spawnProjectile(from: THREE.Vector3, dir: THREE.Vector3, speed: number, damage: number) {
    this.projectiles.push({
      pos: from.clone(),
      vel: dir.clone().normalize().multiplyScalar(speed),
      alive: true,
      travelled: 0,
      damage,
    });
  }

  private updateProjectiles(dt: number) {
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      p.pos.addScaledVector(p.vel, dt);
      p.travelled += p.vel.length() * dt;

      if (p.travelled >= PROJECTILE_MAX_DIST || p.pos.y <= 0.02) { p.alive = false; continue; }
      if (this.pointInBlocks(p.pos)) { p.alive = false; continue; } // cover works
      if (!this.heroDead && this.heroInvulnT <= 0) {
        const flat = Math.hypot(p.pos.x - this.heroPos.x, p.pos.z - this.heroPos.z);
        if (flat <= PROJECTILE_RADIUS && p.pos.y >= 0.2 && p.pos.y <= 1.8) {
          p.alive = false;
          this.damageHero(p.damage, p.pos);
        }
      }
    }
    if (this.projectiles.length > 32) {
      this.projectiles = this.projectiles.filter((p) => p.alive);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private readonly probe = {
    enemyAt: (pos: THREE.Vector3, radius: number): number | null => {
      for (const d of this.dummies) {
        if (d.dead) continue;
        const flat = d.pos.clone().setY(0).distanceTo(pos.clone().setY(0));
        if (flat <= radius + d.radius && pos.y >= 0.15 && pos.y <= 1.85) return d.id;
      }
      return null;
    },
    enemyPos: (id: number): THREE.Vector3 | null => {
      const d = this.dummies[id];
      return d && !d.dead ? d.pos.clone().setY(1.1) : null;
    },
  };

  private moveWorldDir(): THREE.Vector3 {
    const fwd = new THREE.Vector3(-Math.sin(this.cameraYaw), 0, -Math.cos(this.cameraYaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const dir = new THREE.Vector3()
      .addScaledVector(fwd, this.moveY)
      .addScaledVector(right, this.moveX);
    return dir.lengthSq() > 1 ? dir.normalize() : dir;
  }

  private facingDir(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.heroYaw), 0, Math.cos(this.heroYaw));
  }

  private nearestInMagnetRange(): DummyState | null {
    const facing = this.facingDir();
    let best: DummyState | null = null;
    let bestDist = MAGNET_RANGE;
    for (const d of this.dummies) {
      if (d.dead) continue;
      const to = new THREE.Vector3().subVectors(d.pos, this.heroPos).setY(0);
      const dist = to.length();
      if (dist > MAGNET_RANGE) continue;
      if (dist > 0.6 && to.normalize().dot(facing) < 0.1) continue;
      if (dist < bestDist) { bestDist = dist; best = d; }
    }
    return best;
  }

  /** Coarse LOS: sample the segment against the blocks at torso height. */
  private hasLineOfSight(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const steps = Math.max(2, Math.ceil(a.distanceTo(b) / 0.5));
    const probe = new THREE.Vector3();
    for (let i = 1; i < steps; i++) {
      probe.lerpVectors(a, b, i / steps).setY(1.2);
      if (this.pointInBlocks(probe)) return false;
    }
    return true;
  }

  private pointInBlocks(p: THREE.Vector3): boolean {
    for (const b of this.blocks) {
      if (pointInBlock(p.x, p.y, p.z, b)) return true;
    }
    return false;
  }

  private pushOutOfBlocks(pos: THREE.Vector3, r: number) {
    for (const b of this.blocks) {
      if (b.height < 0.4) continue; // low debris, step over
      pushCircleOut(pos, r, b);
    }
    // Nobody leaves the village: a soft world bound keeps every body inside
    // the playable ring (the street mouths would otherwise run to infinity).
    const d = Math.hypot(pos.x, pos.z);
    if (d > WORLD_RADIUS) {
      pos.x *= WORLD_RADIUS / d;
      pos.z *= WORLD_RADIUS / d;
    }
  }

  private resolveBodies() {
    for (const d of this.dummies) {
      if (d.dead) continue;
      const heroMin = HERO_RADIUS + d.radius;
      const sep = separation(this.heroPos, d.pos, heroMin);
      if (sep) {
        d.pos.add(sep);
        this.pushOutOfBlocks(d.pos, d.radius);
        const rest = separation(this.heroPos, d.pos, heroMin);
        if (rest) this.heroPos.sub(rest);
      }
    }
    for (let i = 0; i < this.dummies.length; i++) {
      for (let j = i + 1; j < this.dummies.length; j++) {
        const a = this.dummies[i]; const b = this.dummies[j];
        if (a.dead || b.dead) continue;
        const sep = separation(a.pos, b.pos, a.radius + b.radius);
        if (sep) {
          b.pos.addScaledVector(sep, 0.5);
          a.pos.addScaledVector(sep, -0.5);
        }
      }
    }
  }

  private emit(e: VerbEvent) {
    for (const l of this.listeners) l(e);
  }
}

/** XZ push that moves `b` out of `a`'s space, or null when clear of `minDist`. */
function separation(a: THREE.Vector3, b: THREE.Vector3, minDist: number): THREE.Vector3 | null {
  const dx = b.x - a.x; const dz = b.z - a.z;
  const d2 = dx * dx + dz * dz;
  if (d2 >= minDist * minDist) return null;
  if (d2 < 1e-9) return new THREE.Vector3(0, 0, minDist);
  const d = Math.sqrt(d2);
  const push = minDist - d;
  return new THREE.Vector3((dx / d) * push, 0, (dz / d) * push);
}

/** Frame-rate independent angular damp (shortest path). */
function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * (1 - Math.exp(-lambda * dt));
}
