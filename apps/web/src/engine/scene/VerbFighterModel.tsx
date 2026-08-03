'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  AnimationStateMachine, AnimState,
  loadMixamoAnimations, getMixamoClips, isMixamoLoadComplete,
  type AnimationMap,
} from '../animation';
import type { VerbSim, BossMove } from '../verb';

/**
 * A real body for the verb game (CLONE_PLAN slice 6b) — a GLB rig driven
 * straight off VerbSim state, mounted INSIDE the scene's positioned groups
 * (the scene keeps owning position/rotation/scale; this owns the skeleton).
 *
 * Inherits every hard-won trick from the legacy FighterModel:
 *  - the HIPS_PITCH_FIX undo/apply dance (Blender Z-up export vs Mixamo
 *    clips; unconditional premultiply compounds once one-shots finish)
 *  - weapons socket as SIBLINGS matrix-driven from the hand bone (parenting
 *    into the rig corrupts the bind and T-poses the fighter)
 *  - hidden until real animation drives the rig (no T-pose flash)
 *  - hip-height rig scale so locomotion cadence matches leg length
 *
 * State mapping is POLLED from the sim each frame (rising edges on melee
 * stage / edge state / ai), so the component needs no event plumbing.
 */

const HIPS_PITCH_FIX = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const HIPS_PITCH_FIX_INV = HIPS_PITCH_FIX.clone().invert();

// Blade grip relative to the right-hand bone (same frame the gun used).
const EDGE_GRIP = new THREE.Matrix4().compose(
  new THREE.Vector3(0, 0.03, 0.05),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)),
  new THREE.Vector3(1, 1, 1),
);
const _scratch = new THREE.Matrix4();

/** The Rift Edge as a plain Object3D (JSX version lives in the scene for the loose blade). */
function makeEdgeObject(): THREE.Group {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.025, 0.9),
    new THREE.MeshStandardMaterial({ color: '#b9c2cc', metalness: 0.8, roughness: 0.35 }),
  );
  blade.position.set(0, 0, 0.45);
  blade.castShadow = true;
  const edgeLight = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 0.032, 0.86),
    new THREE.MeshStandardMaterial({ color: '#37e0d8', emissive: '#37e0d8', emissiveIntensity: 1.6 }),
  );
  edgeLight.position.set(0, 0, 0.44);
  const guard = new THREE.Mesh(
    new THREE.BoxGeometry(0.26, 0.05, 0.07),
    new THREE.MeshStandardMaterial({ color: '#4a4d55' }),
  );
  guard.position.set(0, 0, -0.06);
  const grip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.22),
    new THREE.MeshStandardMaterial({ color: '#2e3037' }),
  );
  grip.position.set(0, 0, -0.18);
  g.add(blade, edgeLight, guard, grip);
  return g;
}

export interface VerbFighterModelProps {
  modelPath: string;
  animMap: AnimationMap;
  sim: VerbSim;
  /** 'hero' or a dummy index. */
  body: 'hero' | number;
  /** Multiplied into every material — archetype/boss tinting. */
  tint?: string;
  /** Socket the Rift Edge to the right hand (hero only). */
  withEdge?: boolean;
  /** Boss bodies: which move is firing (picks the strike clip). */
  getBossMove?: () => BossMove | null;
}

export function VerbFighterModel({
  modelPath, animMap, sim, body, tint, withEdge, getBossMove,
}: VerbFighterModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const hipsBoneRef = useRef<THREE.Object3D | null>(null);
  const handBoneRef = useRef<THREE.Object3D | null>(null);
  const edgeRef = useRef<THREE.Group | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const machine = useMemo(() => new AnimationStateMachine(animMap), [animMap]);

  const initDone = useRef(false);
  const mixamoApplied = useRef(false);
  const revealed = useRef(false);
  const initTime = useRef(0);
  const grounded = useRef(false);
  const revealAt = useRef(0);
  const hipsFixApplied = useRef(false);
  const lastPos = useRef(new THREE.Vector3());
  const speedRef = useRef(0);

  // Rising-edge trackers.
  const prevStage = useRef(0);
  const prevEdgeHeld = useRef(true);
  const prevDead = useRef(false);
  const prevAi = useRef('idle');
  const prevDash = useRef(false);
  const prevStagger = useRef(0);
  const throwAt = useRef(-10);

  const materialsRef = useRef<THREE.MeshStandardMaterial[]>([]);

  const { scene, animations } = useGLTF(modelPath);
  const clonedScene = useMemo(() => {
    const clone = SkeletonUtils.clone(scene);
    const mats: THREE.MeshStandardMaterial[] = [];
    const tintColor = tint ? new THREE.Color(tint) : null;
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        // Clone materials so tint/telegraph emissive never leaks across bodies.
        const src = child.material as THREE.MeshStandardMaterial;
        const mat = src.clone();
        if (tintColor) mat.color.multiply(tintColor);
        child.material = mat;
        mats.push(mat);
      }
    });
    materialsRef.current = mats;
    return clone;
  }, [scene, tint]);

  useMemo(() => { loadMixamoAnimations(); }, []);

  useFrame((_, dt) => {
    const g = groupRef.current;
    if (!g) return;

    const d = body === 'hero' ? null : sim.getDummies()[body];
    if (body !== 'hero' && !d) { g.visible = false; return; }

    // ── One-time rig init ──
    if (!initDone.current && g.children.length > 0) {
      initDone.current = true;
      const mixer = new THREE.AnimationMixer(g);
      mixerRef.current = mixer;
      machine.init(mixer, animations);
      let hipsBone: THREE.Object3D | null = null;
      g.traverse((child) => {
        if ((child as THREE.Bone).isBone) {
          if (!hipsBone && /hips/i.test(child.name)) { hipsBone = child; hipsBoneRef.current = child; }
          if (!handBoneRef.current && /righthand$/i.test(child.name)) handBoneRef.current = child;
        }
      });
      if (hipsBone) {
        g.updateWorldMatrix(true, true);
        const hipY = (hipsBone as THREE.Object3D).getWorldPosition(new THREE.Vector3()).y;
        machine.setRigScale(hipY);
      }
    }

    // ── Bind the FULL Mixamo set once it's all loaded ──
    if (initDone.current && !mixamoApplied.current && mixerRef.current && isMixamoLoadComplete()) {
      const mixamoClips = getMixamoClips();
      if (mixamoClips.size > 0) {
        mixamoApplied.current = true;
        const combined = [...animations];
        for (const [name, clip] of mixamoClips) {
          if (!combined.find((c) => c.name === name)) combined.push(clip);
        }
        machine.init(mixerRef.current, combined);
        if (withEdge && !edgeRef.current) {
          const edge = makeEdgeObject();
          edge.matrixAutoUpdate = false;
          g.add(edge);
          edgeRef.current = edge;
        }
      }
    }

    // ── Reveal only once real animation drives the rig ──
    if (!revealed.current && initDone.current) {
      if (initTime.current === 0) initTime.current = performance.now();
      if (mixamoApplied.current || performance.now() - initTime.current > 2500) {
        revealed.current = true;
        revealAt.current = performance.now();
      }
    }
    g.visible = revealed.current;
    if (!revealed.current) return;

    // Ground the rig: bind poses can hover above their origin, so once the
    // idle clip has settled, measure the lowest point and plant the feet.
    if (!grounded.current && performance.now() - revealAt.current > 400) {
      grounded.current = true;
      g.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(clonedScene);
      if (Number.isFinite(box.min.y)) {
        const gy = g.getWorldPosition(new THREE.Vector3()).y;
        const worldScale = g.getWorldScale(new THREE.Vector3()).y || 1;
        const drop = (box.min.y - gy) / worldScale; // into the rig's local units
        if (Math.abs(drop) > 0.02) clonedScene.position.y -= drop;
      }
    }

    // ── State mapping ──
    const worldPos = g.getWorldPosition(new THREE.Vector3());
    const dx = worldPos.x - lastPos.current.x;
    const dz = worldPos.z - lastPos.current.z;
    lastPos.current.copy(worldPos);
    const vx = dt > 1e-4 ? dx / dt : 0;
    const vz = dt > 1e-4 ? dz / dt : 0;
    const planar = Math.hypot(vx, vz);
    // Smooth: killcam-era huge dt spikes shouldn't flick run cycles.
    speedRef.current += (Math.min(planar, 8) - speedRef.current) * Math.min(1, dt * 12);
    const speed = speedRef.current;

    if (body === 'hero') {
      const down = sim.heroIsDown;
      if (down && !prevDead.current) machine.transition(AnimState.Death, true);
      if (!down && prevDead.current) machine.transition(AnimState.Idle, true);
      prevDead.current = down;

      if (!down) {
        const stage = sim.meleeState.stage;
        if (stage > prevStage.current) {
          machine.transition(sim.armed ? AnimState.Attack : AnimState.AttackUnarmed, true, undefined, stage > 1);
        }
        prevStage.current = stage;

        const held = sim.edgeState === 'held';
        if (prevEdgeHeld.current && sim.edgeState === 'thrown') {
          machine.transition(AnimState.Throw, true);
          throwAt.current = performance.now();
        }
        prevEdgeHeld.current = held;

        if (sim.dashing && !prevDash.current) machine.transition(AnimState.Dodge, true);
        prevDash.current = sim.dashing;

        // Locomotion only when no verb is mid-swing.
        const throwing = performance.now() - throwAt.current < 320;
        if (stage === 0 && !sim.dashing && !throwing) {
          const want = speed > 4 ? AnimState.Run : speed > 0.5 ? AnimState.Walk : AnimState.Idle;
          machine.transition(want);
          machine.matchLocomotionSpeed(speed);
          if (planar > 0.3) {
            // Project travel on the facing so strafes/backpedal pick clips
            // (forward = (sinθ, cosθ), right = (-cosθ, sinθ)).
            const sin = Math.sin(sim.heroYaw);
            const cos = Math.cos(sim.heroYaw);
            machine.setMoveDirection(vx * sin + vz * cos, -vx * cos + vz * sin);
          }
        }
      }
      if (edgeRef.current) edgeRef.current.visible = sim.armed;
    } else if (d) {
      if (d.dead && !prevDead.current) machine.transition(AnimState.Death, true);
      if (!d.dead && prevDead.current) machine.transition(AnimState.Idle, true);
      prevDead.current = d.dead;

      if (!d.dead) {
        if (d.ai === 'strike' && prevAi.current !== 'strike') {
          const move = getBossMove?.() ?? null;
          if (d.boss && move === 'ashRing') machine.transition(AnimState.AttackUnarmed, true);
          else if (d.boss && move === 'emberToss') machine.transition(AnimState.Throw, true);
          else machine.transition(AnimState.Attack, true);
        }
        prevAi.current = d.ai;

        // Flinch on fresh hits, but never through a strike (armor frames read better).
        if (d.stagger > 0.2 && prevStagger.current <= 0.2 && d.ai !== 'strike' && !d.boss) {
          machine.transition(AnimState.HitLight, true);
        }
        prevStagger.current = d.stagger;

        if (d.ai === 'reposition' || d.ai === 'idle') {
          const want = speed > 3 ? AnimState.Run : speed > 0.35 ? AnimState.Walk : AnimState.Idle;
          machine.transition(want);
          machine.matchLocomotionSpeed(speed);
          if (planar > 0.3) {
            const sin = Math.sin(d.yaw);
            const cos = Math.cos(d.yaw);
            machine.setMoveDirection(vx * sin + vz * cos, -vx * cos + vz * sin);
          }
        }
      }

      // Telegraph emissive on the real body — same language as the capsules.
      const mats = materialsRef.current;
      let emissive = 0x000000;
      let intensity = 1;
      if (d.flash > 0) { emissive = 0xff3322; intensity = 0.9; }
      else if (d.ai === 'windup') {
        const p = 1 - d.aiT / d.windupTotal;
        emissive = d.boss ? 0xff5510 : 0xffa028;
        intensity = 0.2 + p * 1.1;
      } else if (d.ai === 'strike') { emissive = 0xff4416; intensity = 0.9; }
      else if (d.ai === 'phase') { emissive = 0xfff2dd; intensity = 0.9 + Math.sin(performance.now() / 60) * 0.4; }
      else if (d.ai === 'broken') { emissive = 0x37e0d8; intensity = 0.45; }
      else if (d.boss) { emissive = 0x531f08; intensity = 0.8; }
      for (const m of mats) {
        m.emissive.setHex(emissive);
        m.emissiveIntensity = intensity;
      }
    }

    // ── The hips-fix dance, then the mixer, then re-apply ──
    if (hipsBoneRef.current && hipsFixApplied.current) {
      hipsBoneRef.current.quaternion.premultiply(HIPS_PITCH_FIX_INV);
    }
    machine.update(dt);
    if (hipsBoneRef.current) {
      hipsBoneRef.current.quaternion.premultiply(HIPS_PITCH_FIX);
      hipsFixApplied.current = true;
    }

    // ── The Edge rides the hand bone (sibling, matrix-driven) ──
    if (edgeRef.current && edgeRef.current.visible && handBoneRef.current) {
      handBoneRef.current.updateWorldMatrix(true, false);
      _scratch.copy(g.matrixWorld).invert();
      edgeRef.current.matrix
        .multiplyMatrices(_scratch, handBoneRef.current.matrixWorld)
        .multiply(EDGE_GRIP);
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <primitive object={clonedScene} />
    </group>
  );
}
