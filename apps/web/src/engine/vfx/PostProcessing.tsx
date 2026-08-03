'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  EffectComposer,
  Bloom,
  ChromaticAberration,
  Vignette,
  ToneMapping,
} from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import type { ScreenEffects } from './ScreenEffects';

interface CombatPostProcessingProps {
  screenEffects: ScreenEffects;
}

export function CombatPostProcessing({ screenEffects }: CombatPostProcessingProps) {
  const caRef = useRef<any>(null);
  const vignetteRef = useRef<any>(null);
  const bloomRef = useRef<any>(null);

  useFrame(() => {
    const state = screenEffects.state;

    if (caRef.current) {
      const offset = state.chromaticAberration.intensity;
      caRef.current.offset = new THREE.Vector2(offset, offset);
    }

    if (vignetteRef.current) {
      vignetteRef.current.darkness = state.vignetteIntensity;
    }

    if (bloomRef.current) {
      const hasFlash = state.flash !== null;
      bloomRef.current.intensity = hasFlash ? 2.5 : 0.8;
    }
  });

  return (
    <EffectComposer multisampling={0}>
      <Bloom
        ref={bloomRef}
        intensity={0.8}
        luminanceThreshold={0.6}
        luminanceSmoothing={0.3}
        mipmapBlur
      />
      <ChromaticAberration
        ref={caRef}
        blendFunction={BlendFunction.NORMAL}
        offset={new THREE.Vector2(0, 0)}
        radialModulation={false}
        modulationOffset={0}
      />
      <Vignette
        ref={vignetteRef}
        darkness={0.3}
        offset={0.3}
        blendFunction={BlendFunction.NORMAL}
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
