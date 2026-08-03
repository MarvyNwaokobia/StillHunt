'use client';

import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { useSearchParams } from 'next/navigation';
import { Environment } from '@react-three/drei';
import { buildProceduralGun, type ProceduralGunId } from '@/engine/scene/proceduralGuns';

/**
 * Single-gun render target for BAKING catalogue art.
 *
 * The marketplace shows baked PNGs, not live 3D — one image request per card instead
 * of a WebGL context per card, which is what keeps the shop cheap. The procedural
 * seasonal weapons have no GLB to bake from the usual tool, so this renders one at a
 * time on a transparent background for a headless screenshot to capture.
 *
 * /dev/bake-gun?id=ember_halo
 */
const LEN: Record<string, number> = {
  ashfall_carbine: 0.72, warden_repeater: 1.06, rift_lance: 1.16, seraph_lmg: 1.02, ember_halo: 0.9,
};

function Gun({ id }: { id: ProceduralGunId }) {
  const model = useMemo(() => {
    const g = buildProceduralGun(id, LEN[id]);
    g.scale.setScalar(1 / LEN[id]); // normalise so every gun frames identically
    return g;
  }, [id]);
  // EXACTLY the pose the existing catalogue art is baked at (see dev/bake-items):
  // the GLB path flips the muzzle to -Z and then poses the holder at
  // (0.08, PI/2 - 0.42, 0). These models are authored barrel-along-+Z, so the inner
  // PI yaw puts them in the same convention before the identical hero angle is
  // applied — otherwise the new guns face the opposite way to every old one.
  return (
    <group rotation={[0.08, Math.PI / 2 - 0.42, 0]}>
      <group rotation={[0, Math.PI, 0]}>
        <primitive object={model} />
      </group>
    </group>
  );
}

export default function BakeGun() {
  const id = (useSearchParams().get('id') ?? 'ember_halo') as ProceduralGunId;
  return (
    <div style={{ width: 1040, height: 520, background: 'transparent' }}>
      {/* The app's global stylesheet paints a dark body, which the screenshot
          composites UNDER the canvas — that is what made the first bakes opaque
          rectangles instead of cut-out weapons. Force the page fully transparent so
          the alpha in the canvas survives to the PNG. */}
      <style>{'html,body{background:transparent!important}body::before,body::after{display:none!important}'}</style>
      <Canvas
        camera={{ position: [0, 0.14, 1.05], fov: 32 }}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        dpr={2}
        style={{ width: 1040, height: 520, background: 'transparent' }}
      >
        <hemisphereLight args={['#c3d2e2', '#15161c', 0.75]} />
        <directionalLight position={[2.5, 3.5, 2]} intensity={3.0} color="#fff4e6" />
        <directionalLight position={[-2.5, 0.8, -1.5]} intensity={1.5} color="#84b4ff" />
        <directionalLight position={[0, -2, 1]} intensity={0.5} color="#ffffff" />
        <Suspense fallback={null}>
          <Gun id={id} />
          {/* Metal is 0.9 metalness: with nothing to reflect it renders black however
              many lights you add. An environment is what actually makes it read. */}
          <Environment preset="warehouse" background={false} />
        </Suspense>
      </Canvas>
    </div>
  );
}
