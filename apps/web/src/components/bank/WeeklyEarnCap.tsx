'use client'

import { useQuery } from '@tanstack/react-query'

const API = process.env.NEXT_PUBLIC_API_URL ?? ''

interface EarnCapStatus {
  earned_this_week_g: number
  cap_g: number
  remaining_g: number
  over_cap: boolean
  over_cap_rate: number
  resets_at: string
}

/**
 * This week's earning allowance.
 *
 * The point of rendering this at all is that past the cap rewards TAPER rather
 * than stop, and a reward that quietly shrinks with no explanation looks exactly
 * like a payout bug. Showing the number turns a support message into a player
 * who knows where they stand.
 *
 * Hidden entirely when capping is off (cap_g = 0) or the player has earned
 * nothing yet — an empty bar on a fresh account is noise, not information.
 */
export default function WeeklyEarnCap({ walletAddress }: { walletAddress?: string }) {
  const { data } = useQuery<EarnCapStatus>({
    queryKey: ['earn-cap', walletAddress],
    queryFn: async () => {
      const res = await fetch(`${API}/players/${walletAddress!.toLowerCase()}/earn-cap`)
      if (!res.ok) throw new Error('failed')
      return res.json()
    },
    enabled: Boolean(walletAddress),
    staleTime: 60_000,
  })

  if (!data || data.cap_g === 0 || data.earned_this_week_g === 0) return null

  const pct = Math.min(100, Math.round((data.earned_this_week_g / data.cap_g) * 100))
  const resets = new Date(data.resets_at)
  const daysLeft = Math.max(0, Math.ceil((resets.getTime() - Date.now()) / 86_400_000))

  return (
    <div
      className="flex flex-col gap-2 p-4 rounded-xl"
      style={{ background: 'rgba(234,179,8,0.05)', border: '1px solid rgba(234,179,8,0.15)' }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[10px] uppercase tracking-widest font-bold text-amber-500/60">
          Earned this week
        </p>
        <p className="text-xs font-bold text-slate-300 tabular-nums">
          {data.earned_this_week_g.toLocaleString()}
          <span className="text-slate-600"> / {data.cap_g.toLocaleString()} G$</span>
        </p>
      </div>

      <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.4)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: data.over_cap
              ? 'linear-gradient(90deg,#b45309,#78350f)'
              : 'linear-gradient(90deg,#fde047,#eab308)',
          }}
        />
      </div>

      <p className="text-[11px] leading-relaxed text-slate-500">
        {data.over_cap ? (
          <>
            You&apos;ve reached this week&apos;s cap. Rewards still pay at{' '}
            <span className="text-amber-400 font-bold">{Math.round(data.over_cap_rate * 100)}%</span>{' '}
            until it resets{daysLeft > 0 ? ` in ${daysLeft} day${daysLeft === 1 ? '' : 's'}` : ' tomorrow'}.
          </>
        ) : (
          <>
            {data.remaining_g.toLocaleString()} G$ left at full rate. Resets
            {daysLeft > 0 ? ` in ${daysLeft} day${daysLeft === 1 ? '' : 's'}` : ' tomorrow'}. Prizes
            don&apos;t count towards it.
          </>
        )}
      </p>
    </div>
  )
}
