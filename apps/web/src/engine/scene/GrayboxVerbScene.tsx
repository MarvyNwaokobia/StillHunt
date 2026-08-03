'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { BattleCamera } from '../camera';
import {
  VerbSim, computeEdgeArrow, BOSS_RING_RADIUS,
  type VerbEvent, type Archetype, type DummySpec, type BossMove,
} from '../verb';
import { AudioDirector, combatIntensity } from '../audio';
import { linesFor, SPEAKER_META, type PresenceLine, type PresenceTrigger } from '../story/presence';
import { AshfallCinematic } from './arenas/AshfallCinematic';
import { VerbFighterModel } from './VerbFighterModel';
import { heroAnimations, enemyAnimations, bossAnimations } from '../animation';
import { AmbientVFX } from '../world/AmbientVFX';
import { villageColliders } from './arenas/ashfallLayout';
import { setStaticCover } from '../sim/Cover';
import { EffectComposer, Bloom, Vignette, Noise, ToneMapping } from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';

/**
 * The verb graybox — CLONE_PLAN.md slices 1 (verb), 3 (no-cut), 4 (combat + boss).
 *
 * One continuous camera across a TWO-ROUND session:
 *
 *   title → swoop to OTS → round 1: the four (rusher/gunner/bulwark/rusher)
 *   → CLEARED beat → the orbit slides onto CINDER as he takes the field
 *   (title card, roar) → swoop back to OTS → the boss fight, three phases
 *   → ZONE CLEAR · or DOWN anywhere → title. Zero cuts, ever.
 *
 * Cinder is the slice 4 showcase: every readability system (windup pulses,
 * spatial tells, threat arrows, token fairness) runs under a boss with
 * choreographed moves and invulnerable phase beats.
 */

type Phase = 'title' | 'combat' | 'cleared' | 'down' | 'bossIntro';

// The fight lives in ASHFALL now (slice 6a): the burned village from
// ashfallLayout, whose walls the sim, the edge, the projectiles, the camera
// spring arm and the renderer all read from the same data.
const VILLAGE_BLOCKS = villageColliders();

const ROUND_ONE: DummySpec[] = [
  { pos: [0, -4], archetype: 'rusher' },
  { pos: [-4, -7], archetype: 'gunner' },
  { pos: [4.5, -8], archetype: 'bulwark' },
  { pos: [1.5, -14], archetype: 'rusher' },
];
const ROUND_BOSS: DummySpec[] = [{ pos: [0, -12], boss: true }];
const MAX_SLOTS = 4;

// Real bodies (slice 6b): faction → rig. Tints multiply into the textures so
// the shared rigs read as different people in the dusk.
const BODY: Record<Archetype | 'boss' | 'hero', { path: string; tint?: string }> = {
  hero: { path: '/characters/glb/sentinel.glb' },
  rusher: { path: '/characters/glb/berserker.glb', tint: '#c9a58f' },
  gunner: { path: '/characters/glb/phantom.glb', tint: '#b9b9d4' },
  bulwark: { path: '/characters/glb/sentinel.glb', tint: '#8fa4b2' },
  boss: { path: '/characters/glb/berserker.glb', tint: '#ffb07a' },
};

// Animation maps are pure data — build once, share across bodies.
const HERO_ANIMS = heroAnimations();
const BOSS_ANIMS = bossAnimations();
const ENEMY_ANIMS: Record<Archetype, ReturnType<typeof enemyAnimations>> = {
  rusher: enemyAnimations('rusher'),
  gunner: enemyAnimations('gunner'),
  bulwark: enemyAnimations('bulwark'),
};

const FIXED_DT = 1 / 60;
const PAUSE = { melee: 0.06, meleeBig: 0.09, embedEnemy: 0.11, catch: 0.05, death: 0.08, hurt: 0.05, break: 0.1, roar: 0.12 };
const BEAT_SLOWMO_MS = 1400;
const BEAT_TOTAL_MS = 4200;
/** Round 1's clear beat is shorter — Cinder doesn't wait. */
const BEAT_TO_BOSS_MS = 2600;
const BOSS_INTRO_MS = 3200;
const MAX_ARROWS = 4;

interface HudRefs {
  hpFill: HTMLDivElement | null;
  vignette: HTMLDivElement | null;
  bossWrap: HTMLDivElement | null;
  bossFill: HTMLDivElement | null;
  subWrap: HTMLDivElement | null;
  subName: HTMLDivElement | null;
  subText: HTMLDivElement | null;
  arrows: Array<HTMLDivElement | null>;
}

const BOSS_PHASE_COLOR = ['#ff8a3c', '#ff8a3c', '#ff5f2a', '#ff3020'];

/** The Rift Edge: heavy short blade, teal edge-light so it tracks in flight. */
function EdgeMesh() {
  return (
    <>
      <mesh position={[0, 0, 0.45]} castShadow>
        <boxGeometry args={[0.09, 0.025, 0.9]} />
        <meshStandardMaterial color="#b9c2cc" metalness={0.8} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0, 0.44]}>
        <boxGeometry args={[0.02, 0.032, 0.86]} />
        <meshStandardMaterial color="#37e0d8" emissive="#37e0d8" emissiveIntensity={1.6} />
      </mesh>
      <mesh position={[0, 0, -0.06]}>
        <boxGeometry args={[0.26, 0.05, 0.07]} />
        <meshStandardMaterial color="#4a4d55" />
      </mesh>
      <mesh position={[0, 0, -0.18]}>
        <cylinderGeometry args={[0.035, 0.035, 0.22]} />
        <meshStandardMaterial color="#2e3037" />
      </mesh>
    </>
  );
}

function VerbWorld({ onPhase, hud }: {
  onPhase: (phase: Phase, beatSecs?: number) => void;
  hud: HudRefs;
}) {
  const { camera } = useThree();
  const sim = useMemo(() => {
    const s = new VerbSim({ dummies: ROUND_ONE, blocks: VILLAGE_BLOCKS, heroPos: [0, 8] });
    s.respawnEnabled = false;
    return s;
  }, []);

  // The OTS camera's spring arm reads the same walls (losHit → pull in).
  useEffect(() => {
    setStaticCover(villageColliders());
    return () => setStaticCover([]);
  }, []);
  const audio = useMemo(() => new AudioDirector(), []);
  const battleCam = useMemo(
    () => new BattleCamera(camera as THREE.PerspectiveCamera),
    [camera],
  );

  const heroRef = useRef<THREE.Group>(null);
  const edgeLooseRef = useRef<THREE.Group>(null);
  const slotRefs = useRef<Array<THREE.Group | null>>([]);
  const hpRefs = useRef<Array<THREE.Mesh | null>>([]);
  const shieldRefs = useRef<Array<THREE.Mesh | null>>([]);
  const projRefs = useRef<Array<THREE.Mesh | null>>([]);
  const ringRef = useRef<THREE.Mesh>(null);

  const pauseRef = useRef(0);
  const accRef = useRef(0);
  const keys = useRef(new Set<string>());
  const lastHitRef = useRef(-100);
  const vignetteRef = useRef(0);

  const phaseRef = useRef<Phase>('title');
  const roundRef = useRef<1 | 2>(1);
  const roundStartRef = useRef(0);
  const beatAtRef = useRef(0);
  const bossMoveRef = useRef<BossMove | null>(null);
  const ringBurstRef = useRef(0);

  // The voices: a queue of presence lines, each trigger fires once per run.
  const voQueueRef = useRef<PresenceLine[]>([]);
  const voUntilRef = useRef(0);
  const voFiredRef = useRef(new Set<PresenceTrigger>());

  const say = useCallback((trigger: PresenceTrigger) => {
    if (voFiredRef.current.has(trigger)) return;
    voFiredRef.current.add(trigger);
    voQueueRef.current.push(...linesFor(trigger));
  }, []);

  const setPhase = useCallback((p: Phase, beatSecs?: number) => {
    phaseRef.current = p;
    onPhase(p, beatSecs);
  }, [onPhase]);

  const startCombat = useCallback(() => {
    roundStartRef.current = performance.now();
    setPhase('combat');
    if (roundRef.current === 1) say('combatStart');
  }, [setPhase, say]);

  const enterBeat = useCallback((kind: 'cleared' | 'down') => {
    const secs = (performance.now() - roundStartRef.current) / 1000;
    beatAtRef.current = performance.now();
    setPhase(kind, secs);
    battleCam.startKillcam('player');
    battleCam.setSlowMoFov(-8);
    audio.setIntensity(0);
    audio.setHeartbeat(false);
    if (kind === 'cleared') {
      audio.roundClear();
      if (roundRef.current === 1) {
        say('troopsCleared');
      } else {
        say('zoneClear');
        say('zoneClearTag');
      }
    } else {
      audio.heroDown();
      say('heroDown');
    }
  }, [setPhase, battleCam, audio, say]);

  const [rosterSpecs, setRosterSpecs] = useState<DummySpec[]>(ROUND_ONE);

  const startBossIntro = useCallback(() => {
    roundRef.current = 2;
    sim.setRoster(ROUND_BOSS);
    setRosterSpecs(ROUND_BOSS);
    bossMoveRef.current = null;
    setPhase('bossIntro');
    beatAtRef.current = performance.now();
    battleCam.setSlowMoFov(0);
    // The orbit slides off the hero and onto Cinder — same camera, no cut.
    battleCam.startKillcam('target');
    const boss = sim.getDummies()[0];
    if (boss) audio.bossRoar({ x: boss.pos.x, z: boss.pos.z });
    say('bossIntro');
  }, [sim, battleCam, audio, setPhase, say]);

  const returnToTitle = useCallback(() => {
    roundRef.current = 1;
    sim.setRoster(ROUND_ONE);
    setRosterSpecs(ROUND_ONE);
    bossMoveRef.current = null;
    audio.stopWhistle();
    battleCam.setSlowMoFov(0);
    battleCam.setMode('follow');
    voFiredRef.current.clear();
    voQueueRef.current.length = 0;
    voUntilRef.current = 0;
    setPhase('title');
  }, [sim, audio, battleCam, setPhase]);

  // Probe hook for headless verification.
  useEffect(() => {
    (window as unknown as { __verbKill?: () => void }).__verbKill = () => sim.debugKillAll();
    return () => { delete (window as unknown as { __verbKill?: () => void }).__verbKill; };
  }, [sim]);

  // ── Input ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const anyInput = (): boolean => {
      audio.unlock();
      if (phaseRef.current === 'title') { startCombat(); return true; }
      return phaseRef.current !== 'combat';
    };
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Space') e.preventDefault();
      if (anyInput()) return;
      keys.current.add(e.code);
      if (e.code === 'KeyJ') sim.pressAttack();
      if (e.code === 'KeyF') sim.pressThrow();
      if (e.code === 'KeyE') sim.pressRecall();
      if (e.code === 'Space') sim.pressDash();
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const mouseDown = (e: MouseEvent) => {
      if (anyInput()) return;
      if (e.button === 0) sim.pressAttack();
      if (e.button === 2) sim.setAiming(true);
    };
    const mouseUp = (e: MouseEvent) => {
      if (e.button === 2) sim.setAiming(false);
    };
    const noMenu = (e: Event) => e.preventDefault();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('mousedown', mouseDown);
    window.addEventListener('mouseup', mouseUp);
    window.addEventListener('contextmenu', noMenu);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('mousedown', mouseDown);
      window.removeEventListener('mouseup', mouseUp);
      window.removeEventListener('contextmenu', noMenu);
      audio.dispose();
    };
  }, [sim, audio, startCombat]);

  // ── Sim events → juice ─────────────────────────────────────────────────────
  useEffect(() => {
    return sim.onEvent((e: VerbEvent) => {
      switch (e.type) {
        case 'meleeSwing':
          break;
        case 'meleeHit': {
          const big = e.stage === 3 || e.buffed;
          audio.meleeHit(e.stage, e.buffed, e.pos);
          lastHitRef.current = performance.now() / 1000;
          pauseRef.current = Math.max(pauseRef.current, big ? PAUSE.meleeBig : PAUSE.melee);
          battleCam.shake(big ? 0.05 : 0.02, 40);
          break;
        }
        case 'meleeWhiff':
          audio.meleeWhiff(e.stage);
          break;
        case 'throw':
          audio.throw_();
          battleCam.punch(0.03);
          break;
        case 'embed':
          if (e.target.kind === 'enemy') {
            audio.embed('flesh', e.pos);
            lastHitRef.current = performance.now() / 1000;
            pauseRef.current = Math.max(pauseRef.current, PAUSE.embedEnemy);
            battleCam.shake(0.06, 35);
          } else {
            audio.embed(e.target.kind === 'ground' ? 'ground' : 'stone', e.pos);
            battleCam.shake(0.03, 30);
          }
          break;
        case 'recallStart':
          audio.rip(sim.edge.pos);
          audio.startWhistle();
          break;
        case 'recallHit':
          audio.recallHit(e.pos);
          lastHitRef.current = performance.now() / 1000;
          battleCam.shake(0.03, 40);
          break;
        case 'catch':
          audio.stopWhistle();
          audio.catch_();
          pauseRef.current = Math.max(pauseRef.current, PAUSE.catch);
          battleCam.punch(0.06);
          battleCam.shake(0.04, 45);
          say('firstCatch');
          break;
        case 'dummyDeath':
          audio.death(e.pos);
          lastHitRef.current = performance.now() / 1000;
          pauseRef.current = Math.max(pauseRef.current, PAUSE.death);
          if (phaseRef.current === 'combat' && sim.allDown) enterBeat('cleared');
          break;
        case 'dash':
          audio.dash();
          break;
        case 'enemyWindup':
          audio.tell(e.archetype, e.pos);
          break;
        case 'enemyStrike':
          break;
        case 'enemyShot':
          audio.enemyShot(e.pos);
          break;
        case 'guardBlock':
          audio.embed('metal', e.pos);
          break;
        case 'postureBreak':
          audio.embed('metal', e.pos);
          pauseRef.current = Math.max(pauseRef.current, PAUSE.break);
          battleCam.shake(0.06, 30);
          break;
        case 'heroHit':
          audio.heroHit();
          vignetteRef.current = 0.8;
          pauseRef.current = Math.max(pauseRef.current, PAUSE.hurt);
          battleCam.shake(0.07, 28);
          if (sim.heroHp > 0 && sim.heroHp <= 30) say('lowHp');
          break;
        case 'heroDown':
          if (phaseRef.current === 'combat') enterBeat('down');
          break;
        // ── Boss ──
        case 'bossWindup':
          bossMoveRef.current = e.move;
          audio.bossTell(e.move, e.pos);
          break;
        case 'bossStrike':
          if (e.move === 'ashRing') {
            ringBurstRef.current = 0.45;
            battleCam.shake(0.09, 26);
            pauseRef.current = Math.max(pauseRef.current, PAUSE.break);
          }
          if (e.move === 'flameRush' && e.hit) battleCam.shake(0.08, 30);
          bossMoveRef.current = null;
          break;
        case 'bossPhase':
          audio.bossRoar(e.pos);
          pauseRef.current = Math.max(pauseRef.current, PAUSE.roar);
          battleCam.shake(0.08, 24);
          say(e.phase === 2 ? 'bossPhase2' : 'bossPhase3');
          break;
      }
    });
  }, [sim, audio, battleCam, enterBeat]);

  // ── Frame ──────────────────────────────────────────────────────────────────
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const phase = phaseRef.current;
    const now = performance.now();

    let simScale = 1;
    if (phase === 'cleared' || phase === 'down') {
      simScale = now - beatAtRef.current < BEAT_SLOWMO_MS ? 0.35 : 1;
      if (now - beatAtRef.current >= BEAT_SLOWMO_MS) battleCam.setSlowMoFov(0);
      const total = phase === 'cleared' && roundRef.current === 1 ? BEAT_TO_BOSS_MS : BEAT_TOTAL_MS;
      if (now - beatAtRef.current >= total) {
        if (phase === 'cleared' && roundRef.current === 1) startBossIntro();
        else returnToTitle();
      }
    } else if (phase === 'bossIntro') {
      if (now - beatAtRef.current >= BOSS_INTRO_MS) startCombat();
    }

    if (pauseRef.current > 0) {
      pauseRef.current -= dt;
    } else {
      const k = keys.current;
      if (phase === 'combat') {
        sim.setMove(
          (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0),
          (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0),
        );
      } else {
        sim.setMove(0, 0);
      }
      sim.setCameraYaw(battleCam.cameraYaw);
      sim.combatEnabled = phase === 'combat';
      accRef.current += dt * simScale;
      while (accRef.current >= FIXED_DT) {
        sim.step(FIXED_DT);
        accRef.current -= FIXED_DT;
      }
    }

    if (sim.edgeState === 'recalling') {
      audio.setWhistle(sim.edge.pos, sim.edge.recallProgress);
    }

    // Camera: one shot across every phase and both rounds.
    const target = sim.softLockTarget();
    if (phase === 'title') {
      battleCam.rotateMouse(-38 * dt, 0);
      battleCam.update(dt, sim.heroPos);
    } else if (phase === 'combat') {
      const wantMode = target ? 'ots' : 'follow';
      if (battleCam.currentMode !== wantMode) battleCam.setMode(wantMode);
      battleCam.update(dt, sim.heroPos, target ?? undefined);
    } else if (phase === 'bossIntro') {
      const boss = sim.getDummies()[0];
      battleCam.update(dt, sim.heroPos, boss ? boss.pos : sim.heroPos);
    } else if (phase === 'down') {
      const body = sim.heroPos.clone().setY(-0.55);
      battleCam.update(dt, body, body);
    } else {
      battleCam.update(dt, sim.heroPos, sim.heroPos);
    }

    audio.setListener(camera.position.x, camera.position.z, battleCam.cameraYaw);
    if (phase === 'combat') {
      if (roundRef.current === 2) {
        audio.setIntensity(3); // the boss layer stays hot for the whole fight
      } else {
        const nearest = target ? target.distanceTo(sim.heroPos) : null;
        audio.setIntensity(
          combatIntensity(nearest, performance.now() / 1000 - lastHitRef.current),
        );
      }
      audio.setHeartbeat(sim.heroHp > 0 && sim.heroHp <= 30);
    }

    // Hero: the rig (VerbFighterModel) owns the skeleton; this owns placement.
    // Death is a real animation now, so no capsule fall-over rotation.
    if (heroRef.current) {
      heroRef.current.position.copy(sim.heroPos);
      heroRef.current.rotation.y = sim.heroYaw;
    }

    // The Edge, loose in the world (the held blade rides the hero's hand bone).
    const held = sim.edgeState === 'held';
    if (edgeLooseRef.current) {
      edgeLooseRef.current.visible = !held;
      if (!held) {
        edgeLooseRef.current.position.copy(sim.edge.pos);
        edgeLooseRef.current.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 0, 1), sim.edge.dir,
        );
        edgeLooseRef.current.rotateX(sim.edge.spin);
      }
    }

    // Enemy slots: placement/scale/HUD only — the rigs animate themselves
    // (telegraph emissive included) inside VerbFighterModel.
    const dummies = sim.getDummies();
    for (let i = 0; i < MAX_SLOTS; i++) {
      const g = slotRefs.current[i];
      if (!g) continue;
      const d = dummies[i];
      g.visible = !!d;
      if (!d) continue;
      g.position.copy(d.pos);
      g.rotation.y = d.yaw;
      g.scale.setScalar(d.radius / 0.45);
      const hp = hpRefs.current[i];
      if (hp) {
        hp.visible = !d.dead && !d.boss; // the boss uses the big top bar
        hp.scale.x = Math.max(0.02, d.hp / d.maxHp);
      }
      const shield = shieldRefs.current[i];
      if (shield) shield.visible = !d.dead && d.guardUp;
    }

    // Ash ring: telegraph grows with the windup, bursts on the strike.
    if (ringRef.current) {
      const boss = dummies.find((d) => d.boss && !d.dead);
      const winding = boss && bossMoveRef.current === 'ashRing' && boss.ai === 'windup';
      ringBurstRef.current = Math.max(0, ringBurstRef.current - dt);
      const bursting = ringBurstRef.current > 0;
      ringRef.current.visible = !!winding || bursting;
      if (boss && (winding || bursting)) {
        ringRef.current.position.set(boss.pos.x, 0.05, boss.pos.z);
        const mat = ringRef.current.material as THREE.MeshBasicMaterial;
        if (winding) {
          const p = 1 - boss.aiT / boss.windupTotal;
          ringRef.current.scale.setScalar(0.25 + 0.75 * p);
          mat.opacity = 0.35 + p * 0.4;
        } else {
          ringRef.current.scale.setScalar(1 + (0.45 - ringBurstRef.current) * 0.8);
          mat.opacity = ringBurstRef.current * 1.6;
        }
      }
    }

    // Enemy projectiles.
    {
      const alive = sim.getProjectiles().filter((p) => p.alive);
      projRefs.current.forEach((m, i) => {
        if (!m) return;
        const p = alive[i];
        m.visible = !!p;
        if (p) {
          m.position.copy(p.pos);
          m.scale.setScalar(p.damage > 10 ? 1.7 : 1); // embers read bigger
        }
      });
    }

    // ── HUD ──────────────────────────────────────────────────────────────────
    if (hud.hpFill) {
      const f = sim.heroHp / sim.heroMaxHp;
      hud.hpFill.style.transform = `scaleX(${Math.max(0, f)})`;
      hud.hpFill.style.background = f > 0.5 ? '#43d17c' : f > 0.3 ? '#ffb347' : '#ff5544';
    }
    if (hud.bossWrap && hud.bossFill) {
      const boss = dummies.find((d) => d.boss);
      const showBar = !!boss && !boss.dead && phase === 'combat';
      hud.bossWrap.style.display = showBar ? 'block' : 'none';
      if (boss && showBar) {
        hud.bossFill.style.transform = `scaleX(${Math.max(0, boss.hp / boss.maxHp)})`;
        hud.bossFill.style.background = BOSS_PHASE_COLOR[boss.bossPhase ?? 1];
      }
    }
    if (hud.vignette) {
      vignetteRef.current = Math.max(0, vignetteRef.current - dt * 1.6);
      const lowHp = phase === 'combat' && sim.heroHp <= 30 && !sim.heroIsDown ? 0.28 : 0;
      hud.vignette.style.opacity = String(Math.max(vignetteRef.current, lowHp));
    }

    // The voices: one line at a time, reading pace scaled to its length.
    if (hud.subWrap && hud.subName && hud.subText) {
      // Backlog rule: if more lines are waiting, the current one wraps up
      // fast — StillHunt's entrance must never queue behind small talk.
      if (voQueueRef.current.length > 0 && voUntilRef.current - now > 1400) {
        voUntilRef.current = now + 900;
      }
      if (now >= voUntilRef.current) {
        const line = voQueueRef.current.shift();
        if (line) {
          const meta = SPEAKER_META[line.speaker];
          hud.subName.textContent = meta.name;
          hud.subName.style.color = meta.color;
          hud.subText.textContent = line.text;
          hud.subWrap.style.display = 'block';
          voUntilRef.current = now + 2400 + line.text.length * 34;
          audio.playVo(line.id, line.speaker);
        } else {
          hud.subWrap.style.display = 'none';
        }
      }
    }

    // Off-screen threat arrows.
    {
      const cam = camera as THREE.PerspectiveCamera;
      const threats = dummies.filter(
        (d) => !d.dead && (d.ai === 'windup' || d.ai === 'strike'));
      let slot = 0;
      const v = new THREE.Vector3();
      const n = new THREE.Vector3();
      for (const d of threats) {
        if (slot >= MAX_ARROWS) break;
        v.set(d.pos.x, 1.1, d.pos.z).applyMatrix4(cam.matrixWorldInverse);
        const ndc = v.z <= 0 ? n.set(d.pos.x, 1.1, d.pos.z).project(cam) : null;
        const arrow = computeEdgeArrow(v, ndc);
        if (!arrow) continue;
        const el = hud.arrows[slot];
        if (el) {
          const p = d.ai === 'strike' ? 1 : 1 - d.aiT / d.windupTotal;
          el.style.display = 'block';
          el.style.left = `${arrow.leftPct}%`;
          el.style.top = `${arrow.topPct}%`;
          el.style.opacity = String(0.4 + 0.6 * p);
          el.style.transform = `translate(-50%, -50%) rotate(${arrow.deg}deg) scale(${1 + p * 0.4})`;
        }
        slot++;
      }
      for (; slot < MAX_ARROWS; slot++) {
        const el = hud.arrows[slot];
        if (el) el.style.display = 'none';
      }
    }

    // Probe/debug readout.
    (window as unknown as { __verbState?: object }).__verbState = {
      phase: phaseRef.current,
      round: roundRef.current,
      edge: sim.edgeState,
      heroHp: sim.heroHp,
      hero: [sim.heroPos.x, sim.heroPos.z],
      cam: [camera.position.x, camera.position.y, camera.position.z],
      dummies: dummies.map((d) => ({ hp: d.hp, dead: d.dead, ai: d.ai, boss: d.boss, phase: d.bossPhase })),
    };
  });

  return (
    <>
      {/* Smoke-dusk air: bg matches fog so distance dissolves into layered
          silhouettes (the StillHunt/GoW atmosphere rule). Filmic post on top. */}
      <color attach="background" args={['#54443a']} />
      <fog attach="fog" args={['#54443a', 16, 98]} />
      <Suspense fallback={null}>
        <AshfallCinematic />
      </Suspense>
      <AmbientVFX stageId="lava_arena" />
      <EffectComposer multisampling={0}>
        <Bloom intensity={0.45} luminanceThreshold={0.72} luminanceSmoothing={0.25} mipmapBlur />
        <Noise premultiply blendFunction={BlendFunction.SCREEN} opacity={0.42} />
        <Vignette darkness={0.3} offset={0.3} blendFunction={BlendFunction.NORMAL} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>

      {/* ASH — a real body; the blade rides the right-hand bone inside */}
      <group ref={heroRef}>
        <Suspense fallback={null}>
          <VerbFighterModel
            modelPath={BODY.hero.path}
            animMap={HERO_ANIMS}
            sim={sim}
            body="hero"
            tint={BODY.hero.tint}
            withEdge
          />
        </Suspense>
      </group>

      <group ref={edgeLooseRef} visible={false}>
        <EdgeMesh />
      </group>

      {/* Enemy slots — real rigs per roster; remounted when the cast changes */}
      {rosterSpecs.map((spec, i) => {
        const role = spec.boss ? 'boss' : (spec.archetype ?? 'rusher');
        return (
          <group
            key={`${role}-${i}`}
            ref={(el) => { slotRefs.current[i] = el; }}
            visible={false}
          >
            <Suspense fallback={null}>
              <VerbFighterModel
                modelPath={BODY[role].path}
                animMap={spec.boss ? BOSS_ANIMS : ENEMY_ANIMS[spec.archetype ?? 'rusher']}
                sim={sim}
                body={i}
                tint={BODY[role].tint}
                getBossMove={spec.boss ? () => bossMoveRef.current : undefined}
              />
            </Suspense>
            <mesh
              ref={(el) => { shieldRefs.current[i] = el; }}
              position={[0, 1.0, 0.62]}
              visible={false}
            >
              <boxGeometry args={[0.95, 1.25, 0.08]} />
              <meshStandardMaterial color="#5d6f7d" metalness={0.55} roughness={0.35} />
            </mesh>
            <mesh ref={(el) => { hpRefs.current[i] = el; }} position={[0, 2.2, 0]}>
              <boxGeometry args={[0.8, 0.07, 0.02]} />
              <meshStandardMaterial color="#43d17c" />
            </mesh>
          </group>
        );
      })}

      {/* Ash ring telegraph/burst */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[BOSS_RING_RADIUS - 0.25, BOSS_RING_RADIUS, 48]} />
        <meshBasicMaterial color="#ff5f2a" transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>

      {/* Projectile pool (gunner rounds + Cinder's embers) */}
      {Array.from({ length: 10 }).map((_, i) => (
        <mesh key={i} ref={(el) => { projRefs.current[i] = el; }} visible={false}>
          <sphereGeometry args={[0.09, 8, 8]} />
          <meshStandardMaterial color="#ffd28a" emissive="#ff9a3c" emissiveIntensity={2.2} />
        </mesh>
      ))}
    </>
  );
}

const overlayFont: React.CSSProperties = {
  fontFamily: 'ui-monospace, monospace',
  color: '#d6dae2',
  userSelect: 'none',
  pointerEvents: 'none',
};

export function GrayboxVerbScene() {
  const [phase, setPhase] = useState<Phase>('title');
  const [beatSecs, setBeatSecs] = useState<number | null>(null);
  const [bossRound, setBossRound] = useState(false);
  const hud = useRef<HudRefs>({
    hpFill: null, vignette: null, bossWrap: null, bossFill: null,
    subWrap: null, subName: null, subText: null, arrows: [],
  }).current;

  const onPhase = useCallback((p: Phase, secs?: number) => {
    setPhase(p);
    if (secs !== undefined) setBeatSecs(secs);
    if (p === 'bossIntro') setBossRound(true);
    if (p === 'title') setBossRound(false);
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#404248' }}>
      <style>{`@keyframes verbPulse { 0%,100% { opacity: 0.9 } 50% { opacity: 0.35 } }`}</style>
      <Canvas shadows camera={{ position: [0, 4, 16], fov: 55 }}>
        <VerbWorld onPhase={onPhase} hud={hud} />
      </Canvas>

      <div
        ref={(el) => { hud.vignette = el; }}
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0,
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(255,40,30,0.55) 100%)',
        }}
      />

      {Array.from({ length: MAX_ARROWS }).map((_, i) => (
        <div
          key={i}
          ref={(el) => { hud.arrows[i] = el; }}
          style={{
            ...overlayFont, position: 'absolute', display: 'none',
            color: '#ffa028', fontSize: 26, fontWeight: 800, textShadow: '0 0 8px rgba(255,160,40,0.7)',
          }}
        >
          ▲
        </div>
      ))}

      {/* The voices: radio subtitles (VO rides on top when generated) */}
      <div
        ref={(el) => { hud.subWrap = el; }}
        style={{
          ...overlayFont, position: 'absolute', bottom: 96, left: '50%',
          transform: 'translateX(-50%)', width: 'min(620px, 86vw)',
          textAlign: 'center', display: 'none',
          background: 'rgba(8,10,14,0.62)', borderRadius: 8, padding: '10px 16px',
        }}
      >
        <div ref={(el) => { hud.subName = el; }} style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.3em', marginBottom: 4 }} />
        <div ref={(el) => { hud.subText = el; }} style={{ fontSize: 14, lineHeight: 1.5 }} />
      </div>

      {/* Boss bar (shown during the Cinder fight) */}
      <div
        ref={(el) => { hud.bossWrap = el; }}
        style={{ position: 'absolute', top: 40, left: '50%', transform: 'translateX(-50%)', width: 420, display: 'none', pointerEvents: 'none' }}
      >
        <div style={{ ...overlayFont, textAlign: 'center', fontSize: 13, letterSpacing: '0.35em', color: '#ff8a5c', marginBottom: 5 }}>
          CINDER
        </div>
        <div style={{ height: 9, background: 'rgba(10,12,16,0.65)', borderRadius: 5, overflow: 'hidden' }}>
          <div
            ref={(el) => { hud.bossFill = el; }}
            style={{ width: '100%', height: '100%', background: '#ff8a3c', transformOrigin: 'left' }}
          />
        </div>
      </div>

      {phase === 'title' && (
        <div style={{
          ...overlayFont, position: 'absolute', inset: 0, display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(10,12,16,0.5) 100%)',
        }}>
          <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: '0.35em', textIndent: '0.35em' }}>
            STILLHUNT
          </div>
          <div style={{ fontSize: 14, color: '#37e0d8', letterSpacing: '0.25em' }}>
            RIFT EDGE · PROVING GROUND
          </div>
          <div style={{ fontSize: 13, marginTop: 26, animation: 'verbPulse 2.2s ease-in-out infinite' }}>
            press any key
          </div>
        </div>
      )}

      {phase === 'combat' && (
        <>
          <div style={{
            ...overlayFont, position: 'absolute', top: 14, left: 0, right: 0,
            textAlign: 'center', fontSize: 13, letterSpacing: '0.15em', opacity: 0.85,
          }}>
            {bossRound ? '' : 'DROP ALL FOUR · THEY FIGHT BACK'}
          </div>
          <div style={{
            position: 'absolute', bottom: 64, left: '50%', transform: 'translateX(-50%)',
            width: 240, height: 10, background: 'rgba(10,12,16,0.6)', borderRadius: 5,
            overflow: 'hidden', pointerEvents: 'none',
          }}>
            <div
              ref={(el) => { hud.hpFill = el; }}
              style={{
                width: '100%', height: '100%', background: '#43d17c',
                transformOrigin: 'left', transition: 'background 0.2s',
              }}
            />
          </div>
          <div style={{
            ...overlayFont, position: 'absolute', left: 12, bottom: 12, fontSize: 13,
            lineHeight: 1.7, background: 'rgba(10,12,16,0.55)', padding: '10px 14px', borderRadius: 8,
          }}>
            <div style={{ color: '#37e0d8', fontWeight: 700, marginBottom: 2 }}>RIFT EDGE · Ashfall</div>
            WASD move · J strike · F throw · E recall · Space dash (dodge)
          </div>
        </>
      )}

      {phase === 'bossIntro' && (
        <div style={{
          ...overlayFont, position: 'absolute', inset: 0, display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 50%, rgba(30,8,4,0.55) 100%)',
        }}>
          <div style={{ fontSize: 56, fontWeight: 800, letterSpacing: '0.35em', textIndent: '0.35em', color: '#ff8a5c' }}>
            CINDER
          </div>
          <div style={{ fontSize: 14, opacity: 0.9, fontStyle: 'italic' }}>
            "I burned this place once. Burning you will be easier."
          </div>
        </div>
      )}

      {phase === 'cleared' && (
        <div style={{
          ...overlayFont, position: 'absolute', inset: 0, display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: '0.3em', textIndent: '0.3em', color: '#37e0d8' }}>
            {bossRound ? 'ZONE CLEAR' : 'CLEARED'}
          </div>
          {beatSecs !== null && (
            <div style={{ fontSize: 15, opacity: 0.9 }}>
              {bossRound ? `Cinder down in ${beatSecs.toFixed(1)}s` : `in ${beatSecs.toFixed(1)}s`}
            </div>
          )}
        </div>
      )}

      {phase === 'down' && (
        <div style={{
          ...overlayFont, position: 'absolute', inset: 0, display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: '0.3em', textIndent: '0.3em', color: '#ff5544' }}>
            DOWN
          </div>
          {beatSecs !== null && (
            <div style={{ fontSize: 15, opacity: 0.9 }}>survived {beatSecs.toFixed(1)}s</div>
          )}
        </div>
      )}
    </div>
  );
}
