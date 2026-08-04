'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Coins, ExternalLink } from 'lucide-react'
import { useClaimable, useClaim } from '@/hooks/useClaim'
import { explorerTxUrl } from '@/config/chain'

/**
 * The Bank's claim counter.
 *
 * Celo pays the moment you win, so there is nothing to claim there and this
 * renders nothing. On Avalanche a player accrues Scrip as they play and takes it
 * on-chain when they choose, which batches many wins into one transaction and
 * puts a single obvious gate in front of the money.
 *
 * RENDERS NOTHING UNLESS THERE IS SOMETHING TO SAY. A card reading "0 SCRP,
 * nothing to claim" is noise on a page a Celo player visits to move real money,
 * and every Celo player would see it. It appears once a balance exists, or when
 * a payout is genuinely blocked and the player deserves to know why.
 */
export default function ClaimCard({ walletAddress }: { walletAddress: string | undefined }) {
  const { data, isLoading } = useClaimable(walletAddress)
  const claim = useClaim(walletAddress)
  const [txHash, setTxHash] = useState<string | null>(null)

  const balance = Number(data?.balance ?? 0)
  const blocked = !!data && !data.claimable && balance > 0

  // Nothing accrued and nothing wrong: stay out of the way.
  if (isLoading || !data) return null
  if (balance <= 0 && !claim.isSuccess) return null

  const explorer = txHash ? explorerTxUrl(txHash) : null
  const justClaimed = claim.isSuccess && claim.data?.claimed

  // Claimed everything: show the receipt, not an empty wallet with a dead button.
  // Rendering the normal card here gives "UNCLAIMED · 0 SCRP" above a greyed-out
  // "Claim 0 SCRP", which reads as though the claim failed — the opposite of what
  // just happened.
  if (justClaimed && balance <= 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-hunt-surface border border-hunt-border rounded-xl p-4 flex items-center gap-3"
      >
        <Coins size={16} className="text-emerald-400 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-bold text-emerald-400">
            Claimed {Number(claim.data?.amount ?? 0).toLocaleString()} {claim.data?.symbol}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            It&rsquo;s in your wallet. Keep playing to earn more.{' '}
            {explorer && (
              <a
                href={explorer}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 underline hover:text-slate-300"
              >
                View <ExternalLink size={9} />
              </a>
            )}
          </p>
        </div>
      </motion.div>
    )
  }

  async function handleClaim() {
    setTxHash(null)
    try {
      const result = await claim.mutateAsync()
      if (result.tx_hash) setTxHash(result.tx_hash)
    } catch {
      // Surfaced from claim.error below; swallowed here so an expected failure
      // never becomes an unhandled rejection in the console.
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-hunt-surface border border-hunt-border rounded-xl p-4 flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">
            Unclaimed
          </p>
          <p className="font-display font-black text-white text-2xl leading-none mt-1">
            {balance.toLocaleString()}{' '}
            <span className="text-base text-slate-400">{data.symbol}</span>
          </p>
          <p className="text-[10px] text-slate-600 mt-1">
            Earned by playing. Claim it to move it on-chain.
          </p>
        </div>
        <Coins size={18} className="text-slate-600 shrink-0 mt-1" />
      </div>

      {/* Marksman on black, set inline and tapped-scaled to match the Transfer Out
          button directly below it on this page. There is no `stillhunt-accent` token —
          the theme's gold is `hunt-gold` (#eab308) — and a class that does not
          exist renders a button with no background at all: dark text on a dark
          card, which typechecks perfectly and is unreadable. */}
      <motion.button
        onClick={handleClaim}
        disabled={!data.claimable || claim.isPending}
        whileTap={{ scale: 0.97 }}
        className="w-full py-2.5 rounded-lg font-black text-sm text-black
                   transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: '#eab308' }}
      >
        {claim.isPending ? 'Claiming…' : `Claim ${balance.toLocaleString()} ${data.symbol}`}
      </motion.button>

      {/* Why the button is disabled. The server's wording says what is actually
          wrong — a payout wallet needing a top-up is our problem, not theirs, and
          telling them to retry would be advice that cannot work. */}
      {blocked && data.reason && (
        <p className="text-[10px] text-amber-400/90 leading-relaxed">{data.reason}</p>
      )}

      {claim.isError && (
        <p className="text-[10px] text-red-400 leading-relaxed">
          {claim.error instanceof Error ? claim.error.message : 'The payout did not go through'}
        </p>
      )}

      {/* A claim that settled while more was still accruing: confirm it, but keep
          the live balance and an active button above rather than replacing them. */}
      {justClaimed && (
        <div className="flex items-center gap-2 text-[10px] text-emerald-400">
          <span>Claimed {Number(claim.data?.amount ?? 0).toLocaleString()} {claim.data?.symbol}.</span>
          {explorer && (
            <a
              href={explorer}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 underline hover:text-emerald-300"
            >
              View <ExternalLink size={9} />
            </a>
          )}
        </div>
      )}
    </motion.div>
  )
}
