'use client';

import { useMemo } from 'react';
import { useGLTF, Sky } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Loads a downloaded GLTF stage (real Sketchfab fighting-arena models that shipped
 * in the repo but were never wired in) and drops it into the duel.
 *
 * These models arrive at arbitrary scale/origin, so we normalize from the bounding
 * box: centre on XZ, sit the base on y=0, and scale so the stage spans `fitRadius`.
 * A thin dark play-disc under the fighters guarantees they always have ground even
 * if a model's own floor sits slightly off zero. Each variant brings its own light
 * mood + fog; the models' emissive textures add self-glow.
 */

export type ModelArenaId = 'scifi';

interface ModelConfig {
  url: string;
  fitRadius: number;          // half the stage's intended XZ span (metres)
  yOffset: number;            // nudge after base-align (raise/lower the stage)
  background: string;
  fog: [number, number];
  ambient: { color: string; intensity: number };
  // Hemisphere (sky tint above, ground bounce below) — the outdoor-daylight
  // signature that makes the enclosed stages read as open-air.
  hemi: { sky: string; ground: string; intensity: number };
  key: { color: string; intensity: number };
  fill: { color: string; intensity: number };
  // Mesh-name pattern for the model's own sky/backdrop dome. It's hidden so it
  // can't engulf the raised camera; the arena's own sky background + haze stand in.
  backdrop?: RegExp;
  credit: string;
}

// Backgrounds are bright, sky-toned (per theme) and the fog is a far, matching
// haze — together they read as open-air daylight rather than a dark, enclosed room.
const MODELS: Record<ModelArenaId, ModelConfig> = {
  scifi: {
    url: '/models/environments/scifi_stage/scene.gltf',
    fitRadius: 22, yOffset: 0,
    background: '#5f5294', fog: [55, 185], // bright dusk-violet sky
    ambient: { color: '#ab9ce0', intensity: 0.4 },
    hemi: { sky: '#bcaaf8', ground: '#3c3660', intensity: 0.95 },
    key: { color: '#fff3ff', intensity: 2.7 },
    fill: { color: '#9a7ce0', intensity: 1.0 },
    backdrop: /outer/i, // the nebula shell — engulfs the raised camera
    credit: '"Low Poly Sci-fi Fighting Stage" by Umar (Sketchfab Standard)',
  },
};

function FittedModel({ cfg }: { cfg: ModelConfig }) {
  const { scene } = useGLTF(cfg.url);

  const fitted = useMemo(() => {
    // Static environment meshes (no skinning) — a plain deep clone is enough.
    const root = scene.clone(true);
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        if (cfg.backdrop?.test(o.name)) {
          o.visible = false; // engulfing sky/backdrop dome — arena bg/fog stands in
          return;
        }
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    root.updateMatrixWorld(true);

    // Fit to the STAGE, not the skybox — these Sketchfab models ship their own
    // sky/background domes that would otherwise blow up the bounding box and
    // shrink the actual arena to a dot. Measure only the non-sky meshes.
    const stageBox = new THREE.Box3();
    root.traverse((o) => {
      if (o instanceof THREE.Mesh && !/sky|background|\bbg\b|star|space|dome|cloud/i.test(o.name)) {
        stageBox.expandByObject(o);
      }
    });
    const box = stageBox.isEmpty() ? new THREE.Box3().setFromObject(root) : stageBox;
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const horiz = Math.max(size.x, size.z) || 1;
    const scale = (cfg.fitRadius * 2) / horiz;

    // Centre on XZ; base to y=0 for now (floor re-seating happens after scaling).
    root.position.set(-center.x, -box.min.y, -center.z);

    const wrapper = new THREE.Group();
    wrapper.add(root);
    wrapper.scale.setScalar(scale);
    wrapper.updateMatrixWorld(true);

    // Seat the fighters on the real standing surface: raycast straight down at the
    // centre and take the topmost hit in the LOWER half of the stage (so a ceiling
    // or sky dome up top is ignored). Offset the stage so that surface lands on y=0.
    //
    // NB: heights here MUST be in the repositioned+scaled WRAPPER space. After the
    // -box.min.y shift the stage spans [0, size.y*scale], so deriving topY/midY from
    // the original box (which can be centred on the origin, i.e. negative min.y — the
    // sci-fi stage) would put midY below the real floor, reject every hit, fall back
    // to floorY=0 and bury the fighters under an elevated standing surface.
    const ray = new THREE.Raycaster();
    const stageHeight = size.y * scale;
    const topY = stageHeight + 5;
    const midY = stageHeight * 0.5;
    ray.set(new THREE.Vector3(0, topY, 0), new THREE.Vector3(0, -1, 0));
    const hits = ray.intersectObject(wrapper, true).filter((h) => h.point.y <= midY);
    const floorY = hits.length ? Math.max(...hits.map((h) => h.point.y)) : 0;

    wrapper.position.y = cfg.yOffset - floorY;
    return wrapper;
  }, [scene, cfg]);

  return <primitive object={fitted} />;
}

export function ModelArena({ variant }: { variant: ModelArenaId }) {
  const cfg = MODELS[variant];
  return (
    <group>
      {/* Outdoor sky dome — the model's own backdrop is hidden; this stands in */}
      <Sky
        distance={450000}
        sunPosition={[40, 20, -60]}
        inclination={0.48}
        azimuth={0.15}
        mieCoefficient={0.008}
        mieDirectionalG={0.9}
        rayleigh={2.5}
        turbidity={6}
      />
      {/* Fog is set at scene level in BattleWorld */}

      {/* Outdoor daylight: hemisphere (sky tint above / ground bounce below) + a
          bright directional sun — reads as open-air rather than a lit interior. */}
      <hemisphereLight color={cfg.hemi.sky} groundColor={cfg.hemi.ground} intensity={cfg.hemi.intensity} />
      <ambientLight color={cfg.ambient.color} intensity={cfg.ambient.intensity} />
      <directionalLight
        color={cfg.key.color}
        intensity={cfg.key.intensity}
        position={[6, 14, 5]}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={60}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-bias={-0.0008}
      />
      <directionalLight color={cfg.fill.color} intensity={cfg.fill.intensity} position={[-6, 7, -4]} />

      {/* Safety play-disc so fighters always have ground under them. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow>
        <circleGeometry args={[20, 64]} />
        <meshStandardMaterial color={'#0c0c12'} roughness={0.95} metalness={0.1} />
      </mesh>

      <FittedModel cfg={cfg} />
    </group>
  );
}

// Preload nothing by default (heavy models load on first toggle to them).
