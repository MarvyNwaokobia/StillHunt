'use client';

import { Suspense } from 'react';
import * as THREE from 'three';
import { Environment, MeshReflectorMaterial, Sky } from '@react-three/drei';

/**
 * SEMI-REALISTIC art direction — moody, cinematic, PBR, OUTDOOR.
 *
 * Large outdoor coliseum (r≈20) under a golden-hour sky. Spacious — fighters
 * traverse real distance and encounter cover scattered across the field.
 */

const STONE = '#2a2420';
const STONE_RISER = '#1a1610';
const EMBER = '#ff7a2e';

const SEAT_TIERS = [
  { inner: 21, outer: 24, y: 1.0 },
  { inner: 24, outer: 27, y: 2.4 },
  { inner: 27, outer: 31, y: 3.8 },
];

export function RealisticArena() {
  return (
    <group>
      {/* Outdoor golden-hour sky */}
      <Sky
        distance={450000}
        sunPosition={[50, 15, -40]}
        inclination={0.49}
        azimuth={0.25}
        mieCoefficient={0.01}
        mieDirectionalG={0.95}
        rayleigh={2}
        turbidity={10}
      />
      {/* Fog is set at scene level in BattleWorld */}

      <Suspense fallback={null}>
        <Environment files="/hdri/venice_sunset_1k.hdr" environmentIntensity={0.35} />
      </Suspense>

      {/* ---- Outdoor sunset lighting ---- */}
      <hemisphereLight color={'#ffd4a0'} groundColor={'#3a2820'} intensity={0.7} />
      <ambientLight color={'#ffc890'} intensity={0.3} />
      <directionalLight
        color={'#ffb060'}
        intensity={3.5}
        position={[10, 16, -7]}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={80}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-bias={-0.001}
      />
      <directionalLight color={'#6688cc'} intensity={1.2} position={[-8, 10, 7]} />
      <pointLight color={EMBER} intensity={2.5} distance={35} position={[0, 3, 14]} />
      <pointLight color={EMBER} intensity={2.5} distance={35} position={[0, 3, -14]} />

      {/* ---- Polished reflective floor ---- */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <circleGeometry args={[20, 96]} />
        <MeshReflectorMaterial
          resolution={512}
          blur={[400, 200]}
          mixBlur={1}
          mixStrength={2.2}
          roughness={0.35}
          metalness={0.6}
          color={'#201a14'}
          mirror={0}
          depthScale={0}
          minDepthThreshold={0.9}
          maxDepthThreshold={1}
        />
      </mesh>

      {/* Faint ember emblem rings */}
      {[4.5, 10, 15.5].map((r, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
          <ringGeometry args={[r - 0.1, r, 96]} />
          <meshStandardMaterial color={EMBER} emissive={EMBER} emissiveIntensity={0.5} transparent opacity={0.35} />
        </mesh>
      ))}

      {/* Pit rim wall */}
      <mesh position={[0, 0.6, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[20, 20, 1.2, 96, 1, true]} />
        <meshStandardMaterial color={STONE} roughness={0.7} metalness={0.25} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 1.2, 0]}>
        <ringGeometry args={[19.8, 20.3, 96]} />
        <meshStandardMaterial color={EMBER} emissive={EMBER} emissiveIntensity={1.1} roughness={0.4} side={THREE.DoubleSide} />
      </mesh>

      {/* ---- Tiered stone seating ---- */}
      {SEAT_TIERS.map((t, i) => (
        <group key={i}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, t.y, 0]} receiveShadow>
            <ringGeometry args={[t.inner, t.outer, 96]} />
            <meshStandardMaterial color={STONE} roughness={0.9} metalness={0.1} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, t.y - 0.5, 0]}>
            <cylinderGeometry args={[t.inner, t.inner, 1, 96, 1, true]} />
            <meshStandardMaterial color={STONE_RISER} roughness={0.95} metalness={0.05} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}

      {/* ---- Braziers ---- */}
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
        const x = Math.cos(a) * 21.5;
        const z = Math.sin(a) * 21.5;
        return (
          <group key={i} position={[x, 0, z]}>
            <mesh position={[0, 1.8, 0]} castShadow>
              <cylinderGeometry args={[0.2, 0.32, 3.6, 10]} />
              <meshStandardMaterial color={STONE} roughness={0.85} metalness={0.3} />
            </mesh>
            <mesh position={[0, 3.8, 0]}>
              <sphereGeometry args={[0.32, 10, 10]} />
              <meshStandardMaterial color={EMBER} emissive={EMBER} emissiveIntensity={2.2} />
            </mesh>
            <pointLight color={EMBER} intensity={1.1} distance={14} position={[0, 3.8, 0]} />
          </group>
        );
      })}

      {/* Ground beyond the arena */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
        <circleGeometry args={[150, 64]} />
        <meshStandardMaterial color={'#4a3828'} roughness={0.95} metalness={0} />
      </mesh>
    </group>
  );
}
