'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import type { Item } from '@/types'
import { formatCountdown, formatGDollarNumber } from '@/utils/format'
import { usePurchaseItem } from '@/hooks/useMarketplace'
import { usePlayerStore } from '@/stores/usePlayerStore'
import { gunIdFromItemId } from './GunIcons'
import { ItemArt } from './ItemArt'
import { gunDps, GUN_CATALOG } from '@/engine/combat/GunStats'

/**
 * A limited item's sale window comes from the ITEM, not the browser.
 *
 * This used to be a localStorage value seeded to "seven days from whenever this
 * browser first opened the page" — so the countdown was different for every visitor,
 * ran down on its own, and then declared the sale over for that person while it was
 * still live for everyone else. An item with no `sale_ends_at` simply has no deadline.
 */
function saleEndOf(item: Item): number | null {
  const raw = (item as Item & { sale_ends_at?: string | null }).sale_ends_at
  if (!raw) return null
  const t = new Date(raw).getTime()
  return Number.isFinite(t) ? t : null
}

function isUserRejection(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return msg.includes('rejected') || msg.includes('denied') || msg.includes('user cancel') || msg.includes('user declin')
}

interface Props {
  item: Item
  walletAddress: string | undefined
}

export default function LimitedItemBanner({ item, walletAddress }: Props) {
  const { purchase, pendingItemId } = usePurchaseItem(walletAddress)
  const inventory   = usePlayerStore((s) => s.inventory)
  const saleEnd = saleEndOf(item)
  const [timeLeft,     setTimeLeft]     = useState(saleEnd === null ? Infinity : Math.max(0, saleEnd - Date.now()))
  const [showConfirm,  setShowConfirm]  = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  const alreadyOwned = inventory.some((i) => i.item_id === item.id)
  // ONLY an item with a declared supply can sell out. `total_supply === null` means
  // unlimited — reading a null remaining_supply as 0 marked every unlimited legendary
  // permanently SOLD OUT, which is what took the StillHunt Prototype off sale.
  const isLimited    = item.total_supply !== null && item.total_supply !== undefined
  const isSoldOut    = isLimited && (item.remaining_supply ?? 0) <= 0
  const isPending    = pendingItemId === item.id
  // An item with no sale window never expires.
  const isExpired    = saleEnd !== null && timeLeft <= 0

  useEffect(() => {
    if (saleEnd === null) return
    const interval = setInterval(() => {
      setTimeLeft(Math.max(0, saleEnd - Date.now()))
    }, 1000)
    return () => clearInterval(interval)
  }, [saleEnd])

  async function handleConfirm() {
    setError(null)
    try {
      await purchase(item)
      setShowConfirm(false)
    } catch (err) {
      if (isUserRejection(err)) {
        setShowConfirm(false)
      } else if (err instanceof Error && err.message === 'Insufficient G$ balance') {
        setError('You don\'t have enough G$ to buy this item.')
      } else {
        setError('Purchase could not be completed. Please try again.')
        console.error('[Purchase]', err)
      }
    }
  }

  return (
    <>
      <motion.div
        className="relative overflow-hidden rounded-2xl border-2 border-hunt-gold/60 bg-hunt-surface"
        style={{ boxShadow: '0 0 32px rgba(234,179,8,0.12)' }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="h-1 w-full bg-linear-to-r from-hunt-gold/40 via-hunt-gold to-hunt-gold/40" />
        <div className="absolute inset-0 pointer-events-none bg-linear-to-br from-hunt-gold/5 to-transparent" />

        <div className="relative z-10 p-6 flex flex-col sm:flex-row gap-6 items-center">
          {/* The real weapon, rendered from its in-game model */}
          <div
            className="w-44 h-28 rounded-2xl border-2 border-hunt-gold/40 flex items-center justify-center shrink-0 px-2"
            style={{ background: 'radial-gradient(ellipse at 50% 40%, rgba(234,179,8,0.16) 0%, rgba(234,179,8,0.04) 60%, transparent 100%)' }}
          >
            <ItemArt item={item} color="#eab308" size="banner" />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-hunt-gold/20 text-hunt-gold border border-hunt-gold/40">
                LEGENDARY
              </span>
              <span className="text-xs font-bold text-orange-400">
                {isSoldOut
                  ? 'SOLD OUT'
                  : `${item.remaining_supply} / ${item.total_supply} remaining`}
              </span>
            </div>

            <div>
              <p className="font-display font-bold text-white text-xl">{item.name}</p>
              <p className="text-slate-400 text-sm mt-1">{item.description}</p>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <span className="font-bold text-hunt-gold text-lg">
                {formatGDollarNumber(item.price)} G$
              </span>
            </div>
            {(() => {
              const gid = gunIdFromItemId(item.id)
              if (gid) {
                const gun = GUN_CATALOG[gid]
                return (
                  <div className="flex gap-3 flex-wrap text-[11px]">
                    <span className="text-slate-400"><span className="font-black text-white">{gun.damage}</span> DMG</span>
                    <span className="text-slate-400"><span className="font-black text-white">{gun.fireRate}</span> RPM</span>
                    <span className="text-slate-400"><span className="font-black text-white">{Math.round(gun.accuracy * 100)}%</span> ACC</span>
                    <span className="text-slate-400"><span className="font-black text-white">{gun.magazine}</span> MAG</span>
                    <span className="text-slate-400"><span className="font-black text-white">{Math.round(gun.critChance * 100)}%</span> CRIT</span>
                    <span className="text-slate-400"><span className="font-black text-hunt-gold">{Math.round(gunDps(gun))}</span> DPS</span>
                  </div>
                )
              }
              return null
            })()}
          </div>

          {/* CTA + countdown */}
          <div className="flex flex-col gap-3 items-center shrink-0">
            {/* Only an item with a real deadline shows a clock. Without this an
                unlimited item counted down from Infinity. */}
            {saleEnd !== null && !isSoldOut && timeLeft > 0 && (
              <div className="text-center">
                <p className="text-xs text-slate-500 mb-1">Ends in</p>
                <p className="font-mono font-bold text-hunt-gold text-lg">
                  {formatCountdown(timeLeft)}
                </p>
              </div>
            )}

            {alreadyOwned ? (
              <div className="px-6 py-2.5 text-sm font-bold text-green-400 bg-green-500/10 rounded-xl border border-green-500/20">
                ✓ You own this
              </div>
            ) : isExpired || isSoldOut ? (
              <div className="px-6 py-2.5 text-sm font-bold text-slate-500 bg-hunt-surface-2 rounded-xl border border-hunt-border">
                {isExpired ? 'Sale Ended' : 'Sold Out'}
              </div>
            ) : (
              <motion.button
                onClick={() => { setError(null); setShowConfirm(true) }}
                disabled={!walletAddress}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="px-8 py-2.5 bg-hunt-gold text-black font-bold rounded-xl hover:bg-hunt-gold-light disabled:opacity-50 transition-colors text-sm"
              >
                Buy Now
              </motion.button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Confirmation modal */}
      <AnimatePresence>
        {showConfirm && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => { if (e.target === e.currentTarget && !isPending) setShowConfirm(false) }}
          >
            <motion.div
              className="w-full max-w-xs rounded-2xl border flex flex-col gap-5 p-6"
              style={{ background: '#12121a', borderColor: '#2a2a3a' }}
              initial={{ opacity: 0, scale: 0.93, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-display font-black text-white text-xl leading-tight">
                    Confirm Purchase
                  </h2>
                  <p className="text-slate-500 text-xs mt-0.5">One-tap authorization · No gas fees</p>
                </div>
                {!isPending && (
                  <button
                    onClick={() => setShowConfirm(false)}
                    className="text-slate-500 hover:text-white transition-colors shrink-0 mt-0.5"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>

              {/* Item details */}
              <div className="p-3 rounded-xl bg-hunt-gold/10 border border-hunt-gold/20">
                <div className="flex items-center gap-3">
                  <ItemArt item={item} color="#eab308" size="modal" />
                  <div className="min-w-0">
                    <p className="font-bold text-white text-sm truncate">{item.name}</p>
                    {(() => {
                      const gid = gunIdFromItemId(item.id)
                      if (gid) {
                        const gun = GUN_CATALOG[gid]
                        return <p className="text-[10px] text-hunt-gold mt-0.5">{Math.round(gunDps(gun))} DPS · {gun.damage} DMG · {gun.fireRate} RPM</p>
                      }
                      return null
                    })()}
                  </div>
                </div>
              </div>

              {/* Price row */}
              <div className="flex items-center justify-between py-2 border-t" style={{ borderColor: '#2a2a3a' }}>
                <span className="text-slate-400 text-sm">Total</span>
                <span className="font-black text-hunt-gold text-lg">{formatGDollarNumber(item.price)} G$</span>
              </div>

              {error && <p className="text-red-400 text-xs -mt-2">{error}</p>}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  disabled={isPending}
                  className="flex-1 py-2.5 text-sm font-bold rounded-xl border text-slate-400 hover:text-white transition-colors disabled:opacity-40"
                  style={{ borderColor: '#2a2a3a' }}
                >
                  Cancel
                </button>
                <motion.button
                  onClick={handleConfirm}
                  disabled={isPending}
                  whileTap={{ scale: 0.97 }}
                  className="flex-1 py-2.5 text-sm font-black rounded-xl text-black bg-hunt-gold hover:bg-hunt-gold-light transition-colors disabled:opacity-60"
                >
                  {isPending ? (
                    <span className="flex items-center justify-center gap-2">
                      <motion.span
                        className="w-3.5 h-3.5 rounded-full border-2 border-black border-t-transparent inline-block"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
                      />
                      Processing...
                    </span>
                  ) : (
                    'Sign & Buy'
                  )}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
