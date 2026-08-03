// Mobile external-wallet connect.
//
// This is how StillHunt connects external wallets on mobile, now that we no longer
// run a WalletConnect connector of our own. WalletConnect proved unusable for
// this: its pairing relay (`relay.walletconnect.*`) is unreachable on many
// carrier/ISP resolvers, and proxying the relay only fixes OUR browser's leg —
// the wallet app still opens its own socket to the real relay and hangs on
// "Connecting…". See lib/wagmi.ts.
//
// Deep-linking the user INTO their wallet's built-in dApp browser has none of
// that failure surface. There the wallet injects `window.ethereum`, so the
// plain `injected` connector connects in one tap with no relay, no cloud
// project, and no domain allowlist in the loop. Desktop (extension present)
// and in-wallet-browser sessions already have an injected provider and never
// reach this path.

export function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
    navigator.userAgent,
  )
}

export function hasInjectedProvider(): boolean {
  return typeof window !== 'undefined' && !!(window as { ethereum?: unknown }).ethereum
}

export interface MobileWalletLink {
  id: string
  name: string
  /** Deep link that re-opens THIS page inside the wallet's dApp browser. */
  build: () => string
}

// `location` is read at click time so the link always carries the live host,
// path, and query (share tokens, ?level=, etc.).
function dappHostPath(): string {
  const { host, pathname, search } = window.location
  return `${host}${pathname}${search}`
}
function dappUrl(): string {
  return window.location.href
}

export const MOBILE_WALLETS: MobileWalletLink[] = [
  {
    id: 'metamask',
    name: 'MetaMask',
    // https://metamask.app.link/dapp/<host+path> opens the URL in MM's browser
    // (or routes to the App/Play store if MetaMask isn't installed).
    build: () => `https://metamask.app.link/dapp/${dappHostPath()}`,
  },
  {
    id: 'coinbase',
    name: 'Coinbase Wallet',
    build: () => `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(dappUrl())}`,
  },
  {
    id: 'trust',
    name: 'Trust Wallet',
    build: () => `https://link.trustwallet.com/open_url?coin_id=52752&url=${encodeURIComponent(dappUrl())}`,
  },
]
