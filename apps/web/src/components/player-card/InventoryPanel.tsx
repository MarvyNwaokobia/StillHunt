import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import type { InventoryItem, Item } from '@/types'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'
import { ITEM_RARITY_COLORS } from '@/lib/constants'
import { usePlayerStore } from '@/stores/usePlayerStore'
import { useResale } from '@/hooks/useResale'
import { WeaponCrate, crateLabel } from '@/components/marketplace/WeaponCrate'

interface Props {
  inventory: InventoryItem[]
  walletAddress?: string
}

const STAT_LABEL: Record<string, string> = {
  weapon:   'DPS',
  booster:  'XP',
  cosmetic: 'STY',
}

export default function InventoryPanel({ inventory, walletAddress }: Props) {
  const toggleEquip   = usePlayerStore((s) => s.toggleEquip)
  const [toggling, setToggling] = useState<string | null>(null)
  const [flash, setFlash]       = useState<{ id: string; msg: string } | null>(null)
  const { listForResale, pending: resalePending } = useResale(walletAddress)
  const [sellingId, setSellingId] = useState<string | null>(null)
  const [sellPrice, setSellPrice] = useState('')

  const itemIds = inventory.map((i) => i.item_id)

  const { data: items = [] } = useQuery({
    queryKey: ['items', itemIds],
    queryFn: async () => {
      if (itemIds.length === 0) return []
      const res = await fetch(`${API}/items`)
      if (!res.ok) return []
      const all: Item[] = await res.json()
      return all.filter(i => itemIds.includes(i.id))
    },
    enabled: itemIds.length > 0,
  })

  const itemMap = new Map(items.map((i) => [i.id, i]))

  async function handleToggle(inv: InventoryItem) {
    if (!walletAddress || toggling) return
    const next = !inv.equipped
    setToggling(inv.item_id)
    toggleEquip(inv.item_id)   // optimistic

    try {
      const res = await fetch(`${API}/players/${walletAddress}/inventory/${inv.item_id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ equipped: next }),
      })
      if (!res.ok) {
        toggleEquip(inv.item_id)  // rollback
      } else {
        const item = itemMap.get(inv.item_id)
        const stat = item ? `+${item.stat_boost} ${STAT_LABEL[item.category] ?? ''}` : ''
        setFlash({ id: inv.item_id, msg: next ? `Equipped ${stat}` : 'Unequipped' })
        setTimeout(() => setFlash(null), 2000)
      }
    } catch {
      toggleEquip(inv.item_id)  // rollback on network error
    } finally {
      setToggling(null)
    }
  }

  async function handleList(item: Item) {
    const priceG = parseFloat(sellPrice)
    if (!(priceG > 0)) {
      setFlash({ id: item.id, msg: 'Enter a price' })
      setTimeout(() => setFlash(null), 1500)
      return
    }
    try {
      await listForResale(item, priceG)
      setFlash({ id: item.id, msg: 'Listed for sale' })
      setSellingId(null)
      setSellPrice('')
    } catch (e) {
      setFlash({ id: item.id, msg: (e as Error).message.slice(0, 36) })
    }
    setTimeout(() => setFlash(null), 2500)
  }

  if (inventory.length === 0) {
    return (
      <div className="bg-hunt-surface border border-hunt-border rounded-xl p-6 text-center">
        <p className="text-slate-500 text-sm">No items yet. Visit the marketplace.</p>
      </div>
    )
  }

  const equippedCount = inventory.filter(i => i.equipped).length

  return (
    <div className="bg-hunt-surface border border-hunt-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-bold text-white">Inventory</h3>
        <span className="text-[9px] uppercase tracking-widest text-slate-600 font-bold">
          {equippedCount} equipped
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {inventory.map((inv) => {
          const item    = itemMap.get(inv.item_id)
          if (!item) return null
          const color   = ITEM_RARITY_COLORS[item.rarity]
          const statLbl = STAT_LABEL[item.category] ?? ''
          const isFlash = flash?.id === inv.item_id

          return (
            <div
              key={inv.item_id}
              onClick={() => sellingId !== inv.item_id && handleToggle(inv)}
              className={`relative flex flex-col gap-2 p-3 rounded-lg border text-left transition-all cursor-pointer ${
                toggling === inv.item_id ? 'opacity-60' : ''
              } ${
                inv.equipped
                  ? 'border-hunt-gold bg-hunt-gold/10 hover:bg-hunt-gold/15'
                  : 'border-hunt-border bg-hunt-surface-2 hover:border-slate-500'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold" style={{ color }}>
                  {item.rarity.toUpperCase()}
                </span>
                {inv.equipped && (
                  <span className="text-[9px] bg-hunt-gold text-black px-1.5 py-0.5 rounded font-black">
                    EQ
                  </span>
                )}
              </div>
              {/* Same weapon-crate framing as the shop, so owned gear looks
                  exactly like what you bought. */}
              <WeaponCrate item={item} rarityColor={color} label={crateLabel(item)} />
              <p className="text-sm font-bold text-white leading-tight">{item.name}</p>
              <p className="text-xs text-slate-500">
                +{item.stat_boost} <span className="font-bold" style={{ color }}>{statLbl}</span>
              </p>

              {/* Resale — list this item on the marketplace (on-chain items only). */}
              {item.on_chain_id != null && (
                sellingId === inv.item_id ? (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="number" min="0" value={sellPrice}
                      onChange={(e) => setSellPrice(e.target.value)}
                      placeholder="Price G$"
                      className="w-full min-w-0 bg-black/40 border border-hunt-border rounded px-1.5 py-0.5 text-xs text-white"
                    />
                    <button onClick={() => handleList(item)} disabled={resalePending}
                      className="shrink-0 text-[10px] font-black px-1.5 py-1 rounded bg-hunt-gold text-black disabled:opacity-50">
                      {resalePending ? '…' : 'List'}
                    </button>
                    <button onClick={() => { setSellingId(null); setSellPrice('') }}
                      className="shrink-0 text-xs text-slate-400 px-1">×</button>
                  </div>
                ) : (
                  <button onClick={(e) => { e.stopPropagation(); setSellingId(inv.item_id); setSellPrice('') }}
                    className="self-start text-[10px] font-bold text-slate-400 hover:text-amber-400 transition-colors">
                    Sell ▸
                  </button>
                )
              )}

              <AnimatePresence>
                {isFlash && (
                  <motion.div
                    className="absolute inset-0 flex items-center justify-center rounded-lg text-xs font-black pointer-events-none px-2 text-center"
                    style={{ background: 'rgba(4,3,12,0.85)', color: inv.equipped ? '#eab308' : '#94a3b8' }}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    {flash?.msg}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>
    </div>
  )
}
