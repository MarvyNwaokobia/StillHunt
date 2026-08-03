'use client'

import { useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useConfig } from 'wagmi'
import { readContract } from '@wagmi/core'
import { parseUnits, parseSignature } from 'viem'
import { G_TOKEN_ADDRESS } from '@/lib/constants'
import { useActiveWalletClient } from '@/hooks/useActiveWalletClient'
import { useRelayAddress } from '@/hooks/useTransferOut'
import { magicCanSign, describeSigningError } from '@/lib/magic'
import { useResolvedAuth } from '@/hooks/useResolvedAuth'
import { requirePermitDomain } from '@/config/chain'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'
const G_DECIMALS = 18

const NONCES_ABI = [
  { name: 'nonces', type: 'function', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const
const BALANCE_ABI = [
  { name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const

/** A duel someone has opened and not yet had accepted. */
export interface OpenDuel {
  id: string
  challenger: string
  /** Username, else character name. Null only if the row has no player yet. */
  challenger_name: string | null
  stake_g: number
  winner_takes_g: number
  created_at: string
}

/** One of the caller's own duels, in any state. */
export interface MyDuel {
  id: string
  challenger: string
  challenger_name: string | null
  opponent: string | null
  opponent_name: string | null
  stake_g: number
  status: 'open' | 'accepted' | 'resolved' | 'cancelled'
  winner: string | null
  challenger_score: number | null
  opponent_score: number | null
}

export interface DuelsList {
  open: OpenDuel[]
  mine: MyDuel[]
  /** The agreed stake ladder. Both sides can only pick from this, and the server
   *  enforces it — the UI renders whatever the server says rather than its own copy,
   *  so the two can never disagree about what a legal stake is. */
  stake_tiers: number[]
  min_stake_g: number
  max_stake_g: number
  /** House cut in basis points (50 = 0.5%). */
  house_cut_bps: number
}

/** Everything needed to play one side of a duel. */
export interface DuelRun {
  id: string
  seed: number
  stake_g: number
  run_token: string
  winner_takes_g: number
}

export interface DuelResult {
  resolved: boolean
  waiting_on_opponent?: boolean
  draw?: boolean
  winner?: string | null
  winnings_g?: number
  challenger_score?: number
  opponent_score?: number
}

/**
 * The score both sides are ranked on. Must be IDENTICAL for both players or the
 * duel is not a fair comparison, so it lives here rather than being computed at
 * each call site. Kept deliberately coarse: waves dominate, kills break ties.
 *
 * The server independently range-checks this against the elapsed time it measured,
 * so inflating it client-side is bounded rather than free.
 */
export function duelScore(wavesCleared: number, kills: number): number {
  return Math.max(0, Math.floor(wavesCleared) * 100 + Math.floor(kills) * 10)
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as { error?: string }).error ?? 'Request failed')
  return json as T
}

/**
 * Is the deployed API new enough to serve duels the way this UI describes them?
 *
 * The web app and the API deploy independently, so rather than document a deploy
 * order and hope, the entry point feature-detects. Crucially it detects the
 * CONTRACT, not just the route: an older API answers /duels perfectly happily
 * while charging a different house cut and accepting different stakes. Showing
 * the card then would put a screen in front of players that states one fee while
 * the server takes another, which is the one failure mode that must not ship.
 *
 * `stake_tiers` is the marker because it arrived with the 0.5% cut, so its
 * presence means the server agrees with every number this UI prints.
 */
export function useDuelsAvailable(): boolean {
  const q = useQuery({
    queryKey: ['duels-available'],
    queryFn: async () => {
      const res = await fetch(`${API}/duels`)
      if (!res.ok) return false
      const body = (await res.json().catch(() => null)) as Partial<DuelsList> | null
      return Array.isArray(body?.stake_tiers) && typeof body?.house_cut_bps === 'number'
    },
    staleTime: 5 * 60_000,
    retry: false,
  })
  return q.data === true
}

export function useDuels(walletAddress: string | undefined) {
  const queryClient = useQueryClient()
  const config = useConfig()
  const walletClient = useActiveWalletClient()
  const { data: relayAddress } = useRelayAddress()
  const { source } = useResolvedAuth()
  const [pending, setPending] = useState(false)

  const list = useQuery({
    queryKey: ['duels', walletAddress?.toLowerCase() ?? 'anon'],
    queryFn: async (): Promise<DuelsList> => {
      const q = walletAddress ? `?wallet=${walletAddress.toLowerCase()}` : ''
      const res = await fetch(`${API}/duels${q}`)
      if (!res.ok) throw new Error('Could not load duels')
      return res.json()
    },
    staleTime: 10_000,
    // Poll so a duel resolves in the lobby without a manual refresh once the
    // opponent finishes their run.
    refetchInterval: 20_000,
    // Signed-out visitors are redirected away immediately; firing the request
    // anyway just adds a doomed round trip on every bounce.
    enabled: !!walletAddress,
  })

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['duels'] })
  }, [queryClient])

  /**
   * Sign an EIP-2612 permit for EXACTLY this stake.
   *
   * One signature per stake, rather than the survival re-arm's standing session
   * allowance. That allowance is capped at 50 G$ because it authorises many
   * signature-free spends mid-run — every duel stake starts at 100 G$, so it was
   * rejected outright ("Arm cap must be between 1 and 50 G$"). Raising that
   * ceiling would have loosened a safety bound belonging to another feature; a
   * per-stake permit is both correct and more honest, since the player authorises
   * the exact figure the confirmation screen just showed them.
   */
  const signStake = useCallback(async (stakeG: number) => {
    if (!walletAddress) throw new Error('Not signed in')
    if (!walletClient?.account) {
      // Being signed in and being able to SIGN are different states. wagmi
      // restores a connection from storage before its wallet client is ready,
      // and a Magic session on mobile Safari can survive while its provider does
      // not, so the app can look logged in with nothing able to sign. Say that,
      // rather than the flat "not connected" that sent people hunting for a
      // disconnected wallet.
      throw new Error('Wallet session not ready to sign — reload, or sign out and back in')
    }
    if (!relayAddress) throw new Error('Staking relay unavailable')

    const amount = parseUnits(stakeG.toString(), G_DECIMALS)
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 30)

    const balance = await readContract(config, {
      address: G_TOKEN_ADDRESS, abi: BALANCE_ABI, functionName: 'balanceOf',
      args: [walletAddress as `0x${string}`],
    })
    if (balance < amount) throw new Error('Not enough G$ for this stake')

    const nonce = await readContract(config, {
      address: G_TOKEN_ADDRESS, abi: NONCES_ABI, functionName: 'nonces',
      args: [walletAddress as `0x${string}`],
    })

    // Ask Magic whether it can still sign BEFORE prompting, but ONLY for Magic
    // sessions — an external wallet has no Magic session and must not be blocked
    // by one. A session evicted by ITP still yields a usable-looking wallet
    // client, so without this the player gets Magic's "-32603 User denied
    // account access", which reads as though they refused a prompt that never
    // appeared.
    if (source === 'magic' && !(await magicCanSign())) {
      throw new Error('Your wallet session on this device has expired. Sign in again to stake.')
    }

    let rawSig: `0x${string}`
    try {
      rawSig = await walletClient.signTypedData({
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
    } catch (err) {
      throw new Error(describeSigningError(err))
    }

    const { v, r, s } = parseSignature(rawSig)
    return { deadline: Number(deadline), v: Number(v), r, s }
  }, [walletAddress, walletClient, relayAddress, config])

  const createDuel = useCallback(async (stakeG: number): Promise<DuelRun> => {
    if (!walletAddress) throw new Error('Not signed in')
    setPending(true)
    try {
      const permit = await signStake(stakeG)
      const run = await post<DuelRun>('/duels', { wallet: walletAddress, stake_g: stakeG, ...permit })
      refresh()
      return run
    } finally { setPending(false) }
  }, [walletAddress, signStake, refresh])

  const acceptDuel = useCallback(async (id: string, stakeG: number): Promise<DuelRun> => {
    if (!walletAddress) throw new Error('Not signed in')
    setPending(true)
    try {
      const permit = await signStake(stakeG)
      const run = await post<DuelRun>(`/duels/${id}/accept`, { wallet: walletAddress, ...permit })
      refresh()
      return run
    } finally { setPending(false) }
  }, [walletAddress, signStake, refresh])

  const submitScore = useCallback(async (id: string, runToken: string, score: number): Promise<DuelResult> => {
    if (!walletAddress) throw new Error('Not signed in')
    const result = await post<DuelResult>(`/duels/${id}/submit`, {
      wallet: walletAddress, run_token: runToken, score,
    })
    refresh()
    return result
  }, [walletAddress, refresh])

  const cancelDuel = useCallback(async (id: string): Promise<void> => {
    if (!walletAddress) throw new Error('Not signed in')
    setPending(true)
    try {
      await post(`/duels/${id}/cancel`, { wallet: walletAddress })
      refresh()
    } finally { setPending(false) }
  }, [walletAddress, refresh])

  return {
    // Whether a signature is actually possible right now. The UI gates staking on
    // this instead of letting a player commit to a stake and fail at the wallet.
    signerReady: !!walletClient?.account,
    duels: list.data,
    loading: list.isLoading,
    error: list.error instanceof Error ? list.error.message : null,
    pending,
    createDuel, acceptDuel, submitScore, cancelDuel, refresh,
  }
}
