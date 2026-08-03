import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

const API = process.env.NEXT_PUBLIC_API_URL ?? ''

export interface Claimable {
  /** Unclaimed balance, in whole currency units. A string because the server sends
   *  a NUMERIC and parsing it to a float client-side would lose precision on the
   *  exact digits that represent what someone earned. */
  balance: string
  symbol: string
  chain_id: number
  /** False when there is nothing to claim, or the payout rail cannot pay right now. */
  claimable: boolean
  /** Why not. Rendered verbatim: the server writes these to say what is actually
   *  wrong rather than blaming the player's wallet. */
  reason: string | null
}

export interface ClaimResult {
  claimed: boolean
  amount?: string
  symbol?: string
  tx_hash?: string
  chain_id?: number
  reason?: string
}

/**
 * What this player can claim right now.
 *
 * Polls while a balance exists, because it grows as they play: leaving the Bank
 * open during a session should show the number climbing rather than a figure
 * frozen at page load.
 */
export function useClaimable(walletAddress: string | undefined) {
  return useQuery({
    queryKey: ['claimable', walletAddress],
    queryFn: async (): Promise<Claimable> => {
      const res = await fetch(`${API}/players/${walletAddress}/claimable`)
      if (!res.ok) throw new Error('Could not read your balance')
      return res.json()
    },
    enabled: !!walletAddress,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
}

/**
 * Claim the accrued balance.
 *
 * No optimistic update on purpose. The mint can fail, and showing a balance of
 * zero before the transaction lands would tell someone their money had moved
 * when it had not. The server releases the earnings back on failure, so the
 * honest thing is to wait and then refetch the truth.
 */
export function useClaim(walletAddress: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<ClaimResult> => {
      const res = await fetch(`${API}/players/${walletAddress}/claim`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        // The server's message names the real cause (relay out of gas, payouts not
        // enabled). Preferring it over a generic string is what stops a funding
        // problem on our side being reported as a fault with their wallet.
        throw new Error(body?.error ?? 'The payout did not go through')
      }
      return body
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claimable', walletAddress] })
      queryClient.invalidateQueries({ queryKey: ['ledger-summary', walletAddress] })
    },
  })
}
