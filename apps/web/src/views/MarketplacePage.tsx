'use client'

import { motion } from 'framer-motion'
import { ShoppingBag } from 'lucide-react'
import MarketplaceGrid from '@/components/marketplace/MarketplaceGrid'
import ResaleBrowse from '@/components/marketplace/ResaleBrowse'
import { useGBalance } from '@/hooks/useGBalance'
import { useResolvedAuth } from '@/hooks/useResolvedAuth'

export default function MarketplacePage() {
  const { address } = useResolvedAuth()
  const { formatted: gBalance } = useGBalance(address)

  return (
    <div className="flex flex-col gap-6">

      {/* ── Armory header ── */}
      <motion.div
        className="relative overflow-hidden rounded-2xl p-6"
        style={{ background: 'rgba(8,8,14,0.95)', border: '1px solid rgba(234,179,8,0.18)' }}
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
      >
        {/* Marksman left accent */}
        <div className="absolute inset-y-0 left-0 w-1 rounded-l-2xl" style={{ background: 'linear-gradient(180deg, #fde047, #eab308, #b45309)' }}/>
        {/* Glow */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse 60% 100% at 0% 50%, rgba(234,179,8,0.06), transparent)',
        }}/>
        {/* Scanlines */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.04) 2px, rgba(0,0,0,0.04) 4px)',
        }}/>

        <div className="relative z-10 flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.25)' }}>
              <ShoppingBag size={22} className="text-amber-400" strokeWidth={1.8}/>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-[0.3em] font-bold text-amber-500/60 mb-0.5">StillHunt Armoury</p>
              <h1 className="font-display font-black text-white text-2xl tracking-wide">Marketplace</h1>
            </div>
          </div>
          <p className="text-slate-500 text-xs">Guns · Ammo · Attachments · buy from the house or trade with other players</p>
          {gBalance && (
            <div className="flex items-center justify-between px-4 py-3 rounded-xl"
              style={{ background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.15)' }}>
              <p className="text-[10px] uppercase tracking-widest font-bold text-amber-500/60">Your Balance</p>
              <p className="font-black text-amber-400 text-xl leading-tight">{gBalance} <span className="text-sm font-bold">G$</span></p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Renders nothing until the player actually holds Scrip. Until then this
          is a shop for the one currency they have, exactly as it was. */}

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.12 }}
      >
        <MarketplaceGrid walletAddress={address} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.18 }}
      >
        <ResaleBrowse walletAddress={address} />
      </motion.div>
    </div>
  )
}
