'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { StageId } from '../scene/ArenaStage';

interface AmbientParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface AmbientVFXConfig {
  count: number;
  color: string;
  size: number;
  speed: [number, number];
  area: [number, number, number];
  direction: THREE.Vector3;
  life: [number, number];
  emissive: boolean;
  drift: number;
}

const STAGE_VFX: Record<StageId, AmbientVFXConfig> = {
  lava_arena: {
    count: 120,
    color: '#ff6622',
    size: 0.04,
    speed: [0.3, 1.5],
    area: [40, 10, 30],
    direction: new THREE.Vector3(0, 1, 0),
    life: [2, 5],
    emissive: true,
    drift: 0.3,
  },
  scifi_stage: {
    count: 80,
    color: '#8866ff',
    size: 0.03,
    speed: [0.1, 0.6],
    area: [36, 8, 28],
    direction: new THREE.Vector3(0, 0.5, 0),
    life: [3, 7],
    emissive: true,
    drift: 0.5,
  },
  battle_arena: {
    count: 60,
    color: '#aaccff',
    size: 0.025,
    speed: [0.05, 0.3],
    area: [40, 6, 30],
    direction: new THREE.Vector3(0, -0.3, 0),
    life: [4, 8],
    emissive: true,
    drift: 0.2,
  },
  rpg_environment: {
    count: 100,
    color: '#88aa44',
    size: 0.035,
    speed: [0.2, 0.8],
    area: [40, 5, 30],
    direction: new THREE.Vector3(0.3, -0.1, 0.2),
    life: [3, 6],
    emissive: false,
    drift: 0.6,
  },
  industrial_hangar: {
    count: 90,
    color: '#c8b898',
    size: 0.03,
    speed: [0.02, 0.15],
    area: [48, 25, 38],
    direction: new THREE.Vector3(0, -0.05, 0),
    life: [5, 12],
    emissive: false,
    drift: 0.15,
  },
};

interface AmbientVFXProps {
  stageId: StageId;
}

export function AmbientVFX({ stageId }: AmbientVFXProps) {
  const config = STAGE_VFX[stageId];
  const particlesRef = useRef<AmbientParticle[]>([]);
  const pointsRef = useRef<THREE.Points>(null);

  const { geometry, material } = useMemo(() => {
    const positions = new Float32Array(config.count * 3);
    const colors = new Float32Array(config.count * 3);
    const sizes = new Float32Array(config.count);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.PointsMaterial({
      size: config.size,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: config.emissive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    const particles: AmbientParticle[] = [];
    for (let i = 0; i < config.count; i++) {
      particles.push(spawnParticle(config));
    }
    particlesRef.current = particles;

    return { geometry: geo, material: mat };
  }, [config]);

  useFrame((_, dt) => {
    const particles = particlesRef.current;
    const posAttr = geometry.attributes.position as THREE.BufferAttribute;
    const colAttr = geometry.attributes.color as THREE.BufferAttribute;
    const sizeAttr = geometry.attributes.size as THREE.BufferAttribute;
    const color = new THREE.Color(config.color);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.life -= dt;

      if (p.life <= 0) {
        particles[i] = spawnParticle(config);
        continue;
      }

      const driftX = Math.sin(p.life * 2 + i) * config.drift * dt;
      const driftZ = Math.cos(p.life * 1.5 + i * 0.7) * config.drift * dt;

      p.position.addScaledVector(p.velocity, dt);
      p.position.x += driftX;
      p.position.z += driftZ;

      const alpha = Math.min(1, p.life / p.maxLife, (p.maxLife - p.life) / 0.5);

      posAttr.array[i * 3] = p.position.x;
      posAttr.array[i * 3 + 1] = p.position.y;
      posAttr.array[i * 3 + 2] = p.position.z;

      colAttr.array[i * 3] = color.r * alpha;
      colAttr.array[i * 3 + 1] = color.g * alpha;
      colAttr.array[i * 3 + 2] = color.b * alpha;

      sizeAttr.array[i] = config.size * (0.5 + alpha * 0.5);
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} />;
}

function spawnParticle(config: AmbientVFXConfig): AmbientParticle {
  const [areaX, areaY, areaZ] = config.area;
  const speed = config.speed[0] + Math.random() * (config.speed[1] - config.speed[0]);
  const life = config.life[0] + Math.random() * (config.life[1] - config.life[0]);

  return {
    position: new THREE.Vector3(
      (Math.random() - 0.5) * areaX,
      Math.random() * areaY,
      (Math.random() - 0.5) * areaZ
    ),
    velocity: config.direction.clone().multiplyScalar(speed).add(
      new THREE.Vector3(
        (Math.random() - 0.5) * 0.2,
        (Math.random() - 0.5) * 0.1,
        (Math.random() - 0.5) * 0.2
      )
    ),
    life,
    maxLife: life,
  };
}
