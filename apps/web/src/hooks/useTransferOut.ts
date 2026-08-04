import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useConfig } from 'wagmi'
import { readContract } from '@wagmi/core'
import { parseUnits, parseSignature, isAddress } from 'viem'
import { useState } from 'react'
import { G_TOKEN_ADDRESS } from '@/lib/constants'
import { useActiveWalletClient } from '@/hooks/useActiveWalletClient'
import { requirePermitDomain } from '@/config/chain'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'
const G_DECIMALS = 18

const NONCES_ABI = [
  { name: 'nonces', type: 'function', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const

const BALANCE_ABI = [
  { name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const

// The backend relay wallet's own address — needed as the permit's `spender`.
// Public info (addresses aren't secret), cached indefinitely since it never changes.
export function useRelayAddress() {
  return useQuery({
    queryKey: ['relay-address'],
    queryFn: async (): Promise<`0x${string}`> => {
      const res = await fetch(`${API}/relay-address`)
      if (!res.ok) throw new Error('Transfer relay unavailable')
      const { address } = await res.json()
      return address
    },
    staleTime: Infinity,
  })
}

export type WithdrawFee = { bps: number; percent: number; address: `0x${string}` }

// The withdrawal fee, read from the server rather than hardcoded here. The rate
// shown to a player before they sign MUST be the rate the server charges, and a
// duplicated constant drifts the first time it changes. Falls back to 0 on a
// failed fetch so a dead endpoint understates the fee rather than inventing one.
export function useWithdrawFee() {
  return useQuery({
    queryKey: ['withdraw-fee'],
    queryFn: async (): Promise<WithdrawFee> => {
      const res = await fetch(`${API}/withdraw-fee`)
      if (!res.ok) throw new Error('Fee unavailable')
      return res.json()
    },
    staleTime: 5 * 60_000,
  })
}

/// Split a gross amount the way the server does: fee rounded down, player keeps
/// the dust. Mirrors `split_fee` in the API.
export function splitWithdrawal(amountG: number, bps: number) {
  const fee = Math.floor(amountG * bps) / 10_000
  return { net: amountG - fee, fee }
}

export function useTransferOut(walletAddress: string | undefined) {
  const queryClient = useQueryClient()
  const config = useConfig()
  const walletClient = useActiveWalletClient()
  const { data: relayAddress } = useRelayAddress()
  const [pending, setPending] = useState(false)

  const transfer = async (to: string, amountG: number): Promise<string> => {
    if (!walletAddress) throw new Error('Not signed in')
    if (!walletClient?.account) throw new Error('Wallet not connected')
    if (!relayAddress) throw new Error('Transfer relay unavailable')
    if (!isAddress(to)) throw new Error('Enter a valid wallet address')
    if (!(amountG > 0)) throw new Error('Enter an amount greater than 0')

    setPending(true)
    try {
      const amount = parseUnits(amountG.toString(), G_DECIMALS)
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 30)

      const balance = await readContract(config, {
        address: G_TOKEN_ADDRESS, abi: BALANCE_ABI, functionName: 'balanceOf',
        args: [walletAddress as `0x${string}`],
      })
      if (balance < amount) throw new Error('Insufficient TALLY balance')

      const nonce = await readContract(config, {
        address: G_TOKEN_ADDRESS, abi: NONCES_ABI, functionName: 'nonces',
        args: [walletAddress as `0x${string}`],
      })

      // Sign EIP-2612 permit granting the backend relay wallet an allowance
      // for this exact amount — same primitive already used for marketplace
      // checkout, just with the relay wallet as spender instead of the
      // marketplace contract.
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
        message: {
          owner: walletAddress as `0x${string}`,
          spender: relayAddress,
          value: amount,
          nonce,
          deadline,
        },
      })

      const { v, r, s } = parseSignature(rawSig)

      const res = await fetch(`${API}/players/${walletAddress}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          amount_wei: amount.toString(),
          deadline: Number(deadline),
          v: Number(v),
          r,
          s,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Transfer failed' }))
        const msg = (body.error as string) ?? 'Transfer failed'
        // Relay-fuel failures are OURS, and the backend now says so explicitly.
        // Check this BEFORE the permit match: the node's out-of-gas error text
        // contains the word "permit", so the signature branch used to swallow it
        // and tell the player to re-sign — advice that could never work.
        if (body.code === 'RELAY_OUT_OF_GAS') throw new Error(msg)
        if (msg.includes('permit')) throw new Error('Signature expired or invalid — please try again')
        throw new Error(msg)
      }

      const { tx_hash } = (await res.json()) as { tx_hash: string }

      queryClient.invalidateQueries({ queryKey: ['ledger-summary', walletAddress] })
      return tx_hash
    } finally {
      setPending(false)
    }
  }

  return { transfer, pending }
}
