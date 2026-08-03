import { WEB3AUTH_NETWORK } from '@web3auth/modal'
import type { Web3AuthContextConfig } from '@web3auth/modal/react'
import { CELO_CHAIN_ID } from '@/lib/magic'

// Web3Auth is StillHunt's EXTERNAL-WALLET connector, and nothing else.
//
// Sign-in identity stays exactly where it was: Magic owns email and Google, and
// every wallet StillHunt mints is a Magic wallet. Web3Auth is here only to answer
// "I already have a wallet, let me connect it" — the path we used to serve with
// a self-hosted WalletConnect connector, which broke constantly because we owned
// the relay host, the cloud project, and the domain allowlist (see lib/wagmi.ts).
// Web3Auth runs all of that as managed infrastructure.
//
// Keeping it to wallets-only is the whole safety argument. Web3Auth's social
// logins would mint NEW embedded wallets, so the same person signing in with
// Google via Magic and via Web3Auth would end up holding two different
// addresses — which orphans their rank, items and G$, and is the exact pattern
// behind the GoodDollar one-face dedup that un-whitelisted ~44% of our wallets
// (see apps/api/migrations/add_magic_identity.sql). An external wallet has no
// such problem: the address belongs to the player already and we only ever read
// it. So the whole `auth` connector is switched off, leaving wallet discovery.
//
// This is one connector-level flag rather than a list of hidden login methods
// on purpose. Enumerating them means naming every provider the SDK supports,
// and the modal THROWS on a name it doesn't recognise ("Invalid auth
// connection: farcaster") — which aborts init and silently disables the connect
// button. Its accepted list also differs from the one the SDK exports and is
// not public (it lives in @web3auth/modal .../modal/src/ui/config.js), so any
// hardcoded list is a version-coupled trap. Switching the connector off needs
// no names at all.

export const web3AuthContextConfig: Web3AuthContextConfig = {
  web3AuthOptions: {
    clientId: process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID ?? '',
    web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
    // Celo mainnet only, matching Magic — there is no "wrong network" state to
    // handle, so a connected wallet is either on Celo or gets switched to it.
    chains: [
      {
        chainNamespace: 'eip155',
        chainId: `0x${CELO_CHAIN_ID.toString(16)}`,
        rpcTarget: process.env.NEXT_PUBLIC_CELO_RPC_URL ?? 'https://forno.celo.org',
        displayName: 'Celo Mainnet',
        ticker: 'CELO',
        tickerName: 'Celo',
        blockExplorerUrl: 'https://celoscan.io',
        logo: 'https://cryptologos.cc/logos/celo-celo-logo.png',
      },
    ],
    defaultChainId: `0x${CELO_CHAIN_ID.toString(16)}`,
    modalConfig: {
      connectors: {
        auth: { label: 'auth', showOnModal: false },
      },
    },
  },
}

export const isWeb3AuthConfigured = Boolean(process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID)
