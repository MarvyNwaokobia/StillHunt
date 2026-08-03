'use client'

import { useMemo } from 'react'
import { createWalletClient, custom, type WalletClient } from 'viem'
import { CHAIN } from '@/config/chain'
import { useWalletClient as useWagmiWalletClient } from 'wagmi'
import { getBridgedProvider } from '@/lib/walletBridge'
import { useResolvedAuth } from './useResolvedAuth'

// The one seam every signing path goes through. Returns a plain viem
// WalletClient for whichever auth path is active, so call sites can use
// signTypedData / writeContract / signMessage without knowing or caring which
// SDK is behind the wallet.
//
// - External wallet via wagmi's injected connector: wagmi's own
//   useWalletClient. Safe because it's wagmi's native connector talking
//   straight to the wallet.
// - Anything else: built from whatever provider is published to
//   lib/walletBridge — Magic's embedded wallet, or an external wallet connected
//   through Web3Auth's chooser (wagmi registers no connector for that one, so
//   it can only be reached through the bridge).
//
// Adding another SDK later means publishing to the bridge from its provider
// component; this hook and all ten of its call sites stay untouched.
export function useActiveWalletClient(): WalletClient | undefined {
  const { status, address, source } = useResolvedAuth()
  const { data: wagmiWalletClient } = useWagmiWalletClient()

  return useMemo(() => {
    if (status !== 'ready' || !address) return undefined
    // A 'wallet' source is wagmi's only when wagmi actually holds the
    // connection; a Web3Auth-connected wallet reports the same source but falls
    // through to the bridge below.
    if (source === 'wallet' && wagmiWalletClient) return wagmiWalletClient

    const bridged = getBridgedProvider()
    if (!bridged) return undefined
    // The bridge publishes provider and address together, so the account here
    // can never drift from the session the provider will actually sign with.
    return createWalletClient({
      account: bridged.address,
      chain: CHAIN,
      transport: custom(bridged.provider),
    })
  }, [status, address, source, wagmiWalletClient])
}
