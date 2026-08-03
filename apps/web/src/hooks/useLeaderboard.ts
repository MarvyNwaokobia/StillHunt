import { useQuery } from '@tanstack/react-query'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

export type LeaderScope = 'all' | 'weekly'

export interface LeaderEntry {
  wallet_address: string
  username: string | null
  best: number
}

/** Top Endless scores — all-time or the current weekly (seasonal) board. */
export function useLeaderboard(scope: LeaderScope) {
  return useQuery({
    queryKey: ['endless-leaderboard', scope],
    queryFn: async (): Promise<LeaderEntry[]> => {
      const res = await fetch(`${API}/endless/leaderboard?scope=${scope}&limit=25`)
      if (!res.ok) return []
      const data = await res.json()
      return (data.entries ?? []) as LeaderEntry[]
    },
    staleTime: 30_000,
  })
}

/** Record a finished Endless run (waves survived). Fire-and-forget. */
export async function submitEndlessScore(wallet: string, score: number): Promise<void> {
  try {
    await fetch(`${API}/endless/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet, score }),
    })
  } catch {
    /* leaderboard is best-effort; a failed submit shouldn't break the run UI */
  }
}
