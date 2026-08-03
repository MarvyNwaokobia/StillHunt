# StillHunt — Frontend

Next.js 15 App Router frontend for [StillHunt](https://stillhunt.app), a Web3 first-person tactical shooter on GoodDollar + Celo. The live game is the first-person build (`/fight`, sandbox at `/dev/verb`); the legacy melee game is at `/fight-legacy`.

## Stack

| | |
|--|--|
| Framework | Next.js 15 (App Router) |
| Styling | Tailwind CSS v4 |
| Animation | Framer Motion |
| 3D | Three.js via React Three Fiber + Drei (the FPS scene) |
| Auth | [Magic](https://magic.link) (email + Google → deterministic wallet) |
| Wallet | viem for signing (no wagmi connector); wagmi hooks for reads |
| State | Zustand |
| Server state | TanStack Query v5 |
| Chain | Celo Mainnet (chainId 42220) |

## Getting started

```bash
cp .env.local.example .env.local
# Fill in all NEXT_PUBLIC_* values (see root README for the full list)

npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run lint
```

## Environment variables

All runtime config is via `NEXT_PUBLIC_*` env vars. See the root [`README.md`](../../README.md#environment-variables) for the complete reference. The minimum set to run locally:

```
NEXT_PUBLIC_MAGIC_API_KEY=
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_GOODDOLLAR_ENV=production
NEXT_PUBLIC_RELAY_ADDRESS=
NEXT_PUBLIC_MARKETPLACE_CONTRACT=0x95D167f569cf05C967C0432e3123baeac5D8d78D
NEXT_PUBLIC_WEB3AUTH_CLIENT_ID=
# local-dev sandbox DB only:
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## Key directories

```
src/
├── app/                  # Next.js App Router
│   ├── layout.tsx        # Root layout + providers
│   ├── page.tsx          # Landing / auth gate
│   ├── (game)/           # Authenticated game routes
│   │   ├── battle/
│   │   ├── profile/
│   │   ├── market/
│   │   └── ranks/
│   ├── providers.tsx     # Magic + viem/wagmi(reads) + react-query
│   └── app-init.tsx      # Player bootstrap on login
│
├── views/                # Page-level components
│   ├── BattlePage.tsx
│   ├── MarketplacePage.tsx
│   ├── ProfilePage.tsx
│   └── HomePage.tsx
│
├── components/
│   ├── battle/           # BattleArena, BattleScene (3D), BattlePvP, ImpactBurst, …
│   ├── marketplace/      # MarketplaceItem, LimitedItemBanner, MarketplaceGrid
│   ├── warrior/          # CharacterViewer (Three.js GLB), CharacterCard
│   ├── player-card/      # PlayerCard, XpMeter, RankBadge
│   ├── profile/          # ProfileCard, CustomizationModal
│   ├── landing/          # LandingPage
│   └── ui/               # SignInModal, RankAura, ErrorBoundary
│
├── hooks/
│   ├── useBattle.ts              # Battle state machine
│   ├── useMarketplace.ts         # Item list + EIP-2612 permit purchase relay
│   ├── useEngagementRewards.ts   # GoodDollar daily reward claiming
│   ├── useAchievements.ts
│   ├── useAudio.ts
│   ├── useCombatFeel.ts          # Screen shake, flash effects
│   └── useDecayStatus.ts
│
├── stores/
│   └── usePlayerStore.ts         # Zustand — player profile + inventory
│
├── lib/
│   ├── classes.ts                # Character class definitions + GLB paths
│   ├── constants.ts              # Addresses, XP values, rank colours
│   ├── gooddollar.ts             # GoodDollar SDK initialisation
│   ├── ranks.ts                  # Rank aura + visual definitions
│   └── magic.ts                  # Magic client + viem/wagmi read config
│
└── types/
    ├── database.ts               # Player, Item, InventoryItem, Battle types
    └── index.ts
```

## Purchase flow (gasless)

Players never need CELO. The in-game "Buy" button triggers:

1. Player clicks **Buy with G$** → **Confirm Purchase** modal opens
2. Player clicks **Confirm Purchase** → frontend reads the G$ permit nonce on-chain
3. Player signs an EIP-2612 permit (no CELO, no gas — just a signature)
4. Frontend POSTs `{ wallet, deadline, v, r, s }` to `/items/:id/purchase-relay`
5. Backend calls `StillHuntMarketplace.purchaseWithPermit(...)` — it pays the CELO gas
6. Contract verifies permit, pulls G$, mints the ERC1155 NFT
7. UI optimistically updates inventory

User rejections (cancelling the signature) close the modal silently with no error shown.

## 3D character display

Characters are rendered using Three.js via React Three Fiber in `CharacterViewer`. GLB files live in `public/characters/glb/`. On mobile Safari where WebGL can be unreliable, the component falls back to the character's portrait JPEG (`public/characters/classes/`).

## Deployment

Vercel deploys automatically on push to `main`. Set all `NEXT_PUBLIC_*` vars in the Vercel dashboard.
