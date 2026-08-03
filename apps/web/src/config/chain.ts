/**
 * @module config/chain
 * @description The one chain StillHunt runs on, and everything that follows from it.
 *
 * StillHunt is a SINGLE-CHAIN game. That is a design decision, not an omission, and
 * it is why this module is ~120 lines where a multi-chain equivalent is a directory:
 * every "which chain is this?" branch a second chain would force is a branch that can
 * be wrong at runtime, and the ones that go wrong quietly are the expensive ones — a
 * permit signed against the wrong domain verifies in the browser and reverts on-chain,
 * telling you nothing.
 *
 * DEPLOY TARGET: Avalanche C-Chain (43114).
 *
 * The alternative was a custom Avalanche L1, which gives free gas in a token we mint
 * and would remove the single most repeated production failure in a game like this —
 * the relay wallet running out of gas mid-session, which stops payouts with no player-
 * visible cause. It was set aside because an L1 needs validators, its own RPC servers,
 * an explorer and a chain id, which is weeks, and the C-Chain already exists.
 *
 * That decision is meant to be revisited, so this module is the ONLY place a chain is
 * named. Moving to an L1 means editing `CHAIN` below and redeploying the contracts —
 * not hunting through call sites. Nothing outside this file may import a chain from
 * `viem/chains` or write a chain id inline; that rule is what keeps the migration a
 * config edit instead of an archaeology project.
 */

import { avalanche, type Chain } from 'viem/chains'

/** The viem chain StillHunt transacts on. The single source of truth. */
export const CHAIN: Chain = avalanche

export const CHAIN_ID = CHAIN.id

/**
 * Read RPC. Writes go through whatever wallet the player signed in with.
 *
 * Overridable because public endpoints rate-limit, and the failure that causes is
 * indistinguishable from the app being broken.
 */
export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ??
  CHAIN.rpcUrls.default.http[0]

/**
 * TALLY — what players earn and spend.
 *
 * NOT REDEEMABLE, and that is load-bearing rather than a limitation. There is no
 * proof-of-unique-human available on Avalanche, so if TALLY could be sold for AVAX,
 * one person farming fifty wallets would be worth doing on day one. Because it cannot
 * be sold, it is not worth doing, and StillHunt needs no identity gate to ship.
 *
 * Real value still moves — through duels and marketplace resale, player to player,
 * with a house cut. That is value CIRCULATING rather than value ISSUED, so there is no
 * faucet to drain and no reward pool to keep funded.
 *
 * Opening a TALLY exit later means funding it from that house-cut revenue, never from
 * minted supply, and putting an identity gate in front of it. See the same rule held
 * server-side, where it actually binds.
 */
export const CURRENCY = {
  symbol: 'TALLY',
  name: 'Tally',
  decimals: 18,
  /** Set once the token is deployed. `null` disables every spend path rather than
   *  falling back to an address that holds no code. */
  address: (process.env.NEXT_PUBLIC_TALLY_ADDRESS ?? null) as `0x${string}` | null,
  redeemable: false,
  /**
   * EIP-712 domain for this token's `permit`, from `ERC20Permit("Tally")`.
   *
   * A property of the TOKEN, not the chain. Copying another token's domain produces a
   * signature that verifies locally and reverts on-chain, which is the worst class of
   * bug to chase — so this is pinned here and asserted by a test.
   */
  permit: { name: 'Tally', version: '1' },
} as const

/** StillHunt's own deployed contracts. `null` means "not deployed yet", and every
 *  caller must disable the feature rather than substitute an address. */
export const CONTRACTS = {
  marketplace: (process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS ?? null) as `0x${string}` | null,
  gameRecord: (process.env.NEXT_PUBLIC_GAME_RECORD_ADDRESS ?? null) as `0x${string}` | null,
  duels: (process.env.NEXT_PUBLIC_DUELS_ADDRESS ?? null) as `0x${string}` | null,
} as const

/**
 * What the client renders. The SERVER is the authority on anything that moves value —
 * a browser claiming a feature is on must never be able to unlock a payout.
 */
export const FEATURES = {
  campaign: true,
  endless: true,
  /** Endless is not gated behind clearing the campaign. Players who arrive with three
   *  spare minutes should not have to finish 15 operations to reach the mode built
   *  for them. */
  endlessRequiresCampaignClear: false,
  marketplace: true,
  duels: true,
  postProcessing: true,
  cinematics: true,
} as const

/**
 * A block-explorer link for a transaction.
 *
 * Returns `null` when there is no known explorer, so callers render nothing rather
 * than a dead link. Also correct for the placeholder hashes stored against off-chain
 * items (`offchain-{id}`), which callers filter with the `0x` check they already do.
 */
export function explorerTxUrl(txHash: string): string | null {
  const url = CHAIN.blockExplorers?.default?.url
  return url ? `${url.replace(/\/$/, '')}/tx/${txHash}` : null
}

/**
 * The EIP-712 domain for TALLY's `permit`, or `null` before the token is deployed.
 *
 * Callers must treat `null` as "cannot sign a permit here" and take a non-signature
 * path. Substituting a guessed domain costs the player a signature and then reverts.
 */
export function permitDomain(): {
  name: string
  version: string
  chainId: number
  verifyingContract: `0x${string}`
} | null {
  if (!CURRENCY.address) return null
  return {
    name: CURRENCY.permit.name,
    version: CURRENCY.permit.version,
    chainId: CHAIN_ID,
    // The token's OWN address, never a copy.
    verifyingContract: CURRENCY.address,
  }
}

/** TALLY's address, or a thrown error naming the reason. For call sites with no
 *  meaningful fallback — failing loudly surfaces as a bug report rather than a
 *  mysterious failed transaction. */
export function requireCurrencyAddress(): `0x${string}` {
  if (!CURRENCY.address) {
    throw new Error('TALLY is not deployed yet, so nothing can be bought or spent.')
  }
  return CURRENCY.address
}

/** The marketplace address, or a thrown error. */
export function requireMarketplaceAddress(): `0x${string}` {
  if (!CONTRACTS.marketplace) {
    throw new Error('The marketplace is not deployed yet, so buying is unavailable.')
  }
  return CONTRACTS.marketplace
}

/** `permitDomain()` or a thrown error, for the signing hooks. */
export function requirePermitDomain(): NonNullable<ReturnType<typeof permitDomain>> {
  const domain = permitDomain()
  if (!domain) {
    throw new Error(
      'TALLY is not deployed yet, so this action cannot be signed.',
    )
  }
  return domain
}
