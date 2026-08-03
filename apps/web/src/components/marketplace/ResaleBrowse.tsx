'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Tag } from 'lucide-react'
import { formatUnits } from 'viem'
import { useResale, type ResaleListing } from '@/hooks/useResale'
import type { Item } from '@/types'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

/** Player-to-player resale listings — buy another player's gun, or cancel your own. */
export default function ResaleBrowse({ walletAddress }: { walletAddress?: string }) {
  const { fetchListings, buyResale, cancelResale, pending } = useResale(walletAddress)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr]   = useState<string | null>(null)

  const { data: listings = [], refetch } = useQuery({
    queryKey: ['resale-listings'],
    queryFn: fetchListings,
    staleTime: 20_000,
  })

  const { data: items = [] } = useQuery({
    queryKey: ['items-all'],
    queryFn: async (): Promise<Item[]> => {
      const res = await fetch(`${API}/items`)
      return res.ok ? await res.json() : []
    },
    staleTime: 60_000,
  })
  const byChainId = new Map(
    items.filter((i) => i.on_chain_id != null).map((i) => [i.on_chain_id as number, i]),
  )

  if (listings.length === 0) return null

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id); setErr(null)
    try { await fn(); refetch() }
    catch (e) { setErr((e as Error).message.slice(0, 70)) }
    finally { setBusy(null) }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Tag size={16} className="text-amber-400" />
        <h2 className="font-display font-black text-white text-lg">Player Listings</h2>
        <span className="text-xs text-slate-500">{listings.length} for sale</span>
      </div>
      {err && <p className="text-red-400 text-xs mb-2">{err}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {listings.map((l: ResaleListing) => {
          const item = byChainId.get(Number(l.itemId))
          const mine = walletAddress && l.seller.toLowerCase() === walletAddress.toLowerCase()
          const id = l.resaleId.toString()
          const isBusy = busy === id || pending
          return (
            <div key={id} className="flex flex-col gap-2 p-3 rounded-lg border border-hunt-border bg-hunt-surface-2">
              <p className="text-sm font-bold text-white truncate">{item?.name ?? `Item #${l.itemId}`}</p>
              <p className="text-xs text-amber-400 font-black">{formatUnits(l.price, 18)} G$</p>
              <p className="text-[10px] text-slate-500 truncate">
                {mine ? 'Your listing' : `${l.seller.slice(0, 6)}…${l.seller.slice(-4)}`}
              </p>
              {mine ? (
                <button onClick={() => run(id, () => cancelResale(l.resaleId))} disabled={isBusy}
                  className="text-[11px] font-black px-2 py-1 rounded bg-white/10 text-white disabled:opacity-50">
                  {busy === id ? '…' : 'Cancel'}
                </button>
              ) : (
                <button onClick={() => run(id, () => buyResale(l.resaleId, l.price))} disabled={isBusy || !walletAddress}
                  className="text-[11px] font-black px-2 py-1 rounded bg-hunt-gold text-black disabled:opacity-50">
                  {busy === id ? '…' : 'Buy'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
