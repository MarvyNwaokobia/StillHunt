'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { StageId } from '../scene/ArenaStage';

interface LightConfig {
  ambient: { color: string; intensity: number };
  key: { color: string; intensity: number; position: [number, number, number] };
  fill: { color: string; intensity: number; position: [number, number, number] };
  rim: { color: string; intensity: number; position: [number, number, number] };
  ground: { color: string; intensity: number };
  pulseColor?: string;
  pulseSpeed?: number;
  pulseIntensity?: number;
}

const STAGE_LIGHTING: Record<StageId, LightConfig> = {
  lava_arena: {
    ambient: { color: '#ffccaa', intensity: 1.2 },
    key: { color: '#ffffff', intensity: 5, position: [5, 10, 3] },
    fill: { color: '#ff8855', intensity: 2.5, position: [-4, 6, -2] },
    rim: { color: '#ff4422', intensity: 3, position: [0, 3, -8] },
    ground: { color: '#ff8844', intensity: 1.5 },
    pulseColor: '#ff6633',
    pulseSpeed: 1.5,
    pulseIntensity: 0.8,
  },
  scifi_stage: {
    ambient: { color: '#ccbbff', intensity: 1.2 },
    key: { color: '#ffffff', intensity: 5, position: [0, 12, 5] },
    fill: { color: '#8866ff', intensity: 2.5, position: [-5, 5, -3] },
    rim: { color: '#aa66ff', intensity: 3, position: [3, 2, -6] },
    ground: { color: '#8866ff', intensity: 1.5 },
    pulseColor: '#8866ff',
    pulseSpeed: 0.8,
    pulseIntensity: 0.6,
  },
  battle_arena: {
    ambient: { color: '#ccddff', intensity: 1.5 },
    key: { color: '#ffffff', intensity: 6, position: [6, 14, 4] },
    fill: { color: '#6699cc', intensity: 2, position: [-5, 8, -3] },
    rim: { color: '#4488ff', intensity: 2.5, position: [0, 3, -7] },
    ground: { color: '#5599ff', intensity: 1 },
  },
  rpg_environment: {
    ambient: { color: '#ddeebb', intensity: 1.5 },
    key: { color: '#ffffff', intensity: 5, position: [8, 12, 5] },
    fill: { color: '#aacc88', intensity: 2, position: [-6, 4, -2] },
    rim: { color: '#bbcc99', intensity: 2, position: [-2, 3, -8] },
    ground: { color: '#99aa66', intensity: 0.8 },
  },
  industrial_hangar: {
    ambient: { color: '#c8b8a0', intensity: 1.2 },
    key: { color: '#ffe8c0', intensity: 4.5, position: [18, 26, -6] },
    fill: { color: '#e0d0b8', intensity: 1.8, position: [-16, 20, 5] },
    rim: { color: '#c89060', intensity: 1.5, position: [0, 4, -10] },
    ground: { color: '#b0a080', intensity: 0.6 },
  },
};

interface StageLightingProps {
  stageId: StageId;
}

export function StageLighting({ stageId }: StageLightingProps) {
  const config = STAGE_LIGHTING[stageId];
  const groundLightRef = useRef<THREE.PointLight>(null);
  const pulseRef = useRef<THREE.PointLight>(null);

  useFrame((state) => {
    if (config.pulseColor && pulseRef.current) {
      const t = state.clock.elapsedTime * (config.pulseSpeed ?? 1);
      const pulse = (Math.sin(t) * 0.5 + 0.5) * (config.pulseIntensity ?? 0.3);
      pulseRef.current.intensity = pulse;
    }

    if (groundLightRef.current) {
      const flicker = 1 + Math.sin(state.clock.elapsedTime * 3.7) * 0.05;
      groundLightRef.current.intensity = config.ground.intensity * flicker;
    }
  });

  return (
    <>
      <ambientLight
        color={config.ambient.color}
        intensity={config.ambient.intensity}
      />

      <directionalLight
        color={config.key.color}
        intensity={config.key.intensity}
        position={config.key.position}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={50}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
        shadow-bias={-0.001}
      />

      <directionalLight
        color={config.fill.color}
        intensity={config.fill.intensity}
        position={config.fill.position}
      />

      <directionalLight
        color={config.rim.color}
        intensity={config.rim.intensity}
        position={config.rim.position}
      />

      <pointLight
        ref={groundLightRef}
        color={config.ground.color}
        intensity={config.ground.intensity}
        distance={25}
        position={[0, 0.3, 0]}
      />

      {config.pulseColor && (
        <pointLight
          ref={pulseRef}
          color={config.pulseColor}
          intensity={0}
          distance={20}
          position={[0, 1, 0]}
        />
      )}
    </>
  );
}
