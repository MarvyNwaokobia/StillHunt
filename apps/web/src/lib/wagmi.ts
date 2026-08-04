import { createConfig, fallback, http } from 'wagmi'
import { avalanche } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

// Primary login is Magic's embedded wallet, which deliberately does NOT go
// through a wagmi connector — it publishes its EIP-1193 provider to
// lib/walletBridge instead. wagmi's job here is only the separate "I already
// have a wallet" path.
//
// That path is `injected()` alone, on purpose. We used to also run a
// self-hosted `walletConnect()` connector, and every mobile connect bug we've
// had traced back to owning that integration: the pairing relay host getting
// sinkholed by consumer router/ISP resolvers (the endless "Connecting…" hang),
// the Reown Cloud domain allowlist rejecting pairings when `metadata.url`
// drifted, and relay-host pins that fixed our browser's leg while the wallet
// app still dialled the blocked host itself. None of it was ours to fix.
//
// `injected()` needs no relay, no cloud project, and no allowlist: it talks to
// a provider that is already in the page. Desktop extensions and in-wallet
// dApp browsers inject one; a plain mobile browser doesn't, so SignInModal
// deep-links those users into their wallet's own browser, where one exists.
// wagmi additionally auto-discovers named extensions via EIP-6963.
// One chain, listed unconditionally. This config is built at module load, so
// anything conditional here would read `window` during import and give the
// server one chain list and the client another — the exact hydration mismatch
// `ssr: true` below exists to avoid.
export const wagmiConfig = createConfig({
  chains: [avalanche],
  connectors: [injected()],
  // Defer connector reconnection to a client effect instead of running it
  // during render, so the server HTML and first client render agree. The game
  // shell stays server-rendered; without this, wagmi reads persisted connection
  // state at render time and the tree can hydrate mismatched.
  ssr: true,
  transports: {
    // A private RPC when one is configured, falling back to the public endpoint,
    // so one provider having a bad day does not take the shop, balances and
    // claim checks down with it.
    [avalanche.id]: fallback([
      ...(process.env.NEXT_PUBLIC_RPC_URL ? [http(process.env.NEXT_PUBLIC_RPC_URL)] : []),
      http('https://api.avax.network/ext/bc/C/rpc'),
    ]),
  },
})
