import { create } from 'zustand'
import type { Battle, Mission } from '@/types'

interface GameState {
  currentBattle: Battle | null
  activeMission: Mission | null
  pendingXp: number
  setCurrentBattle: (battle: Battle | null) => void
  setActiveMission: (mission: Mission | null) => void
  addPendingXp: (xp: number) => void
  clearPendingXp: () => void
}

export const useGameStore = create<GameState>()((set) => ({
  currentBattle: null,
  activeMission: null,
  pendingXp: 0,

  setCurrentBattle: (currentBattle) => set({ currentBattle }),
  setActiveMission: (activeMission) => set({ activeMission }),
  addPendingXp: (xp) => set((state) => ({ pendingXp: state.pendingXp + xp })),
  clearPendingXp: () => set({ pendingXp: 0 }),
}))
