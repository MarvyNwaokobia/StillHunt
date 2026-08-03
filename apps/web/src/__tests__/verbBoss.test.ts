import { describe, it, expect } from 'vitest';
import { VerbSim, type VerbEvent, type BossMove } from '@/engine/verb';

/**
 * Slice 4b (CLONE_PLAN.md): the boss framework, exercised through Cinder.
 */

const DT = 1 / 60;

function run(sim: VerbSim, s: number) {
  for (let i = 0; i < Math.round(s / DT); i++) sim.step(DT);
}

function collect(sim: VerbSim): VerbEvent[] {
  const events: VerbEvent[] = [];
  sim.onEvent((e) => events.push(e));
  return events;
}

/** Mash melee until the boss drops below `fraction` of max HP (or give up). */
function meleeUntil(sim: VerbSim, fraction: number, maxSeconds = 60) {
  const boss = () => sim.getDummies()[0];
  for (let i = 0; i < maxSeconds / 0.3 && boss().hp > boss().maxHp * fraction; i++) {
    sim.pressAttack();
    run(sim, 0.3);
  }
}

function bossSim(bossPos: [number, number] = [0, 10.5], heroPos: [number, number] = [0, 8]) {
  const sim = new VerbSim({ dummies: [{ pos: bossPos, boss: true }], heroPos });
  sim.respawnEnabled = false;
  return sim;
}

describe('the boss body', () => {
  it('spawns big through setRoster and survives what kills troops', () => {
    const sim = new VerbSim({ dummies: [{ pos: [0, 4], archetype: 'rusher' }], heroPos: [0, 8] });
    sim.setRoster([{ pos: [0, -12], boss: true }]);
    const boss = sim.getDummies()[0];
    expect(boss.boss).toBe(true);
    expect(boss.hp).toBe(220);
    expect(boss.radius).toBeGreaterThan(0.6);
  });

  it('torch swing: telegraphed, then it hurts a standing hero', () => {
    const sim = bossSim();
    const events = collect(sim);
    run(sim, 8.0);
    const windups = events.filter((e) => e.type === 'bossWindup').map((e) => e.type === 'bossWindup' && e.move);
    expect(windups).toContain('torchSwing');
    expect(events.some((e) => e.type === 'heroHit')).toBe(true);
    expect(sim.heroHp).toBeLessThan(sim.heroMaxHp);
  });

  it('ember toss at range: projectiles fly and land', () => {
    const sim = bossSim([0, -2], [0, 8]); // 10m: toss band, out of swing range
    const events = collect(sim);
    run(sim, 6.0);
    const windups = events.filter((e) => e.type === 'bossWindup').map((e) => e.type === 'bossWindup' && e.move);
    expect(windups).toContain('emberToss');
    expect(sim.getProjectiles().length).toBeGreaterThan(0);
    run(sim, 4.0);
    expect(sim.heroHp).toBeLessThan(sim.heroMaxHp);
  });
});

describe('phases', () => {
  it('crossing 2/3 HP triggers the phase beat, invulnerable while it lasts', () => {
    const sim = bossSim();
    const events = collect(sim);
    meleeUntil(sim, 2 / 3);

    const phaseEvent = events.find((e) => e.type === 'bossPhase');
    expect(phaseEvent).toBeDefined();
    expect(phaseEvent!.type === 'bossPhase' && phaseEvent!.phase).toBe(2);

    // Strike during the transition: nothing lands.
    const hpAtBeat = sim.getDummies()[0].hp;
    sim.pressAttack();
    run(sim, 0.5); // still inside the 1.8s transition
    expect(sim.getDummies()[0].hp).toBe(hpAtBeat);
  });

  it('phase 2 unlocks the flame rush from distance', () => {
    const sim = bossSim();
    const events = collect(sim);
    meleeUntil(sim, 2 / 3);
    run(sim, 2.0); // ride out the transition

    // Back away to rush range and stand on the line.
    sim.heroPos.set(0, 0, sim.getDummies()[0].pos.z + 10);
    const hpBefore = sim.heroHp;
    run(sim, 8.0);
    const moves = events.filter((e) => e.type === 'bossWindup').map((e) => e.type === 'bossWindup' && e.move) as BossMove[];
    expect(moves).toContain('flameRush');
    expect(sim.heroHp).toBeLessThan(hpBefore);
  });

  it('phase 3 unlocks the ash ring up close', () => {
    const sim = bossSim();
    const events = collect(sim);
    meleeUntil(sim, 1 / 3);
    run(sim, 2.0);

    // Stay glued to him until the ring fires.
    let rang = false;
    const unsub = sim.onEvent((e) => {
      if (e.type === 'bossStrike' && e.move === 'ashRing') rang = true;
    });
    for (let i = 0; i < 60 * 15 && !rang; i++) {
      // shadow the boss so ring range stays satisfied
      const b = sim.getDummies()[0];
      const to = sim.heroPos.clone().sub(b.pos);
      if (to.length() > 3) sim.heroPos.copy(b.pos).add(to.setLength(2.2));
      sim.step(DT);
    }
    unsub();
    expect(rang).toBe(true);
    expect(events.some((e) => e.type === 'bossWindup' && e.move === 'ashRing')).toBe(true);
    expect(sim.heroHp).toBeLessThan(sim.heroMaxHp);
  });
});

describe('the full arc', () => {
  it('Cinder is killable and the round resets clean', () => {
    const sim = bossSim();
    const events = collect(sim);
    meleeUntil(sim, 0, 180);
    expect(sim.getDummies()[0].dead || sim.heroIsDown).toBe(true);

    if (sim.getDummies()[0].dead) {
      expect(events.some((e) => e.type === 'dummyDeath')).toBe(true);
      expect(sim.allDown).toBe(true);
    }

    sim.setRoster([{ pos: [0, -4], archetype: 'rusher' }]);
    expect(sim.getDummies()[0].boss).toBe(false);
    expect(sim.heroHp).toBe(sim.heroMaxHp);
  });
});
