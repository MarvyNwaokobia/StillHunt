import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  VerbSim, ARCHETYPES, computeEdgeArrow, pointInBlock, pushCircleOut,
  type VerbEvent,
} from '@/engine/verb';

/**
 * Slice 1 (CLONE_PLAN.md): the Rift Edge state machine and the melee string,
 * driven headlessly the same way the scene drives them.
 */

const DT = 1 / 60;

function run(sim: VerbSim, seconds: number) {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) sim.step(DT);
}

function collect(sim: VerbSim): VerbEvent[] {
  const events: VerbEvent[] = [];
  sim.onEvent((e) => events.push(e));
  return events;
}

afterEach(() => vi.restoreAllMocks());

describe('RiftEdge throw', () => {
  it('embeds in a world block crossing its path', () => {
    const sim = new VerbSim({
      dummies: [],
      heroPos: [0, 8],
      blocks: [{ x: 0, z: 2.3, hx: 1, hz: 0.3, height: 2 }],
    });
    const events = collect(sim);

    sim.setCameraYaw(0); // forward = -z
    sim.setAiming(true);
    sim.pressAttack(); // aimed attack = throw
    run(sim, 1.0);

    const embed = events.find((e) => e.type === 'embed');
    expect(embed).toBeDefined();
    expect(embed!.type === 'embed' && embed!.target.kind).toBe('world');
    expect(sim.edgeState).toBe('embedded');
    expect(sim.armed).toBe(false);
  });

  it('embeds in a dummy on the way and applies throw damage', () => {
    const sim = new VerbSim({ dummies: [{ pos: [0, -4] }], heroPos: [0, 8] });
    const events = collect(sim);

    sim.setCameraYaw(0);
    sim.setAiming(true);
    sim.pressAttack();
    run(sim, 1.0);

    const embed = events.find((e) => e.type === 'embed');
    expect(embed!.type === 'embed' && embed!.target.kind).toBe('enemy');
    expect(sim.getDummies()[0].hp).toBe(60 - 22);
  });

  it('throws instantly on pressThrow, no aim-hold needed', () => {
    const sim = new VerbSim({ dummies: [{ pos: [0, -4] }], heroPos: [0, 8] });
    const events = collect(sim);

    sim.setCameraYaw(0); // camera facing the dummy; assist cone does the rest
    sim.pressThrow();
    run(sim, 1.0);

    const embed = events.find((e) => e.type === 'embed');
    expect(embed).toBeDefined();
    expect(embed!.type === 'embed' && embed!.target.kind).toBe('enemy');
  });

  it('pitches into the ground at max range when nothing is hit', () => {
    const sim = new VerbSim({ dummies: [], heroPos: [0, 8] });
    const events = collect(sim);

    sim.setCameraYaw(0);
    sim.setAiming(true);
    sim.pressAttack();
    run(sim, 2.0);

    const embed = events.find((e) => e.type === 'embed');
    expect(embed!.type === 'embed' && embed!.target.kind).toBe('ground');
  });
});

describe('RiftEdge recall', () => {
  it('returns along the arc to a MOVING hero and fires catch', () => {
    const sim = new VerbSim({ dummies: [], heroPos: [0, 8] });
    const events = collect(sim);

    sim.setCameraYaw(0);
    sim.setAiming(true);
    sim.pressAttack();
    run(sim, 2.0);
    expect(sim.edgeState).toBe('embedded');

    sim.setAiming(false);
    sim.setMove(1, 0); // strafe while the blade returns
    sim.pressRecall();
    run(sim, 2.5);

    expect(events.some((e) => e.type === 'recallStart')).toBe(true);
    expect(events.some((e) => e.type === 'catch')).toBe(true);
    expect(sim.edgeState).toBe('held');
    // Caught in the hand wherever the hero ended up, not at the old spot.
    expect(sim.edge.pos.distanceTo(sim.handPos())).toBeLessThan(0.01);
  });

  it('can be recalled mid-flight', () => {
    const sim = new VerbSim({ dummies: [], heroPos: [0, 8] });
    const events = collect(sim);

    sim.setCameraYaw(0);
    sim.setAiming(true);
    sim.pressAttack();
    run(sim, 0.15); // still flying
    expect(sim.edgeState).toBe('thrown');

    sim.pressRecall();
    run(sim, 2.0);
    expect(events.some((e) => e.type === 'catch')).toBe(true);
    expect(sim.edgeState).toBe('held');
  });

  it('sweeps a dummy standing along the return arc', () => {
    // Pin the arc's side so the mid-arc bulge is deterministic (-x).
    vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const sim = new VerbSim({
      // Close to the hero, outside the 12° aim-assist cone and off the throw
      // line, but in the lane the return arc sweeps through on its way home.
      dummies: [{ pos: [-1.8, 3] }],
      heroPos: [0, 8],
    });
    const events = collect(sim);

    sim.setCameraYaw(0);
    sim.setAiming(true);
    sim.pressAttack();
    run(sim, 2.0); // ground embed far down -z
    expect(sim.getDummies()[0].hp).toBe(60); // untouched by the throw

    sim.setAiming(false);
    sim.pressRecall();
    run(sim, 2.5);

    expect(events.some((e) => e.type === 'recallHit')).toBe(true);
    expect(sim.getDummies()[0].hp).toBe(60 - 12);
  });
});

describe('melee string', () => {
  it('chains three strikes with buffered input, third hits hardest', () => {
    const sim = new VerbSim({ dummies: [{ pos: [0, 9.5] }], heroPos: [0, 8] });
    const events = collect(sim);

    // Mash roughly like a human: press, then re-press mid-swing.
    sim.pressAttack();
    run(sim, 0.15);
    sim.pressAttack();
    run(sim, 0.15);
    sim.pressAttack();
    run(sim, 0.15);
    sim.pressAttack();
    run(sim, 1.0);

    const hits = events.filter((e) => e.type === 'meleeHit');
    expect(hits.length).toBeGreaterThanOrEqual(3);
    const stages = hits.map((h) => h.type === 'meleeHit' && h.stage);
    expect(stages).toContain(1);
    expect(stages).toContain(2);
    expect(stages).toContain(3);
    const third = hits.find((h) => h.type === 'meleeHit' && h.stage === 3)!;
    expect(third.type === 'meleeHit' && third.damage).toBe(14);
  });

  it('whiffs against empty air', () => {
    const sim = new VerbSim({ dummies: [], heroPos: [0, 8] });
    const events = collect(sim);
    sim.pressAttack();
    run(sim, 0.5);
    expect(events.some((e) => e.type === 'meleeWhiff')).toBe(true);
    expect(events.some((e) => e.type === 'meleeHit')).toBe(false);
  });

  it('catch follow-up window buffs the next strike', () => {
    const sim = new VerbSim({ dummies: [{ pos: [0, 6.5] }], heroPos: [0, 8] });
    const events = collect(sim);

    sim.setCameraYaw(0);
    sim.setAiming(true);
    sim.pressAttack(); // throw (embeds in the dummy ahead)
    run(sim, 1.0);
    sim.setAiming(false);
    sim.pressRecall();

    // Step until the catch, then attack inside the follow-up window.
    let caught = false;
    const unsub = sim.onEvent((e) => { if (e.type === 'catch') caught = true; });
    for (let i = 0; i < 300 && !caught; i++) sim.step(DT);
    unsub();
    expect(caught).toBe(true);

    sim.pressAttack();
    run(sim, 0.3);

    const buffedHit = events.find((e) => e.type === 'meleeHit' && e.buffed);
    expect(buffedHit).toBeDefined();
    expect(buffedHit!.type === 'meleeHit' && buffedHit!.damage).toBe(12); // 8 × 1.5
  });
});

describe('the combat gate', () => {
  it('enemies hold during title/intro phases and hunt once combat enables', () => {
    const sim = new VerbSim({ dummies: [{ pos: [0, 5], archetype: 'rusher' }], heroPos: [0, 8] });
    sim.combatEnabled = false;
    run(sim, 5.0);
    expect(sim.heroHp).toBe(sim.heroMaxHp);
    expect(sim.getDummies()[0].ai).toBe('idle');

    sim.combatEnabled = true;
    run(sim, 6.0);
    expect(sim.heroHp).toBeLessThan(sim.heroMaxHp);
  });
});

describe('rotated blocks (Ashfall walls have yaw)', () => {
  const wall = { x: 0, z: 0, hx: 2, hz: 0.3, height: 2, yaw: Math.PI / 4 };

  it('detects points inside a yawed wall', () => {
    // Local +x maps to world (0.707, -0.707) under rotateY(π/4).
    expect(pointInBlock(1.2, 1, -1.2, wall)).toBe(true);
    expect(pointInBlock(1.2, 1, 1.2, wall)).toBe(false);  // beside it
    expect(pointInBlock(1.2, 2.5, -1.2, wall)).toBe(false); // above it
  });

  it('pushes a body out of a yawed wall footprint', () => {
    const pos = new THREE.Vector3(1.1, 0, -1.3); // inside the footprint
    pushCircleOut(pos, 0.4, wall);
    expect(pointInBlock(pos.x, 1, pos.z, wall)).toBe(false);
  });
});

describe('solid bodies', () => {
  it('hero cannot ghost through a dummy', () => {
    const sim = new VerbSim({ dummies: [{ pos: [0, 4] }], heroPos: [0, 8] });
    sim.setCameraYaw(0); // forward = -z, straight at the dummy
    sim.setMove(0, 1);
    run(sim, 3.0); // way more than enough time to walk 4m

    const d = sim.getDummies()[0];
    const flatDist = Math.hypot(sim.heroPos.x - d.pos.x, sim.heroPos.z - d.pos.z);
    expect(flatDist).toBeGreaterThanOrEqual(0.84); // HERO_RADIUS + DUMMY_RADIUS − ε
  });
});

describe('enemy combat (slice 4)', () => {
  it('a rusher lands hits on a standing hero', () => {
    const sim = new VerbSim({ dummies: [{ pos: [0, 3], archetype: 'rusher' }], heroPos: [0, 8] });
    const events = collect(sim);
    run(sim, 6.0);
    expect(events.some((e) => e.type === 'enemyWindup')).toBe(true);
    expect(events.some((e) => e.type === 'heroHit')).toBe(true);
    expect(sim.heroHp).toBeLessThan(sim.heroMaxHp);
  });

  it('the aggression token director caps simultaneous attackers at 2', () => {
    const sim = new VerbSim({
      dummies: [
        { pos: [0, 4], archetype: 'rusher' },
        { pos: [3, 5], archetype: 'rusher' },
        { pos: [-3, 5], archetype: 'rusher' },
        { pos: [0, 12], archetype: 'rusher' },
      ],
      heroPos: [0, 8],
    });
    for (let i = 0; i < 600; i++) { // 10s, checked every step
      sim.step(DT);
      const attacking = sim.getDummies().filter(
        (d) => !d.dead && (d.ai === 'windup' || d.ai === 'strike')).length;
      expect(attacking).toBeLessThanOrEqual(2);
    }
  });

  it('dashing through the strike moment dodges it (i-frames + displacement)', () => {
    const sim = new VerbSim({ dummies: [{ pos: [0, 6.5], archetype: 'rusher' }], heroPos: [0, 8] });
    let windupAt = -1;
    sim.onEvent((e) => { if (e.type === 'enemyWindup' && windupAt < 0) windupAt = 1; });

    // Step until the windup starts…
    for (let i = 0; i < 600 && windupAt < 0; i++) sim.step(DT);
    expect(windupAt).toBe(1);
    // …ride out most of it, then dash through the strike.
    run(sim, ARCHETYPES.rusher.windup - 0.15);
    sim.setCameraYaw(0);
    sim.setMove(0, 1);
    sim.pressDash();
    run(sim, 0.4);
    expect(sim.heroHp).toBe(sim.heroMaxHp);
  });

  it('gunner shots are eaten by cover; without cover they land', () => {
    // Wide enough that the gunner can't strafe out a firing lane in 8s (it
    // legitimately hunts for one — a narrow wall gets flanked).
    const wall = { x: 0, z: 2, hx: 20, hz: 0.3, height: 2.2 };

    const covered = new VerbSim({
      dummies: [{ pos: [0, -4], archetype: 'gunner' }],
      heroPos: [0, 8],
      blocks: [wall],
    });
    run(covered, 8.0);
    expect(covered.heroHp).toBe(covered.heroMaxHp);

    const open = new VerbSim({
      dummies: [{ pos: [0, -4], archetype: 'gunner' }],
      heroPos: [0, 8],
    });
    const events = collect(open);
    run(open, 8.0);
    expect(events.some((e) => e.type === 'enemyShot')).toBe(true);
    expect(open.heroHp).toBeLessThan(open.heroMaxHp);
  });

  it('bulwark guards frontal hits into posture, breaks, then takes full damage', () => {
    // In FRONT of the hero's initial facing (+z) so the opener connects;
    // the bulwark faces the hero, so the strike travels into its guard.
    const sim = new VerbSim({ dummies: [{ pos: [0, 9.7], archetype: 'bulwark' }], heroPos: [0, 8] });
    const events = collect(sim);
    const bulwark = () => sim.getDummies()[0];

    // Frontal strike: chip damage + posture, and the clank event.
    sim.pressAttack();
    run(sim, 0.6);
    expect(events.some((e) => e.type === 'guardBlock')).toBe(true);
    expect(bulwark().hp).toBeGreaterThan(ARCHETYPES.bulwark.hp - 4); // chipped, not hurt

    // Keep swinging until the posture break (30 absorbed).
    for (let i = 0; i < 12 && !events.some((e) => e.type === 'postureBreak'); i++) {
      sim.pressAttack();
      run(sim, 0.6);
    }
    expect(events.some((e) => e.type === 'postureBreak')).toBe(true);
    expect(bulwark().ai).toBe('broken');

    // Broken: the same strike now lands whole.
    const before = bulwark().hp;
    sim.pressAttack();
    run(sim, 0.6);
    expect(before - bulwark().hp).toBeGreaterThanOrEqual(8);
  });

  it('the hero can go down, and resetRound stands them back up', () => {
    const sim = new VerbSim({
      dummies: [{ pos: [0, 6], archetype: 'rusher' }, { pos: [2, 6], archetype: 'rusher' }],
      heroPos: [0, 8],
    });
    const events = collect(sim);
    for (let i = 0; i < 60 * 60 && !sim.heroIsDown; i++) sim.step(DT);
    expect(sim.heroIsDown).toBe(true);
    expect(events.some((e) => e.type === 'heroDown')).toBe(true);

    sim.resetRound();
    expect(sim.heroIsDown).toBe(false);
    expect(sim.heroHp).toBe(sim.heroMaxHp);
  });
});

describe('off-screen threat arrows (GoW readability rule)', () => {
  it('shows no arrow for an attacker the player can see', () => {
    expect(computeEdgeArrow({ x: 0.5, y: 0, z: -5 }, { x: 0.2, y: 0 })).toBeNull();
  });

  it('an attacker off the right edge gets a right-edge arrow pointing right', () => {
    const a = computeEdgeArrow({ x: 4, y: 0, z: -3 }, { x: 1.6, y: 0 })!;
    expect(a).not.toBeNull();
    expect(a.leftPct).toBeGreaterThan(85);
    expect(Math.abs(a.topPct - 50)).toBeLessThan(1);
    expect(Math.abs(a.deg - 90)).toBeLessThan(1); // ▲ rotated 90° points right
  });

  it('an attacker dead behind gets a bottom arrow pointing down', () => {
    const a = computeEdgeArrow({ x: 0, y: 0, z: 5 }, null)!;
    expect(a).not.toBeNull();
    expect(a.topPct).toBeGreaterThan(80);
    expect(Math.abs(a.deg - 180)).toBeLessThan(1); // pointing down/back
  });

  it('an attacker behind-left maps to the lower-left edge', () => {
    const a = computeEdgeArrow({ x: -3, y: 0, z: 4 }, null)!;
    expect(a).not.toBeNull();
    expect(a.leftPct).toBeLessThan(40);  // their side (left)…
    expect(a.topPct).toBeGreaterThan(70); // …pulled low because they're behind
  });
});

describe('round structure', () => {
  it('dead dummies stay down when respawn is off; resetRound revives them', () => {
    const sim = new VerbSim({ dummies: [{ pos: [0, 4] }, { pos: [2, 4] }], heroPos: [0, 8] });
    sim.respawnEnabled = false;

    sim.debugKillAll();
    expect(sim.allDown).toBe(true);
    run(sim, 5.0); // way past the respawn timer
    expect(sim.allDown).toBe(true);

    sim.resetRound();
    expect(sim.allDown).toBe(false);
    expect(sim.getDummies().every((d) => d.hp === d.maxHp)).toBe(true);
  });

  it('resetRound returns a loose edge to the hand', () => {
    const sim = new VerbSim({ dummies: [], heroPos: [0, 8] });
    sim.setCameraYaw(0);
    sim.pressThrow();
    run(sim, 2.0);
    expect(sim.edgeState).toBe('embedded');

    sim.resetRound();
    expect(sim.edgeState).toBe('held');
    expect(sim.edge.pos.distanceTo(sim.handPos())).toBeLessThan(0.01);
  });
});

describe('dummies', () => {
  it('die, fall, and respawn', () => {
    const sim = new VerbSim({ dummies: [{ pos: [0, 9.5] }], heroPos: [0, 8] });
    const events = collect(sim);

    // 60 HP: keep swinging until the death event.
    for (let i = 0; i < 30 && !events.some((e) => e.type === 'dummyDeath'); i++) {
      sim.pressAttack();
      run(sim, 0.3);
    }
    expect(events.some((e) => e.type === 'dummyDeath')).toBe(true);
    expect(sim.getDummies()[0].dead).toBe(true);

    run(sim, 3.0);
    expect(sim.getDummies()[0].dead).toBe(false);
    expect(sim.getDummies()[0].hp).toBe(60);
  });
});
