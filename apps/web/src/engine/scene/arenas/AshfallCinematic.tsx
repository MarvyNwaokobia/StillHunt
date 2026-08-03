'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { mulberry32 } from './prng';
import { VILLAGE, WELL_POS, CART_POS, CART_YAW, type HouseSpec } from './ashfallLayout';

/**
 * ASHFALL, cinematic build (CLONE_PLAN.md slice 6a, take two).
 *
 * Marvy's note on take one: reusing the flat-shaded stylized arena recreated
 * OLD StillHunt's look. This build chases the reference look instead — the StillHunt
 * lesson that realism on simple geometry is a RENDERING choice:
 *
 *   real PBR surfaces (Poly Haven CC0: burned ground, damaged plaster,
 *   broken brick, charred planks) · one low warm key light through smoke ·
 *   dim blue-gray dusk fill · heavy fog turning distance into silhouettes ·
 *   fire light flickering in the wrecks · filmic post (grain/vignette/ACES)
 *
 * WHERE things stand still comes from ashfallLayout — identical colliders,
 * a completely different image.
 */

const T = '/textures/ashfall';

function usePbr(base: string, repeat: [number, number]) {
  const maps = useTexture({
    map: `${T}/${base}_diff_1k.jpg`,
    normalMap: `${T}/${base}_nor_gl_1k.jpg`,
    roughnessMap: `${T}/${base}_rough_1k.jpg`,
  });
  return useMemo(() => {
    for (const [key, tex] of Object.entries(maps)) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeat[0], repeat[1]);
      tex.colorSpace = key === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.anisotropy = 4;
    }
    return maps;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maps]);
}

/** Fire still alive in a hearth: warm point light with a real flicker. */
function HearthFire({ position }: { position: [number, number, number] }) {
  const lightRef = useRef<THREE.PointLight>(null);
  const seed = useMemo(() => Math.random() * 100, []);
  useFrame(({ clock }) => {
    if (!lightRef.current) return;
    const t = clock.elapsedTime * 9 + seed;
    lightRef.current.intensity =
      7 + Math.sin(t) * 1.6 + Math.sin(t * 2.7) * 1.1 + Math.sin(t * 7.3) * 0.6;
  });
  return (
    <group position={position}>
      <pointLight ref={lightRef} color="#ff7a30" distance={13} decay={2} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <circleGeometry args={[0.55, 12]} />
        <meshStandardMaterial
          color="#1a0d06"
          emissive="#ff5a1a"
          emissiveIntensity={2.4}
          roughness={1}
        />
      </mesh>
    </group>
  );
}

function BurnedHouse({ spec, mats }: {
  spec: HouseSpec;
  mats: { plaster: THREE.MeshStandardMaterial; brick: THREE.MeshStandardMaterial; char: THREE.MeshStandardMaterial };
}) {
  return (
    <group position={[spec.x, 0, spec.z]} rotation={[0, spec.yaw, 0]}>
      {/* scorched floor slab */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <planeGeometry args={[spec.w, spec.d]} />
        <meshStandardMaterial color="#171310" roughness={1} />
      </mesh>

      {/* structural walls — the sim collides with exactly these boxes */}
      {spec.walls.map((w, i) => (
        <group key={i}>
          <mesh position={[w.lx, w.h / 2, w.lz]} castShadow receiveShadow
            material={w.mat === 'plaster' ? mats.plaster : mats.brick}>
            <boxGeometry args={[w.hx * 2, w.h, w.hz * 2]} />
          </mesh>
          {w.soot && (
            <mesh position={[w.lx, w.h - 0.2, w.lz]} material={mats.char}>
              <boxGeometry args={[w.hx * 2 + 0.03, 0.4, w.hz * 2 + 0.03]} />
            </mesh>
          )}
        </group>
      ))}

      {/* chimney standing over the wreck */}
      {spec.chimney && (
        <mesh position={[spec.chimney.lx, spec.chimney.h / 2, spec.chimney.lz]}
          castShadow material={mats.brick}>
          <boxGeometry args={[0.8, spec.chimney.h, 0.8]} />
        </mesh>
      )}

      {/* charred roof beams, some collapsed */}
      {spec.beams.map((b, i) => (
        <mesh
          key={i}
          position={[b.x, b.fallen ? 0.18 : spec.hBack * 0.62, b.fallen ? spec.d * 0.18 : 0]}
          rotation={b.fallen ? [0.06, b.yawJitter, Math.PI / 2 - 0.12] : [b.tilt, b.yawJitter, 0]}
          castShadow
          material={mats.char}
        >
          <boxGeometry args={[0.16, spec.d * 0.92, 0.12]} />
        </mesh>
      ))}

      {spec.emberLight && (
        <HearthFire position={[spec.ember.lx, 0.25, spec.ember.lz]} />
      )}
    </group>
  );
}

/** Dead trees + distant burned forest: silhouettes for the fog to layer. */
function DeadForest() {
  const spires = useMemo(() => {
    const rand = mulberry32(31);
    const list: Array<{ x: number; z: number; h: number; r: number }> = [];
    for (let i = 0; i < 60; i++) {
      const a = rand() * Math.PI * 2;
      const dist = 34 + rand() * 42;
      list.push({
        x: Math.cos(a) * dist,
        z: Math.sin(a) * dist,
        h: 5 + rand() * 9,
        r: 0.14 + rand() * 0.3,
      });
    }
    return list;
  }, []);
  return (
    <group>
      {spires.map((s, i) => (
        <mesh key={i} position={[s.x, s.h / 2, s.z]}>
          <coneGeometry args={[s.r, s.h, 5]} />
          <meshStandardMaterial color="#100d0b" roughness={1} />
        </mesh>
      ))}
      {VILLAGE.trees.map((t, i) => (
        <group key={`v${i}`} position={[t.x, 0, t.z]} scale={t.scale}>
          <mesh position={[0, 1.8, 0]} castShadow>
            <cylinderGeometry args={[0.16, 0.28, 3.6, 6]} />
            <meshStandardMaterial color="#15100c" roughness={1} />
          </mesh>
          <mesh position={[0.5, 2.9, 0]} rotation={[0, 0, -0.7]} castShadow>
            <cylinderGeometry args={[0.05, 0.11, 1.7, 5]} />
            <meshStandardMaterial color="#15100c" roughness={1} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function AshfallCinematic() {
  const ground = usePbr('burned_ground_01', [14, 14]);
  const plasterMaps = usePbr('damaged_plaster', [1.6, 1.0]);
  const brickMaps = usePbr('broken_brick_wall', [1.8, 1.0]);
  const charMaps = usePbr('black_painted_planks', [2.0, 2.0]);

  const mats = useMemo(() => ({
    plaster: new THREE.MeshStandardMaterial({
      ...plasterMaps, color: '#b7a894', roughness: 1, normalScale: new THREE.Vector2(1.2, 1.2),
    }),
    brick: new THREE.MeshStandardMaterial({
      ...brickMaps, color: '#9a8474', roughness: 1, normalScale: new THREE.Vector2(1.2, 1.2),
    }),
    char: new THREE.MeshStandardMaterial({
      ...charMaps, color: '#4a4441', roughness: 0.95, normalScale: new THREE.Vector2(1, 1),
    }),
  }), [plasterMaps, brickMaps, charMaps]);

  return (
    <group>
      {/* ── The light: dusk through smoke, one warm key, cold fill ── */}
      <hemisphereLight color="#7d7a86" groundColor="#332a24" intensity={0.9} />
      <ambientLight color="#5d5864" intensity={0.34} />
      <directionalLight
        color="#ff9450"
        intensity={3.2}
        position={[-30, 10, 16]}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-34}
        shadow-camera-right={34}
        shadow-camera-top={34}
        shadow-camera-bottom={-34}
        shadow-camera-far={110}
        shadow-bias={-0.0004}
      />
      <directionalLight color="#5d6d8c" intensity={0.9} position={[22, 14, -18]} />

      {/* ── Ground: real burned earth ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[85, 48]} />
        <meshStandardMaterial {...ground} color="#aaa094" roughness={1} />
      </mesh>

      {/* ── The village ── */}
      {VILLAGE.houses.map((h, i) => (
        <BurnedHouse key={i} spec={h} mats={mats} />
      ))}

      {/* the well: chest-high brick ring */}
      <mesh position={[WELL_POS[0], 0.4, WELL_POS[1]]} castShadow receiveShadow material={mats.brick}>
        <cylinderGeometry args={[0.95, 1.0, 0.8, 10]} />
      </mesh>

      {/* the tipped cart on the west road */}
      <group position={[CART_POS[0], 0, CART_POS[1]]} rotation={[0, CART_YAW, 0.42]}>
        <mesh position={[0, 0.55, 0]} castShadow material={mats.char}>
          <boxGeometry args={[2.2, 0.5, 1.3]} />
        </mesh>
        <mesh position={[0.9, 0.35, 0.75]} rotation={[Math.PI / 2, 0, 0]} castShadow material={mats.char}>
          <cylinderGeometry args={[0.42, 0.42, 0.1, 10]} />
        </mesh>
      </group>

      <DeadForest />

      {/* distant ridge silhouette closing the horizon */}
      <mesh position={[0, 9, -95]}>
        <coneGeometry args={[95, 34, 4]} />
        <meshStandardMaterial color="#191411" roughness={1} />
      </mesh>
      <mesh position={[70, 7, -60]}>
        <coneGeometry args={[55, 24, 4]} />
        <meshStandardMaterial color="#171310" roughness={1} />
      </mesh>
    </group>
  );
}
