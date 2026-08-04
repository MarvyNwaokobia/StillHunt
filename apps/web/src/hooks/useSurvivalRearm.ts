import { useState } from 'react'
import { useConfig } from 'wagmi'
import { readContract } from '@wagmi/core'
import { parseUnits, parseSignature } from 'viem'
import { G_TOKEN_ADDRESS } from '@/lib/constants'
import { useActiveWalletClient } from '@/hooks/useActiveWalletClient'
import { useRelayAddress } from '@/hooks/useTransferOut'
import { requirePermitDomain } from '@/config/chain'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'
const G_DECIMALS = 18

const NONCES_ABI = [
  { name: 'nonces', type: 'function', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const

export type RearmAction = 'revive' | 'restock' | 'waveskip'

export interface RearmResult {
  cost_g: number
  remaining_allowance_g: number
}

/** Thrown when the run's session allowance is used up — the UI should offer to
 *  re-arm the session (sign a fresh permit) before the player can keep re-arming. */
export class NeedArmError extends Error {
  constructor() { super('need_arm'); this.name = 'NeedArmError' }
}

/**
 * Survival re-arm — the B1 TALLY sink (Model C: session allowance).
 * `arm(cap)` is signed ONCE at run start (an EIP-2612 permit granting the backend
 * relay an allowance of `cap` TALLY). After that every `rearm()` spends against that
 * allowance with NO further signature — instant, non-custodial, TALLY flows straight
 * into the RewardPool. Mirrors the transfer-out permit primitive.
 */
export function useSurvivalRearm(walletAddress: string | undefined) {
  const config = useConfig()
  const walletClient = useActiveWalletClient()
  const { data: relayAddress } = useRelayAddress()
  const [pending, setPending] = useState(false)
  const [armed, setArmed] = useState(false)
  const [capG, setCapG] = useState(0)

  /** Sign one permit granting the relay an allowance of `cap` TALLY for this run. */
  const arm = async (cap: number): Promise<void> => {
    if (!walletAddress) throw new Error('Not signed in')
    if (!walletClient?.account) throw new Error('Wallet not connected')
    if (!relayAddress) throw new Error('Re-arm relay unavailable')
    if (!(cap > 0)) throw new Error('Pick an amount to arm')

    setPending(true)
    try {
      const value = parseUnits(cap.toString(), G_DECIMALS)
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 60) // 1h — covers a run

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
        message: { owner: walletAddress as `0x${string}`, spender: relayAddress, value, nonce, deadline },
      })

      const { v, r, s } = parseSignature(rawSig)

      const res = await fetch(`${API}/survival/arm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: walletAddress, cap_g: cap, deadline: Number(deadline), v: Number(v), r, s }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Arm failed' }))
        throw new Error((body.error as string) ?? 'Arm failed')
      }
      setArmed(true)
      setCapG(cap)
    } finally {
      setPending(false)
    }
  }

  /** Spend a re-arm against the armed allowance. No signature. Throws NeedArmError
   *  when the session cap is exhausted so the caller can prompt a fresh arm. */
  const rearm = async (action: RearmAction, wave: number): Promise<RearmResult> => {
    if (!walletAddress) throw new Error('Not signed in')
    setPending(true)
    try {
      const ref_id = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)
      const res = await fetch(`${API}/survival/rearm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: walletAddress, action, wave, ref_id }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 402 && body?.need_arm) {
        setArmed(false)
        throw new NeedArmError()
      }
      if (!res.ok) throw new Error((body?.error as string) ?? 'Re-arm failed')
      return { cost_g: body.cost_g ?? 0, remaining_allowance_g: body.remaining_allowance_g ?? 0 }
    } finally {
      setPending(false)
    }
  }

  return { arm, rearm, armed, capG, pending }
}
