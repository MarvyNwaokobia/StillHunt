// Registry for the EIP-1193 provider of whichever embedded-wallet SDK is live.
//
// Embedded-wallet SDKs (Magic today; a second provider later) each expose their
// own EIP-1193 provider and their own async "am I logged in yet" state. Wiring
// one of those into a wagmi connector means a shim has to guess when the SDK's
// state is settled, and guessing wrong is what broke the old Web3Auth bridge.
//
// So we don't. Each SDK publishes its provider here once it has genuinely
// resolved an address, and `useActiveWalletClient` builds a plain viem
// WalletClient straight off it. wagmi stays in charge of exactly one thing:
// externally-connected wallets through its own first-party connectors.
//
// Adding a second SDK means calling `setBridgedProvider` from its provider
// component. Nothing downstream changes.

import type { EIP1193Provider } from 'viem'

/** Which SDK published the current provider. Used to scope clears. */
export type BridgeSource = 'magic' | 'web3auth'

interface BridgeEntry {
  source: BridgeSource
  provider: EIP1193Provider
  address: `0x${string}`
}

let current: BridgeEntry | null = null

/**
 * Publish the active embedded wallet. Call only once the SDK has resolved a
 * real address — publishing early is the race the old bridge died on.
 */
export function setBridgedProvider(
  source: BridgeSource,
  provider: EIP1193Provider,
  address: `0x${string}`,
): void {
  current = { source, provider, address }
}

/**
 * Retract a provider. Scoped to the publisher so that with two SDKs mounted,
 * one signing out can never clear the other's live session.
 */
export function clearBridgedProvider(source: BridgeSource): void {
  if (current?.source === source) current = null
}

export function getBridgedProvider(): BridgeEntry | null {
  return current
}
