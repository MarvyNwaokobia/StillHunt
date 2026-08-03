'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface LockOnIndicatorProps {
  targetPosition: THREE.Vector3;
  active: boolean;
  classColor: string;
}

export function LockOnIndicator({ targetPosition, active, classColor }: LockOnIndicatorProps) {
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!groupRef.current || !active) {
      if (groupRef.current) groupRef.current.visible = false;
      return;
    }

    groupRef.current.visible = true;
    groupRef.current.position.copy(targetPosition);
    groupRef.current.position.y += 2.2;

    groupRef.current.lookAt(state.camera.position);

    if (ringRef.current) {
      ringRef.current.rotation.z = state.clock.elapsedTime * 1.5;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Outer rotating ring */}
      <mesh ref={ringRef}>
        <ringGeometry args={[0.28, 0.32, 4]} />
        <meshBasicMaterial
          color={classColor}
          transparent
          opacity={0.7}
          side={THREE.DoubleSide}
          depthTest={false}
        />
      </mesh>

      {/* Inner diamond */}
      <mesh rotation={[0, 0, Math.PI / 4]}>
        <ringGeometry args={[0.08, 0.14, 4]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.9}
          side={THREE.DoubleSide}
          depthTest={false}
        />
      </mesh>

      {/* Corner brackets */}
      {[0, 1, 2, 3].map((i) => {
        const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const dist = 0.4;
        return (
          <mesh
            key={i}
            position={[Math.cos(angle) * dist, Math.sin(angle) * dist, 0]}
            rotation={[0, 0, angle + Math.PI / 4]}
          >
            <planeGeometry args={[0.08, 0.02]} />
            <meshBasicMaterial
              color={classColor}
              transparent
              opacity={0.5}
              side={THREE.DoubleSide}
              depthTest={false}
            />
          </mesh>
        );
      })}
    </group>
  );
}

interface EnemyWorldHealthBarProps {
  targetPosition: THREE.Vector3;
  health: number;
  maxHealth: number;
  name: string;
  show: boolean;
}

export function EnemyWorldHealthBar({
  targetPosition,
  health,
  maxHealth,
  name: _name,
  show,
}: EnemyWorldHealthBarProps) {
  const groupRef = useRef<THREE.Group>(null);
  const barRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!groupRef.current || !show) {
      if (groupRef.current) groupRef.current.visible = false;
      return;
    }

    groupRef.current.visible = true;
    groupRef.current.position.copy(targetPosition);
    groupRef.current.position.y += 2.6;
    groupRef.current.lookAt(state.camera.position);

    if (barRef.current) {
      const pct = Math.max(0, health / maxHealth);
      barRef.current.scale.x = pct;
      barRef.current.position.x = -(1 - pct) * 0.4;
    }
  });

  const barColor = health / maxHealth < 0.25 ? '#ef4444' : health / maxHealth < 0.5 ? '#f59e0b' : '#22c55e';

  return (
    <group ref={groupRef}>
      {/* Background bar */}
      <mesh>
        <planeGeometry args={[0.8, 0.06]} />
        <meshBasicMaterial
          color="#111111"
          transparent
          opacity={0.7}
          side={THREE.DoubleSide}
          depthTest={false}
        />
      </mesh>

      {/* Health fill */}
      <mesh ref={barRef} position={[0, 0, 0.001]}>
        <planeGeometry args={[0.8, 0.06]} />
        <meshBasicMaterial
          color={barColor}
          transparent
          opacity={0.9}
          side={THREE.DoubleSide}
          depthTest={false}
        />
      </mesh>
    </group>
  );
}
