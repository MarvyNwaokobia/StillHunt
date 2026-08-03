'use client'

import { useState, useCallback, useRef } from 'react'

export type ShakeLevel = 0 | 1 | 2 | 3

interface SparkInfo { color: string; level: ShakeLevel }

interface CombatState {
  shakeKey:    number
  shakeLevel:  ShakeLevel
  playerFlash: string | null
  botFlash:    string | null
  playerBurst: string | null
  botBurst:    string | null
  playerSpark: SparkInfo | null
  botSpark:    SparkInfo | null
  specialCam:  number
  hitStopMs:   number
}

const INIT: CombatState = {
  shakeKey:    0,
  shakeLevel:  0,
  playerFlash: null,
  botFlash:    null,
  playerBurst: null,
  botBurst:    null,
  playerSpark: null,
  botSpark:    null,
  specialCam:  0,
  hitStopMs:   0,
}

export function useCombatFeel() {
  const [fx, setFx] = useState<CombatState>(INIT)

  const reducedMotion = useRef(
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  )

  const triggerHit = useCallback((
    hitSide:       'player' | 'bot',
    damage:        number,
    attackerColor: string,
    isSpecial =    false,
  ) => {
    if (reducedMotion.current) return

    const level: ShakeLevel = damage >= 16 ? 3 : damage >= 9 ? 2 : 1
    const stopMs = level === 3 ? 130 : level === 2 ? 80 : 45
    const spark: SparkInfo = { color: attackerColor, level }

    setFx(s => ({
      ...s,
      shakeKey:    s.shakeKey + 1,
      shakeLevel:  level,
      hitStopMs:   stopMs,
      playerFlash: hitSide === 'player' ? attackerColor : null,
      botFlash:    hitSide === 'bot'    ? attackerColor : null,
      playerBurst: hitSide === 'player' ? attackerColor : null,
      botBurst:    hitSide === 'bot'    ? attackerColor : null,
      playerSpark: hitSide === 'player' ? spark : null,
      botSpark:    hitSide === 'bot'    ? spark : null,
      specialCam:  isSpecial ? s.specialCam + 1 : s.specialCam,
    }))

    // Hit stop clears fastest
    setTimeout(() => setFx(s => ({ ...s, hitStopMs: 0 })), stopMs)
    // Flash + spark clear at 260ms
    setTimeout(() => setFx(s => ({
      ...s, playerFlash: null, botFlash: null, playerSpark: null, botSpark: null, shakeLevel: 0,
    })), 260)
    // Burst particles stay for 500ms
    setTimeout(() => setFx(s => ({ ...s, playerBurst: null, botBurst: null })), 500)
  }, [])

  const reset = useCallback(() => setFx(INIT), [])

  return { ...fx, triggerHit, reset }
}
