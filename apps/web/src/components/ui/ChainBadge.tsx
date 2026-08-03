'use client'

import { explorerTxUrl } from '@/config/chain'

interface ChainBadgeProps {
  txHash: string
  className?: string
}

/**
 * A link to a transaction on the explorer.
 *
 * Takes no chain: StillHunt runs on exactly one, so there is nothing to attribute
 * and no way for a link to point at an explorer that has never heard of the hash.
 * If a second chain is ever added, this needs a chain id again — a wrong explorer
 * link looks exactly like a lost transaction.
 */
export function ChainBadge({ txHash, className = '' }: ChainBadgeProps) {
  const href = explorerTxUrl(txHash)

  // No explorer for this chain means no honest link to offer. A badge that goes
  // nowhere is worse than no badge.
  if (!href) return null

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-500 hover:text-emerald-400 transition-colors ${className}`}
      title={`View transaction: ${txHash}`}
    >
      ✦ verified
    </a>
  )
}
