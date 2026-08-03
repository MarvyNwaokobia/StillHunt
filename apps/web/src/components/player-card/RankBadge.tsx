import type { Rank } from '@/types'
import { RANK_DEFINITIONS } from '@/lib/ranks'

export default function RankBadge({ rank }: { rank: Rank }) {
  const def = RANK_DEFINITIONS[rank]
  return (
    <span
      className="text-[10px] font-black px-2 py-0.5 rounded-sm uppercase tracking-[0.14em]"
      style={{
        color:     def.badgeText,
        background: def.badgeBg,
        border:    `1px solid ${def.color}44`,
        filter:    def.tier >= 3 ? `drop-shadow(0 0 4px ${def.color}88)` : undefined,
      }}
    >
      {def.label}
    </span>
  )
}
