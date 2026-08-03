import { useCallback } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

export interface GauntletBoardRow { wallet_address: string; username: string | null; best: number }
export type StartResult = { token: string } | { locked: true; needLevel: number; haveLevel: number }

export interface SeasonEntry { rank: number; wallet_address: string; username: string | null; best: number; est_payout_g: number }
export interface SeasonInfo {
  season: { id: string; name: string; active: boolean; ends_at: string | null; prize_pool_g: number; payout_status: string } | null
  leaderboard: SeasonEntry[]
}

/**
 * Prestige Gauntlet run lifecycle (B2). `start()` gets a single-use run token from
 * the server (which records the real start time — the anti-cheat anchor); `submit()`
 * closes it with the reported waves/kills, which the server validates against the
 * elapsed time before recording onto the seasonal ladder.
 */
export function useGauntlet(walletAddress: string | undefined) {
  const start = useCallback(async (): Promise<StartResult> => {
    if (!walletAddress) throw new Error('Not signed in')
    const res = await fetch(`${API}/gauntlet/start`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: walletAddress }),
    })
    const body = await res.json().catch(() => ({}))
    if (res.status === 403 && body?.locked) return { locked: true, needLevel: body.need_level ?? 15, haveLevel: body.have_level ?? 0 }
    if (!res.ok) throw new Error((body?.error as string) ?? 'Could not start run')
    return { token: body.run_token as string }
  }, [walletAddress])

  const submit = useCallback(async (token: string, waves: number, kills: number): Promise<{ waves: number; seasonBest: number; week: string }> => {
    if (!walletAddress) throw new Error('Not signed in')
    const res = await fetch(`${API}/gauntlet/submit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: walletAddress, run_token: token, waves, kills }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((body?.error as string) ?? 'Submit failed')
    return { waves: body.waves ?? waves, seasonBest: body.season_best ?? 0, week: body.week ?? '' }
  }, [walletAddress])

  const leaderboard = useCallback(async (scope: 'weekly' | 'all' = 'weekly'): Promise<GauntletBoardRow[]> => {
    const res = await fetch(`${API}/gauntlet/leaderboard?scope=${scope}&limit=10`)
    const body = await res.json().catch(() => ({ entries: [] }))
    return (body.entries ?? []) as GauntletBoardRow[]
  }, [])

  const season = useCallback(async (): Promise<SeasonInfo> => {
    const res = await fetch(`${API}/seasons/current`)
    const body = await res.json().catch(() => ({ season: null, leaderboard: [] }))
    return { season: body.season ?? null, leaderboard: body.leaderboard ?? [] }
  }, [])

  return { start, submit, leaderboard, season }
}
