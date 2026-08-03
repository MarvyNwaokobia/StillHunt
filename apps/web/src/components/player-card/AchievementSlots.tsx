import { useQuery } from '@tanstack/react-query'

interface Props {
  walletAddress: string
}

interface AchievementRow {
  achievement_id: string
  name: string
  description: string
  image_url: string
  unlocked_at: string
}

async function fetchAchievements(wallet: string): Promise<AchievementRow[]> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/players/${wallet}/achievements`,
  )
  if (!res.ok) return []
  return res.json()
}

export default function AchievementSlots({ walletAddress }: Props) {
  const { data: unlocked = [] } = useQuery({
    queryKey: ['achievements', walletAddress],
    queryFn: () => fetchAchievements(walletAddress),
    staleTime: 60_000,
  })

  const slots = Array.from({ length: 6 })

  return (
    <div>
      <p className="text-xs text-slate-500 mb-2 uppercase tracking-wider font-bold">
        Achievements
      </p>
      <div className="grid grid-cols-6 gap-1.5">
        {slots.map((_, i) => {
          const achievement = unlocked[i] as AchievementRow | undefined

          return (
            <div
              key={i}
              className={`aspect-square rounded-lg flex items-center justify-center text-sm border ${
                achievement
                  ? 'bg-hunt-gold/10 border-hunt-gold/40'
                  : 'bg-hunt-surface-2 border-hunt-border/50'
              }`}
              title={achievement?.name ?? 'Locked'}
            >
              {achievement?.image_url ? (
                <img
                  src={achievement.image_url}
                  alt={achievement.name}
                  className="w-4 h-4 object-contain"
                />
              ) : achievement ? (
                '★'
              ) : (
                <span className="text-slate-700 text-xs">·</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
