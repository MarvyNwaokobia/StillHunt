'use client'

import { useState, useCallback } from 'react'
import { getAudioManager } from '@/lib/audio'

export function useAudio() {
  const mgr = getAudioManager()
  const [muted, setMutedState] = useState(false)

  const toggleMute = useCallback(() => {
    const next = !mgr.muted
    mgr.setMuted(next)
    setMutedState(next)
  }, [mgr])

  return {
    muted,
    toggleMute,
    playHit:          (cls: string, dmg: number) => mgr.playHit(cls, dmg),
    playSpecial:      (cls: string) => mgr.playSpecial(cls),
    playVictory:      () => mgr.playVictory(),
    playDefeat:       () => mgr.playDefeat(),
    playButtonTap:    () => mgr.playButtonTap(),
    playButtonConfirm:() => mgr.playButtonConfirm(),
    startAmbient:     () => mgr.startAmbient(),
    stopAmbient:      () => mgr.stopAmbient(),
  }
}
