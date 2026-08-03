'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import type { Item } from '@/types'
import { ITEM_RARITY_COLORS } from '@/lib/constants'
import { formatGDollarNumber } from '@/utils/format'
import { usePurchaseItem } from '@/hooks/useMarketplace'
import { usePlayerStore } from '@/stores/usePlayerStore'
import { CURRENCY } from '@/config/chain'
import { useGBalance } from '@/hooks/useGBalance'
import { gunIdFromItemId } from './GunIcons'
import { ItemArt } from './ItemArt'
import { WeaponCrate, crateLabel } from './WeaponCrate'
import { gunDps, GUN_CATALOG, type GunStats } from '@/engine/combat/GunStats'

const SLOT_LABEL: Record<string, string> = {
  barrel: 'Barrel', optic: 'Optic', grip: 'Grip', magazine: 'Magazine',
}

function GunStatBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 w-12 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(42,42,58,0.6)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color }} />
      </div>
      <span className="text-[10px] font-black text-slate-400 w-8 text-right">{value}</span>
    </div>
  )
}

function GunStatsPanel({ gun, color }: { gun: GunStats; color: string }) {
  return (
    <div className="flex flex-col gap-1.5 mt-1">
      <GunStatBar label="DMG" value={gun.damage} max={50} color="#ef4444" />
      <GunStatBar label="RPM" value={gun.fireRate} max={600} color="#f59e0b" />
      <GunStatBar label="ACC" value={Math.round(gun.accuracy * 100)} max={100} color="#22c55e" />
      <GunStatBar label="RANGE" value={gun.range} max={16} color="#3b82f6" />
      <GunStatBar label="CRIT" value={Math.round(gun.critChance * 100)} max={20} color="#a855f7" />
      <div className="flex items-center justify-between mt-0.5 pt-1.5" style={{ borderTop: '1px solid rgba(42,42,58,0.5)' }}>
        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Effective DPS</span>
        <span className="text-xs font-black" style={{ color }}>{Math.round(gunDps(gun))}</span>
      </div>
      <div className="flex gap-2 text-[9px] text-slate-600">
        <span>{gun.magazine} rounds</span>
        <span>·</span>
        <span>{gun.reloadTime}s reload</span>
      </div>
    </div>
  )
}

function ModLine({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-slate-500">{label}</span>
      <span className="text-[11px] font-black" style={{ color }}>{value}</span>
    </div>
  )
}

function isUserRejection(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return msg.includes('rejected') || msg.includes('denied') || msg.includes('user cancel') || msg.includes('user declin')
}

interface Props {
  item: Item
  walletAddress: string | undefined
}

export default function MarketplaceItem({ item, walletAddress }: Props) {
  // Price in whatever currency the shop is set to. `null` means this item is not
  // sold on that chain, and buying MUST be disabled rather than falling back to
  // the other chain's number — that substitution is what makes a signed permit
  // disagree with the on-chain listing and revert.
  const price = item.price
  const symbol = CURRENCY.symbol
  // Single currency, so an item is either priced or it is not for sale at all.
  const notSoldHere = price === null || price === undefined

  const { purchase, pendingItemId } = usePurchaseItem(walletAddress)
  const inventory = usePlayerStore((s) => s.inventory)
  const { refetch: refetchBalance } = useGBalance(walletAddress as `0x${string}` | undefined)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [purchased, setPurchased]     = useState(false)

  const rarityColor  = ITEM_RARITY_COLORS[item.rarity]
  const isLimited    = item.total_supply !== null
  const isSoldOut    = isLimited && (item.remaining_supply ?? 0) <= 0
  const isPending    = pendingItemId === item.id
  const alreadyOwned = inventory.some((i) => i.item_id === item.id)

  async function handleConfirm() {
    setError(null)
    try {
      await purchase(item)
      setPurchased(true)
      setShowConfirm(false)
      refetchBalance()
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
        className="flex flex-col gap-3 p-4 bg-hunt-surface rounded-xl border transition-all"
        style={{ borderColor: `${rarityColor}33` }}
        whileHover={!isSoldOut && !alreadyOwned ? { scale: 1.02, y: -2 } : {}}
        layout
      >
        {/* Rarity + supply */}
        <div className="flex items-center justify-between">
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ color: rarityColor, background: `${rarityColor}22` }}
          >
            {item.rarity.toUpperCase()}
          </span>
          {isLimited && (
            <span className={`text-xs font-bold ${isSoldOut ? 'text-red-400' : 'text-orange-400'}`}>
              {isSoldOut ? 'SOLD OUT' : `${item.remaining_supply} left`}
            </span>
          )}
        </div>

        {/* Item visual: the real in-game asset, framed as a tactical weapon crate */}
        <WeaponCrate item={item} rarityColor={rarityColor} label={crateLabel(item)} />

        {/* Name + desc */}
        <div>
          <p className="font-bold text-white text-sm leading-tight">{item.name}</p>
          <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
            {item.description}
          </p>
        </div>

        {/* Stats breakdown */}
        {(() => {
          const gid = gunIdFromItemId(item.id)
          if (gid) {
            const gun = GUN_CATALOG[gid]
            return <GunStatsPanel gun={gun} color={rarityColor} />
          }
          const ws = item.weapon_stats as Record<string, unknown> | null
          if (item.category === 'ammo' && ws) {
            return (
              <div className="flex flex-col gap-1 mt-1">
                {(ws.damageMult as number) > 1 && <ModLine label="Damage" value={`+${Math.round(((ws.damageMult as number) - 1) * 100)}%`} color="#ef4444" />}
                {(ws.accuracyMod as number) > 0 && <ModLine label="Accuracy" value={`+${Math.round((ws.accuracyMod as number) * 100)}%`} color="#22c55e" />}
                {(ws.fireRateMod as number) > 0 && <ModLine label="Fire Rate" value={`+${ws.fireRateMod} RPM`} color="#f59e0b" />}
                {(ws.critChanceMod as number) > 0 && <ModLine label="Crit Chance" value={`+${Math.round((ws.critChanceMod as number) * 100)}%`} color="#a855f7" />}
                {(ws.burnDps as number) > 0 && <ModLine label="Burn DPS" value={`${ws.burnDps} HP/s`} color="#f97316" />}
              </div>
            )
          }
          if (item.category === 'attachment' && ws) {
            return (
              <div className="flex flex-col gap-1 mt-1">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-600">{SLOT_LABEL[(ws.slot as string) ?? ''] ?? 'Slot'} attachment</span>
                {(ws.accuracyMod as number) !== 0 && <ModLine label="Accuracy" value={`${(ws.accuracyMod as number) > 0 ? '+' : ''}${Math.round((ws.accuracyMod as number) * 100)}%`} color="#22c55e" />}
                {(ws.fireRateMod as number) !== 0 && <ModLine label="Fire Rate" value={`${(ws.fireRateMod as number) > 0 ? '+' : ''}${ws.fireRateMod} RPM`} color="#f59e0b" />}
                {(ws.rangeMod as number) !== 0 && <ModLine label="Range" value={`${(ws.rangeMod as number) > 0 ? '+' : ''}${ws.rangeMod}m`} color="#3b82f6" />}
                {(ws.magazineMod as number) !== 0 && <ModLine label="Magazine" value={`+${ws.magazineMod} rounds`} color="#06b6d4" />}
                {(ws.reloadTimeMod as number) !== 0 && <ModLine label="Reload" value={`${(ws.reloadTimeMod as number) > 0 ? '+' : ''}${ws.reloadTimeMod}s`} color={(ws.reloadTimeMod as number) < 0 ? '#22c55e' : '#ef4444'} />}
              </div>
            )
          }
          if (item.category === 'booster') {
            return (
              <div className="flex flex-col gap-1 mt-1">
                <ModLine label="XP earned" value="×2" color="#ffc72a" />
                <ModLine label="Duration" value="24 hours" color="#22c55e" />
              </div>
            )
          }
          if (item.category === 'shield') {
            return (
              <div className="flex flex-col gap-1 mt-1">
                <ModLine label="Rank decay" value="Frozen" color="#4a8dff" />
                <ModLine label="Duration" value="7 days" color="#22c55e" />
                <span className="text-[10px] text-slate-500 leading-relaxed mt-0.5">
                  Your rank can&apos;t drop from inactivity while the shield is active.
                </span>
              </div>
            )
          }
          if (item.category === 'cosmetic') {
            return <div className="text-[10px] text-slate-500 mt-1">Cosmetic only, no stat changes.</div>
          }
          if (item.category === 'gear') {
            return (
              <div className="flex flex-col gap-1 mt-1">
                <ModLine label="Loadout" value="Field kit" color="#a855f7" />
                <span className="text-[10px] text-slate-500 leading-relaxed mt-0.5">Equip it in the Loadout before an op.</span>
              </div>
            )
          }
          return null
        })()}

        {/* Price */}
        <div className="flex items-center justify-between mt-auto pt-2" style={{ borderTop: '1px solid rgba(42,42,58,0.4)' }}>
          <span className="font-bold" style={{ color: notSoldHere ? '#64748b' : '#eab308' }}>
            {notSoldHere ? 'Not for sale' : `${formatGDollarNumber(price)} ${symbol}`}
          </span>
          {(() => {
            const gid = gunIdFromItemId(item.id)
            if (gid) {
              const gun = GUN_CATALOG[gid]
              return <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: rarityColor }}>Tier {gun.tier}</span>
            }
            if (item.category === 'ammo') return <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: rarityColor }}>Ammo</span>
            if (item.category === 'attachment') return <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: rarityColor }}>{SLOT_LABEL[(item.weapon_stats as Record<string, string> | null)?.slot ?? ''] ?? 'Part'}</span>
            if (item.category === 'gear') return <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: rarityColor }}>Field Kit</span>
            if (item.category === 'shield') return <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: rarityColor }}>Shield</span>
            if (item.category === 'booster') return <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: rarityColor }}>Booster</span>
            if (item.category === 'cosmetic') return <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: rarityColor }}>Cosmetic</span>
            return null
          })()}
        </div>

        {error && <p className="text-red-400 text-xs">{error}</p>}
        {purchased && (
          <p className="text-green-400 text-xs">✓ Purchased</p>
        )}

        {/* Action button */}
        {alreadyOwned ? (
          <div className="w-full py-2 text-center text-xs font-bold text-green-400 bg-green-500/10 rounded-lg border border-green-500/20">
            ✓ Owned
          </div>
        ) : (
          <motion.button
            onClick={() => { setError(null); setShowConfirm(true) }}
            disabled={!walletAddress || isSoldOut || notSoldHere}
            whileTap={!isSoldOut && !notSoldHere ? { scale: 0.97 } : {}}
            className="w-full py-2.5 text-sm font-bold rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: isSoldOut || notSoldHere ? '#374151' : rarityColor,
              color: isSoldOut || notSoldHere ? '#6b7280' : '#000',
            }}
          >
            {isSoldOut
              ? 'Sold Out'
              : notSoldHere
                // Disabled, not hidden. The item exists and is buyable in the
                // other currency, so saying why is more useful than vanishing it.
                ? 'Not for sale'
                : !walletAddress
                  ? 'Sign in to buy'
                  : `Buy with ${symbol}`}
          </motion.button>
        )}
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
              <div className="p-3 rounded-xl" style={{ background: `${rarityColor}10`, border: `1px solid ${rarityColor}22` }}>
                <div className="flex items-center gap-3">
                  <ItemArt item={item} color={rarityColor} size="modal" />
                  <div className="min-w-0">
                    <p className="font-bold text-white text-sm truncate">{item.name}</p>
                    {(() => {
                      const gid = gunIdFromItemId(item.id)
                      if (gid) {
                        const gun = GUN_CATALOG[gid]
                        return <p className="text-[10px] mt-0.5" style={{ color: rarityColor }}>{Math.round(gunDps(gun))} DPS · {gun.damage} DMG · {gun.fireRate} RPM</p>
                      }
                      return null
                    })()}
                  </div>
                </div>
                {(() => {
                  const gid = gunIdFromItemId(item.id)
                  if (gid) {
                    const gun = GUN_CATALOG[gid]
                    return (
                      <div className="grid grid-cols-3 gap-x-3 gap-y-1 mt-2 pt-2" style={{ borderTop: `1px solid ${rarityColor}15` }}>
                        <div className="text-center"><span className="text-[8px] text-slate-500 uppercase block">Damage</span><span className="text-[11px] font-black text-white">{gun.damage}</span></div>
                        <div className="text-center"><span className="text-[8px] text-slate-500 uppercase block">Fire Rate</span><span className="text-[11px] font-black text-white">{gun.fireRate}</span></div>
                        <div className="text-center"><span className="text-[8px] text-slate-500 uppercase block">Accuracy</span><span className="text-[11px] font-black text-white">{Math.round(gun.accuracy * 100)}%</span></div>
                        <div className="text-center"><span className="text-[8px] text-slate-500 uppercase block">Magazine</span><span className="text-[11px] font-black text-white">{gun.magazine}</span></div>
                        <div className="text-center"><span className="text-[8px] text-slate-500 uppercase block">Crit</span><span className="text-[11px] font-black text-white">{Math.round(gun.critChance * 100)}%</span></div>
                        <div className="text-center"><span className="text-[8px] text-slate-500 uppercase block">Range</span><span className="text-[11px] font-black text-white">{gun.range}m</span></div>
                      </div>
                    )
                  }
                  return null
                })()}
              </div>

              {/* Price row */}
              <div className="flex items-center justify-between py-2 border-t" style={{ borderColor: '#2a2a3a' }}>
                <span className="text-slate-400 text-sm">Total</span>
                <span className="font-black text-hunt-gold text-lg">{formatGDollarNumber(price ?? 0)} {symbol}</span>
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
                  className="flex-1 py-2.5 text-sm font-black rounded-xl text-black transition-opacity disabled:opacity-60"
                  style={{ background: rarityColor }}
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
