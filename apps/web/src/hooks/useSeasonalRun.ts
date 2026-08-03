import { useCallback, useEffect, useRef, useState } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

export interface SeasonBoardEntry {
  rank: number
  wallet_address: string
  username: string | null
  best: number
  est_payout_g: number
}

export interface Season {
  id: string
  name: string
  starts_at: string
  ends_at: string | null
  active: boolean
  upcoming: boolean
  ended: boolean
  seed: number
  prize_pool_g: number
  payout_status: string
}

/**
 * The Seasonal Campaign's server contract.
 *
 * A season is a scheduled window with ONE shared layout seed, so every player walks
 * the same generated compound and the board compares like with like. Runs are the
 * existing server-validated survival-run protocol: `/gauntlet/start` issues a
 * single-use token and stamps the season, `/gauntlet/submit` closes it with the wave
 * count and rejects anything that came in faster than the waves physically take.
 *
 * Unlike Campaign Endless there is NO resume and no per-wave payout — every run
 * starts at wave 1, and the only money is the end-of-season prize.
 */
export function useSeasonalRun(walletAddress: string | undefined) {
  const [season, setSeason] = useState<Season | null>(null)
  const [board, setBoard] = useState<SeasonBoardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const tokenRef = useRef<string | null>(null)
  const seedRef = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API}/seasons/current`)
      if (res.ok) {
        const data = await res.json()
        setSeason(data.season ?? null)
        setBoard(data.leaderboard ?? [])
      }
    } catch {
      /* offline — the page shows the locked state rather than crashing */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  /** Open a seasonal run. Returns the shared layout seed, or null if the season is
   *  not live (which is also the server's authority on whether play is allowed). */
  const startRun = useCallback(async (): Promise<number | null> => {
    tokenRef.current = null
    seedRef.current = null
    if (!walletAddress) return null
    try {
      const res = await fetch(`${API}/gauntlet/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: walletAddress, seasonal: true }),
      })
      if (!res.ok) return null
      const data = await res.json()
      tokenRef.current = data.run_token ?? null
      seedRef.current = typeof data.seed === 'number' ? data.seed : null
      return seedRef.current
    } catch {
      return null
    }
  }, [walletAddress])

  /** Close the run with the wave reached. The server validates the elapsed time
   *  against the claim before it lands on the board. */
  const submitRun = useCallback(
    async (waves: number, kills: number): Promise<{ ok: boolean; seasonBest: number } | null> => {
      const run_token = tokenRef.current
      if (!run_token || !walletAddress) return null
      tokenRef.current = null // single use — never resubmit the same token
      try {
        const res = await fetch(`${API}/gauntlet/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: walletAddress, run_token, waves, kills }),
        })
        if (!res.ok) return { ok: false, seasonBest: 0 }
        const data = await res.json()
        await refresh() // the board moves the moment a run lands
        return { ok: true, seasonBest: data.season_best ?? 0 }
      } catch {
        return null
      }
    },
    [walletAddress, refresh]
  )

  return { season, board, loading, startRun, submitRun, refresh }
}
