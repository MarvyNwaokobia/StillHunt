import { describe, expect, it } from 'vitest'
import { avalanche } from 'viem/chains'
import {
  CHAIN,
  CHAIN_ID,
  CURRENCY,
  FEATURES,
  explorerTxUrl,
  permitDomain,
  requireCurrencyAddress,
  requireMarketplaceAddress,
} from './chain'

describe('the chain StillHunt runs on', () => {
  it('is Avalanche C-Chain', () => {
    expect(CHAIN).toBe(avalanche)
    expect(CHAIN_ID).toBe(43114)
  })

  it('is never Fuji', () => {
    // Testnet money is not money. A build that quietly points at 43113 would let
    // every balance and price in the UI read as real.
    expect(CHAIN_ID).not.toBe(43113)
  })

  it('links transactions to Snowtrace', () => {
    const url = explorerTxUrl('0xabc')
    expect(url).toContain('0xabc')
    expect(url).toMatch(/^https:\/\//)
  })
})

describe('TALLY', () => {
  it('is the currency, at 18 decimals', () => {
    expect(CURRENCY.symbol).toBe('TALLY')
    expect(CURRENCY.decimals).toBe(18)
  })

  // The load-bearing one. TALLY has no exit, which is the entire reason StillHunt
  // needs no proof-of-unique-human to launch. If this ever flips, a sybil answer
  // had better be shipping in the same commit.
  it('is not redeemable', () => {
    expect(CURRENCY.redeemable).toBe(false)
  })

  it('signs under its OWN EIP-712 domain', () => {
    // A domain copied from another token produces a signature that verifies in
    // the browser and reverts on-chain — the worst class of bug to chase. Pinned
    // to exactly what `ERC20Permit("Tally")` produces in Tally.sol.
    expect(CURRENCY.permit).toEqual({ name: 'Tally', version: '1' })
  })
})

describe('deployment guards', () => {
  const deployed = CURRENCY.address !== null

  it('either resolves a permit domain or refuses to build one', () => {
    const domain = permitDomain()
    if (!deployed) {
      // Never guess. A null address must not become a domain naming address(0).
      expect(domain).toBeNull()
      return
    }
    expect(domain).toEqual({
      name: 'Tally',
      version: '1',
      chainId: 43114,
      verifyingContract: CURRENCY.address,
    })
  })

  it('throws rather than returning a placeholder address', () => {
    if (deployed) {
      expect(requireCurrencyAddress()).toBe(CURRENCY.address)
      return
    }
    // The failure has to be loud. Returning a zero address here would send a
    // transaction to an address holding no code and read as "the app is broken".
    expect(() => requireCurrencyAddress()).toThrow(/not deployed/i)
    expect(() => requireMarketplaceAddress()).toThrow(/not deployed/i)
  })
})

describe('features', () => {
  it('opens Endless without demanding a campaign clear first', () => {
    // Players arriving with three spare minutes should not have to finish 15
    // contracts to reach the mode built for them.
    expect(FEATURES.endlessRequiresCampaignClear).toBe(false)
  })

  it('ships duels — the surface the economy runs on', () => {
    expect(FEATURES.duels).toBe(true)
  })
})
