import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'

interface NewAchievement {
  achievement_id: string
  achievement_name: string
  unlocked_at: string
}

/**
 * Returns `checkAchievements(wallet)` — call after any event that could unlock
 * something (battle end, rank-up, mission collect, item purchase).
 * Newly unlocked achievements are returned and the achievements cache is invalidated
 * so AchievementSlots updates immediately.
 */
export function useAchievements() {
  const queryClient = useQueryClient()

  const checkAchievements = useCallback(
    async (walletAddress: string): Promise<NewAchievement[]> => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/players/${walletAddress}/achievements/check`,
          { method: 'POST' },
        )
        if (!res.ok) return []
        const newUnlocks = (await res.json()) as NewAchievement[]
        if (newUnlocks.length > 0) {
          queryClient.invalidateQueries({ queryKey: ['achievements', walletAddress] })
        }
        return newUnlocks
      } catch {
        return []
      }
    },
    [queryClient],
  )

  // Kept for API compat — achievement check now handles all conditions server-side
  const checkDecayRecovery = useCallback(
    async (walletAddress: string) => {
      await checkAchievements(walletAddress)
    },
    [checkAchievements],
  )

  return { checkAchievements, checkDecayRecovery }
}
