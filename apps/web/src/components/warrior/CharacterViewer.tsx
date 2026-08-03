'use client'

import { Suspense, useEffect, useRef, useState, Component, type ReactNode, type CSSProperties } from 'react'
import { Canvas } from '@react-three/fiber'
import { useGLTF, useAnimations, OrbitControls } from '@react-three/drei'
import type * as THREE from 'three'

// ── Error boundary — catches errors thrown inside the R3F Canvas tree ─────────

class GLBErrorBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { errored: boolean }
> {
  state = { errored: false }
  static getDerivedStateFromError() { return { errored: true } }
  componentDidCatch() { this.props.onError() }
  render() { return this.state.errored ? null : this.props.children }
}

// ── 3D model (runs inside Canvas context) ────────────────────────────────────

interface ModelProps {
  glbPath: string
  accentColor: string
  animationName: string
  paused: boolean
  onLoaded: () => void
}

function CharacterModel({ glbPath, accentColor, animationName, paused, onLoaded }: ModelProps) {
  const group = useRef<THREE.Group>(null!)
  const { scene, animations } = useGLTF(glbPath)
  const { actions, mixer } = useAnimations(animations, group)

  // Signal parent that model is mounted and visible
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onLoaded() }, [])

  useEffect(() => {
    Object.values(actions).forEach(a => a?.stop())
    const target = actions[animationName] ?? Object.values(actions)[0]
    if (target) target.reset().fadeIn(0.3).play()
    return () => { Object.values(actions).forEach(a => a?.fadeOut(0.2)) }
  }, [animationName, actions])

  useEffect(() => {
    if (!mixer) return
    mixer.timeScale = paused ? 0 : 1
  }, [paused, mixer])

  return (
    <group ref={group}>
      {/* No explicit scale — the GLB's root Armature already has scale=0.01 baked in */}
      <primitive object={scene} dispose={null} />
      <pointLight position={[1, 2, 3]}  intensity={4.5} color={accentColor} distance={12} />
      <pointLight position={[-1, 3, 2]} intensity={2.5} color="#ffffff"    distance={10} />
    </group>
  )
}

// ── Public component ──────────────────────────────────────────────────────────

export interface CharacterViewerProps {
  glbPath: string
  accentColor: string
  animationName?: string
  paused?: boolean
  /** Remounts the model when this changes (use class+gender string) */
  modelKey: string
  /** @deprecated — do not use in battle scenes; 3D is the only character representation */
  fallback?: ReactNode
  className?: string
  style?: CSSProperties
}

export default function CharacterViewer({
  glbPath,
  accentColor,
  animationName = 'idle',
  paused = false,
  modelKey,
  fallback = null,
  className,
  style,
}: CharacterViewerProps) {
  const [failed, setFailed] = useState(false)
  const [modelLoaded, setModelLoaded] = useState(false)

  // Reset loaded state whenever the character switches
  useEffect(() => { setModelLoaded(false) }, [modelKey])

  return (
    <div className={className ?? 'absolute inset-0'} style={style}>

      {/* Fallback — shown while loading OR when WebGL fails */}
      {(!modelLoaded || failed) && (fallback ?? (
        <div className="absolute inset-0 flex items-end justify-center pb-12 pointer-events-none">
          {/* Subtle silhouette shimmer while GLB loads */}
          <div className="relative w-24 h-40 rounded-2xl overflow-hidden"
            style={{ background: 'rgba(42,42,58,0.18)' }}>
            <div className="absolute inset-0"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 50%, transparent 100%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer-x 1.8s linear infinite',
              }} />
          </div>
        </div>
      ))}

      {/* 3D canvas — removed entirely on WebGL failure */}
      {!failed && (
        <div className="absolute inset-0">
          <GLBErrorBoundary onError={() => setFailed(true)}>
            <Canvas
              camera={{ position: [0, 0.9, 3.2], fov: 46 }}
              dpr={[1, 2]}
              gl={{ antialias: true, alpha: true }}
              style={{ background: 'transparent' }}
              performance={{ min: 0.5 }}
            >
              <ambientLight intensity={0.7} color="#18142e" />
              <directionalLight position={[0, 3, 5]}  intensity={3.0} color="#f5f0ff" />
              <directionalLight position={[1, 4, 3]}  intensity={1.8} color="#ffffff" />
              <directionalLight position={[-2, 2, -3]} intensity={0.6} color="#2a18ff" />

              <Suspense fallback={null}>
                <CharacterModel
                  key={modelKey}
                  glbPath={glbPath}
                  accentColor={accentColor}
                  animationName={animationName}
                  paused={paused}
                  onLoaded={() => setModelLoaded(true)}
                />
              </Suspense>

              <OrbitControls
                enableZoom={false}
                enablePan={false}
                minPolarAngle={Math.PI * 0.38}
                maxPolarAngle={Math.PI * 0.52}
                target={[0, 0.85, 0]}
              />
            </Canvas>
          </GLBErrorBoundary>
        </div>
      )}
    </div>
  )
}

/** Call before navigating to a screen to preload the model silently */
CharacterViewer.preload = (path: string) => useGLTF.preload(path)
