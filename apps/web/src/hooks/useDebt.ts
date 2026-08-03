import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useConfig } from 'wagmi'
import { readContract } from '@wagmi/core'
import { parseUnits, parseSignature } from 'viem'
import { useState } from 'react'
import { G_TOKEN_ADDRESS } from '@/lib/constants'
import { useActiveWalletClient } from '@/hooks/useActiveWalletClient'
import { useRelayAddress } from '@/hooks/useTransferOut'
import { requirePermitDomain } from '@/config/chain'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'
const G_DECIMALS = 18

const NONCES_ABI = [
  { name: 'nonces', type: 'function', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const

const BALANCE_ABI = [
  { name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const

export interface Debt {
  owed: number
  reason: string | null
}

/** The player's outstanding marketplace balance (0 = nothing due). */
export function useDebt(walletAddress: string | undefined) {
  return useQuery({
    queryKey: ['debt', walletAddress],
    enabled: !!walletAddress,
    queryFn: async (): Promise<Debt> => {
      const res = await fetch(`${API}/players/${walletAddress}/debt`)
      if (!res.ok) return { owed: 0, reason: null }
      return res.json()
    },
  })
}

/** Settle the outstanding balance: sign an EIP-2612 G$ permit for the owed amount
 *  (relay wallet as spender), then the backend relays transferFrom → reward pool. */
export function useSettleDebt(walletAddress: string | undefined) {
  const queryClient = useQueryClient()
  const config = useConfig()
  const walletClient = useActiveWalletClient()
  const { data: relayAddress } = useRelayAddress()
  const [pending, setPending] = useState(false)

  const settle = async (owedG: number): Promise<string> => {
    if (!walletAddress) throw new Error('Not signed in')
    if (!walletClient?.account) throw new Error('Wallet not connected')
    if (!relayAddress) throw new Error('Settlement relay unavailable')
    if (!(owedG > 0)) throw new Error('Nothing to settle')

    setPending(true)
    try {
      const amount = parseUnits(owedG.toString(), G_DECIMALS)
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 30)

      const balance = await readContract(config, {
        address: G_TOKEN_ADDRESS, abi: BALANCE_ABI, functionName: 'balanceOf',
        args: [walletAddress as `0x${string}`],
      })
      if (balance < amount) throw new Error('Insufficient G$ balance to settle')

      const nonce = await readContract(config, {
        address: G_TOKEN_ADDRESS, abi: NONCES_ABI, functionName: 'nonces',
        args: [walletAddress as `0x${string}`],
      })

      const rawSig = await walletClient.signTypedData({
        account: walletClient.account,
        domain: requirePermitDomain(),
        types: {
          Permit: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
          ],
        },
        primaryType: 'Permit',
        message: { owner: walletAddress as `0x${string}`, spender: relayAddress, value: amount, nonce, deadline },
      })

      const { v, r, s } = parseSignature(rawSig)

      const res = await fetch(`${API}/players/${walletAddress}/settle-debt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_wei: amount.toString(), deadline: Number(deadline), v: Number(v), r, s }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Settlement failed' }))
        const msg = (body.error as string) ?? 'Settlement failed'
        // Relay-fuel failures are OURS, and the backend now says so explicitly.
        // Check this BEFORE the permit match: the node's out-of-gas error text
        // contains the word "permit", so the signature branch used to swallow it
        // and tell the player to re-sign — advice that could never work.
        if (body.code === 'RELAY_OUT_OF_GAS') throw new Error(msg)
        if (msg.includes('permit')) throw new Error('Signature expired or invalid — please try again')
        throw new Error(msg)
      }

      const { tx_hash } = (await res.json()) as { tx_hash: string }
      queryClient.invalidateQueries({ queryKey: ['debt', walletAddress] })
      queryClient.invalidateQueries({ queryKey: ['ledger-summary', walletAddress] })
      return tx_hash
    } finally {
      setPending(false)
    }
  }

  return { settle, pending }
}
