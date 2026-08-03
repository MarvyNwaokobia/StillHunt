'use client';

/**
 * TEMP asset-baking page (not shipped): renders one gun/item mesh on a
 * transparent canvas so a Playwright script can screenshot it into
 * public/items/*.png. Select the asset with ?asset=<name>.
 */

import { Suspense, useLayoutEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { makeGunMesh } from '@/engine/scene/GunMesh';
import { makeItemMesh, type ItemMeshId, ITEM_MESH_IDS } from '@/engine/scene/ItemMesh';
import type { GunId } from '@/engine/combat/GunStats';

const GUN_IDS: GunId[] = ['sidearm', 'smg', 'assault_rifle', 'marksman', 'legendary'];

/**
 * Guns that have a REAL modeled GLB instead of the procedural box mesh. These
 * bake from the same assets the fight uses, so the shop shows the real weapon.
 * (Only two base models exist today; the rest still fall back to makeGunMesh.)
 */
const GUN_GLB: Partial<Record<GunId, string>> = {
  sidearm: '/models/guns/sidearm.glb',
  smg: '/models/guns/smg.glb',
  assault_rifle: '/models/guns/rifle.glb',
  marksman: '/models/guns/marksman.glb',
  legendary: '/models/guns/blaster.glb',
};

/** Centre a posed holder on its bbox and return the hero-shot camera distance. */
function frameHolder(holder: THREE.Group, obj: THREE.Object3D): number {
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder);
  obj.position.sub(box.getCenter(new THREE.Vector3()));
  holder.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(holder).getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  return (maxDim / 2) / Math.tan((30 * Math.PI) / 360) * 1.18;
}

function useHeroCamera(dist: number) {
  const { camera } = useThree();
  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.fov = 30;
    cam.position.set(dist * 0.18, dist * 0.22, dist);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
  }, [camera, dist]);
}

function buildAsset(name: string): { obj: THREE.Group; isGun: boolean } {
  if (name.startsWith('gun_')) {
    return { obj: makeGunMesh(name.slice(4) as GunId), isGun: true };
  }
  if ((ITEM_MESH_IDS as string[]).includes(name)) {
    return { obj: makeItemMesh(name as ItemMeshId), isGun: false };
  }
  return { obj: makeGunMesh('sidearm'), isGun: true };
}

/** Procedural mesh / item subject. */
function MeshSubject({ name }: { name: string }) {
  const staged = useMemo(() => {
    const { obj, isGun } = buildAsset(name);
    // Hero pose: guns show a 3/4 side profile with the muzzle to the right;
    // items get a gentle 3/4 turn.
    obj.rotation.set(isGun ? 0.08 : 0.04, isGun ? Math.PI / 2 - 0.42 : -0.45, 0);
    const holder = new THREE.Group();
    holder.add(obj);
    return { holder, dist: frameHolder(holder, obj) };
  }, [name]);
  useHeroCamera(staged.dist);
  return <primitive object={staged.holder} />;
}

/** Real GLB weapon subject: normalise the model (longest axis = barrel → +Z,
 *  unit length, centred), then pose it exactly like a mesh gun. */
function GlbSubject({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const staged = useMemo(() => {
    const obj = scene.clone(true);
    obj.rotation.set(0, 0, 0); obj.position.set(0, 0, 0); obj.scale.set(1, 1, 1);
    // Longest axis → +Z (the barrel), so the hero pose lands the same as the meshes.
    const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
    if (size.x >= size.y && size.x >= size.z) obj.rotateY(-Math.PI / 2);
    else if (size.y >= size.x && size.y >= size.z) obj.rotateX(Math.PI / 2);
    obj.rotateY(Math.PI); // face muzzle the hero direction
    obj.updateMatrixWorld(true);
    obj.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = true; });

    const posed = new THREE.Group();
    posed.add(obj);
    posed.rotation.set(0.08, Math.PI / 2 - 0.42, 0); // same 3/4 hero angle as mesh guns
    const holder = new THREE.Group();
    holder.add(posed);
    return { holder, dist: frameHolder(holder, posed) };
  }, [scene]);
  useHeroCamera(staged.dist);
  return <primitive object={staged.holder} />;
}

function Subject({ name }: { name: string }) {
  const glb = name.startsWith('gun_') ? GUN_GLB[name.slice(4) as GunId] : undefined;
  return glb ? <GlbSubject url={glb} /> : <MeshSubject name={name} />;
}

export default function BakeItemsPage() {
  return (
    <Suspense>
      <BakeInner />
    </Suspense>
  );
}

function BakeInner() {
  const params = useSearchParams();
  const asset = params.get('asset') ?? 'gun_sidearm';
  const all = [...GUN_IDS.map((g) => `gun_${g}`), ...ITEM_MESH_IDS];

  return (
    <div style={{ width: 640, height: 640, background: 'transparent' }}>
      {/* The app theme paints the body dark; the bake needs true transparency. */}
      <style>{'html, body { background: transparent !important; }'}</style>
      <Canvas
        id="bake-canvas"
        gl={{ alpha: true, antialias: true }}
        camera={{ fov: 30, position: [0, 0.2, 1.2] }}
        onCreated={({ gl, scene, camera }) => {
          gl.setClearColor(0x000000, 0);
          // Lower exposure so the HDRI's specular highlights survive instead of
          // blowing out to flat white — that's what sells the metal.
          gl.toneMappingExposure = 1.05;
          scene.background = null;
          camera.lookAt(0, 0, 0);
        }}
        style={{ width: 640, height: 640 }}
      >
        {/* HDRI reflections make the metal read as metal — the single biggest
            "real, not toy" lever. background stays off for the transparent bake. */}
        <Suspense fallback={null}>
          <Environment files="/hdri/venice_sunset_1k.hdr" background={false} environmentIntensity={0.7} />
        </Suspense>
        {/* Cinematic 3-point: a hard warm key top-right for the hero highlight, a
            hard cool rim from behind-left to carve the silhouette out of the dark
            case, and only a whisper of fill. Drama, not even product lighting —
            this is what reads "weapon", not "toy on a shelf". */}
        <ambientLight intensity={0.06} color={'#c2cbda'} />
        <directionalLight position={[3, 3.5, 3]} intensity={2.6} color={'#ffe9cf'} />
        <directionalLight position={[-3.5, 2, -3]} intensity={2.0} color={'#8fb4ff'} />
        <directionalLight position={[0, -2.5, 1.5]} intensity={0.35} color={'#ffffff'} />
        <Suspense fallback={null}>
          <Subject name={asset} />
        </Suspense>
      </Canvas>
      {/* index for the bake script */}
      <div id="asset-list" style={{ display: 'none' }}>{all.join(',')}</div>
    </div>
  );
}
