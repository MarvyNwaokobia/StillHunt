import { useState } from 'react'
import { Crosshair, Zap, CircleDot, Wrench, Shield, Flashlight } from 'lucide-react'
import { useMarketplaceItems } from '@/hooks/useMarketplace'
import MarketplaceItem from './MarketplaceItem'

import { gunIdFromItemId } from './GunIcons'

interface Props {
  walletAddress: string | undefined
}

const CATEGORIES = ['weapon', 'ammo', 'attachment', 'gear', 'shield', 'booster'] as const
const CATEGORY_META = {
  weapon:     { label: 'Guns',        Icon: Crosshair  },
  ammo:       { label: 'Ammo',        Icon: CircleDot  },
  attachment: { label: 'Attachments', Icon: Wrench     },
  gear:       { label: 'Field Kit',   Icon: Flashlight },
  shield:     { label: 'Shields',     Icon: Shield     },
  booster:    { label: 'Boosters',    Icon: Zap        },
} as const

export default function MarketplaceGrid({ walletAddress }: Props) {
  const { data: rawItems = [], isLoading } = useMarketplaceItems()
  const [filter, setFilter] = useState<string>('all')

  // Hide melee-era relics: 'weapon' rows that don't map to a gun in the
  // shooter's catalogue (swords from before the pivot still live in the DB).
  const items = rawItems.filter((i) => i.category !== 'weapon' || gunIdFromItemId(i.id))

  // Every item — weapons included — uses the same card. Guns previously got
  // full-width hero banners per legendary, which stacked up once there were several;
  // the fix was to stop treating them as special, not to invent a second layout.
  const filteredItems = items.filter((i) => filter === 'all' || i.category === filter)

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-52 bg-hunt-surface rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">


      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        <FilterBtn active={filter === 'all'} onClick={() => setFilter('all')} label="All" />
        {CATEGORIES.map((cat) => {
          const { label, Icon } = CATEGORY_META[cat]
          return (
            <FilterBtn
              key={cat}
              active={filter === cat}
              onClick={() => setFilter(cat)}
              label={label}
              Icon={Icon}
            />
          )
        })}
      </div>

      {/* Item grid */}
      {CATEGORIES.filter((cat) => filter === 'all' || filter === cat).map((cat) => {
        const catItems = filteredItems.filter((i) => i.category === cat)
        if (catItems.length === 0) return null
        const { label, Icon } = CATEGORY_META[cat]
        return (
          <section key={cat}>
            <h2 className="font-display font-bold text-white mb-3 flex items-center gap-2">
              <Icon size={16} strokeWidth={2} />
              {label}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {catItems.map((item) => (
                <MarketplaceItem key={item.id} item={item} walletAddress={walletAddress} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

import type { LucideIcon } from 'lucide-react'

function FilterBtn({
  active,
  onClick,
  label,
  Icon,
}: {
  active: boolean
  onClick: () => void
  label: string
  Icon?: LucideIcon
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${
        active
          ? 'bg-hunt-gold text-black'
          : 'bg-hunt-surface border border-hunt-border text-slate-400 hover:border-slate-500 hover:text-white'
      }`}
    >
      {Icon && <Icon size={13} strokeWidth={2} />}
      {label}
    </button>
  )
}
