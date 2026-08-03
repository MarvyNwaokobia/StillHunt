import { createConfig, fallback, http } from 'wagmi'
import { avalanche, celo, celoAlfajores } from 'wagmi/chains'
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
// Every chain ANY edition can run on, listed unconditionally rather than picked
// from the active edition. This config is built at module load, and resolving
// the edition there would read `window` during import — the server would build
// one chain list and the client another, which is exactly the hydration mismatch
// `ssr: true` below exists to avoid. Listing all of them costs a transport entry
// and keeps the config identical on both sides.
export const wagmiConfig = createConfig({
  chains: [celo, celoAlfajores, avalanche],
  connectors: [injected()],
  // Defer connector reconnection to a client effect instead of running it
  // during render, so the server HTML and first client render agree. The game
  // shell stays server-rendered; without this, wagmi reads persisted connection
  // state at render time and the tree can hydrate mismatched.
  ssr: true,
  transports: {
    // Reads go through a private RPC when one is configured and fall back to
    // public forno, so a single provider having a bad day doesn't take the
    // shop, balances, and claim checks down with it.
    [celo.id]: fallback([
      ...(process.env.NEXT_PUBLIC_CELO_RPC_URL
        ? [http(process.env.NEXT_PUBLIC_CELO_RPC_URL)]
        : []),
      http('https://forno.celo.org'),
    ]),
    [celoAlfajores.id]: http('https://alfajores-forno.celo-testnet.org'),
    // Present so the Avalanche edition has a working read path the day it is
    // switched on. No edition points at it yet.
    [avalanche.id]: http(
      process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL ?? 'https://api.avax.network/ext/bc/C/rpc',
    ),
  },
})
