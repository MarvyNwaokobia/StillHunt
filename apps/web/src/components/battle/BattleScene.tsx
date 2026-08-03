'use client'

import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { useGLTF, useAnimations } from '@react-three/drei'
import { SkeletonUtils } from 'three-stdlib'
import * as THREE from 'three'
import { CHARACTER_GLB } from '@/lib/classes'
import type { CharacterClass } from '@/lib/classes'

// ── Camera: offset 60% behind the player's side for ownership/immersion ───────

function CameraSetup() {
  const { camera } = useThree()
  useEffect(() => {
    // Aim at chest/head level so characters fill the frame rather than leaving dead space above
    camera.lookAt(-0.1, 1.05, 0)
  }, [camera])
  return null
}

// ── Arena environment ─────────────────────────────────────────────────────────

function Arena({ playerColor, botColor }: { playerColor: string; botColor: string }) {
  const pColor = useMemo(() => new THREE.Color(playerColor), [playerColor])
  const bColor = useMemo(() => new THREE.Color(botColor),    [botColor])

  return (
    <group>
      {/* Main floor — dark stone */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.005, 0]}>
        <planeGeometry args={[20, 12]} />
        <meshStandardMaterial color="#060410" roughness={0.88} metalness={0.12} />
      </mesh>

      {/* Ground glow — player side */}
      <mesh rotation-x={-Math.PI / 2} position={[-0.7, 0.001, 0]}>
        <planeGeometry args={[2.2, 1.4]} />
        <meshBasicMaterial color={pColor} transparent opacity={0.08} depthWrite={false} />
      </mesh>

      {/* Ground glow — bot side */}
      <mesh rotation-x={-Math.PI / 2} position={[0.7, 0.001, 0]}>
        <planeGeometry args={[2.2, 1.4]} />
        <meshBasicMaterial color={bColor} transparent opacity={0.08} depthWrite={false} />
      </mesh>

      {/* Center divider line */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.002, 0]}>
        <planeGeometry args={[0.006, 2.8]} />
        <meshBasicMaterial color="#eab308" transparent opacity={0.22} depthWrite={false} />
      </mesh>

      {/* Outer edge trim — player side */}
      <mesh rotation-x={-Math.PI / 2} position={[-1.8, 0.003, 0]}>
        <planeGeometry args={[0.008, 3]} />
        <meshBasicMaterial color={pColor} transparent opacity={0.4} depthWrite={false} />
      </mesh>

      {/* Outer edge trim — bot side */}
      <mesh rotation-x={-Math.PI / 2} position={[1.8, 0.003, 0]}>
        <planeGeometry args={[0.008, 3]} />
        <meshBasicMaterial color={bColor} transparent opacity={0.4} depthWrite={false} />
      </mesh>

      {/* Back wall — creates a dark background behind characters */}
      <mesh position={[0, 2.5, -5]}>
        <planeGeometry args={[30, 10]} />
        <meshStandardMaterial color="#030108" roughness={1} metalness={0} />
      </mesh>

      {/* Deep background — extra depth layer */}
      <mesh position={[0, 3, -10]}>
        <planeGeometry args={[50, 16]} />
        <meshStandardMaterial color="#020106" roughness={1} metalness={0} />
      </mesh>

      {/* Pillars — left and right background */}
      {([-3.8, 3.8] as const).map((x, i) => (
        <group key={i} position={[x, 1.8, -3.8]}>
          <mesh>
            <boxGeometry args={[0.24, 4.5, 0.24]} />
            <meshStandardMaterial color="#0d0b1e" roughness={0.9} metalness={0.1} />
          </mesh>
          <mesh position={[0, 2.3, 0]}>
            <boxGeometry args={[0.38, 0.14, 0.38]} />
            <meshStandardMaterial color="#161228" roughness={0.85} metalness={0.15} />
          </mesh>
          <mesh position={[0, -2.3, 0]}>
            <boxGeometry args={[0.38, 0.14, 0.38]} />
            <meshStandardMaterial color="#161228" roughness={0.85} metalness={0.15} />
          </mesh>
        </group>
      ))}

      {/* Mid pillars — closer, subtle */}
      {([-2.2, 2.2] as const).map((x, i) => (
        <group key={i} position={[x, 1.5, -2.2]}>
          <mesh>
            <boxGeometry args={[0.16, 3.5, 0.16]} />
            <meshStandardMaterial color="#0a0818" roughness={0.9} metalness={0.1} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// ── Single fighter in the shared scene ───────────────────────────────────────

interface FightCharacterProps {
  glbPath: string
  accentColor: string
  animationName: string
  paused: boolean
  positionX: number
  rotationY: number
  /** +1 for player (lunges toward opponent on right), -1 for bot */
  lungeDir: number
}

function FightCharacter({
  glbPath, accentColor, animationName, paused, positionX, rotationY, lungeDir,
}: FightCharacterProps) {
  const group = useRef<THREE.Group>(null!)
  const xRef  = useRef(positionX)
  const { scene: rawScene, animations } = useGLTF(glbPath)

  // Clone so player and bot each own their skeleton — needed when same GLB is used twice
  const scene = useMemo(() => SkeletonUtils.clone(rawScene), [rawScene])
  const { actions, mixer } = useAnimations(animations, group)

  useEffect(() => {
    Object.values(actions).forEach(a => a?.stop())
    const target = actions[animationName] ?? Object.values(actions)[0]
    if (target) target.reset().fadeIn(0.15).play()
    return () => { Object.values(actions).forEach(a => a?.fadeOut(0.15)) }
  }, [animationName, actions])

  useEffect(() => {
    if (!mixer) return
    mixer.timeScale = paused ? 0 : 1
  }, [paused, mixer])

  // Smooth lunge — character moves toward opponent while attacking
  useFrame((_, delta) => {
    if (!group.current) return
    const targetX = animationName === 'attack' ? positionX + lungeDir * 0.2 : positionX
    const factor  = Math.min(1, delta * 11)
    xRef.current += (targetX - xRef.current) * factor
    group.current.position.x = xRef.current
  })

  return (
    <group ref={group} position={[positionX, 0, 0]} rotation={[0, rotationY, 0]}>
      {/* No explicit scale — the GLB's root Armature already has scale=0.01 baked in */}
      <primitive object={scene} dispose={null} />
      {/* Front-facing accent glow — in local space, faces the opponent */}
      <pointLight position={[0, 1.5, 1.0]} intensity={6}   color={accentColor} distance={9}  decay={2} />
      {/* Soft fill from above */}
      <pointLight position={[0, 2.5, 0]}   intensity={2.5} color="#ffffff"     distance={6}  decay={2} />
    </group>
  )
}

// ── Public component ──────────────────────────────────────────────────────────

export interface BattleSceneProps {
  playerClass: CharacterClass
  playerAnim: string
  playerPaused: boolean
  playerAccentColor: string
  botClass: CharacterClass
  botAnim: string
  botPaused: boolean
  botAccentColor: string
}

export default function BattleScene({
  playerClass, playerAnim, playerPaused, playerAccentColor,
  botClass, botAnim, botPaused, botAccentColor,
}: BattleSceneProps) {
  return (
    <Canvas
      // Pulled closer + lower so characters fill the full-screen canvas
      camera={{ position: [-0.25, 0.9, 2.1], fov: 55 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: false }}
      style={{ background: '#04030c', width: '100%', height: '100%' }}
      performance={{ min: 0.5 }}
    >
      <CameraSetup />

      {/* Atmospheric depth fog */}
      <fog attach="fog" args={['#04030c', 8, 20]} />

      {/* ── Lighting ── */}
      {/* Ambient — slightly brighter so nothing goes fully black */}
      <ambientLight intensity={0.5} color="#0d0820" />
      {/* Key light — strong front-fill from camera side, illuminates both fighters' fronts */}
      <directionalLight position={[0, 2.5, 5]}  intensity={3.2} color="#f5f0ff" />
      {/* Secondary key — warm overhead from slightly right */}
      <directionalLight position={[1, 5, 3]}    intensity={2.0} color="#ffffff" />
      {/* Warm fill — softens shadows on the opposite side */}
      <directionalLight position={[-4, 2, 1]}   intensity={0.7} color="#ffe4c0" />
      {/* Blue back rim — cinematic depth separation from background (toned down so fronts win) */}
      <directionalLight position={[0, 3, -5]}   intensity={1.4} color="#2a18ff" />
      {/* Floor bounce — subtle uplight keeps feet visible */}
      <pointLight position={[0, 0.05, 0.5]} intensity={0.9} color="#18083a" distance={5} decay={2} />

      <Arena playerColor={playerAccentColor} botColor={botAccentColor} />

      <Suspense fallback={null}>
        <FightCharacter
          key={`player-${playerClass}`}
          glbPath={CHARACTER_GLB[playerClass]}
          accentColor={playerAccentColor}
          animationName={playerAnim}
          paused={playerPaused}
          positionX={-0.7}
          rotationY={Math.PI / 2}
          lungeDir={1}
        />
        <FightCharacter
          key={`bot-${botClass}`}
          glbPath={CHARACTER_GLB[botClass]}
          accentColor={botAccentColor}
          animationName={botAnim}
          paused={botPaused}
          positionX={0.7}
          rotationY={-Math.PI / 2}
          lungeDir={-1}
        />
      </Suspense>
    </Canvas>
  )
}
