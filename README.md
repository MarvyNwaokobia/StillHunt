# StillHunt

A Web3 **first-person tactical shooter** built on [GoodDollar](https://gooddollar.org) + [Celo](https://celo.org). One verified human. One warrior. Forever.

Players verify their identity via GoodDollar, pick a class + callsign, and drop into a solo campaign of first-person doorkicker operations — breach, clear, defend, rescue — across three theatres with escalating bosses. Every kill earns XP toward your rank; clearing an operation for the first time pays a one-time G$ bounty. An endless **Kill-House** and a ranked, seasonal **Gauntlet** feed a competitive economy where scarce G$ is earned from competition and spent on gear and survival — with no gas fees required.

**Live**: https://stillhunt.app
**API**: https://stillhunt-production.up.railway.app
**Contracts**: Celo Mainnet · [Celoscan](https://celoscan.io)

> The turn-based melee/stat-duel game StillHunt grew out of is preserved and fully playable at `/fight-legacy` — its engine code is untouched.

---

## Architecture

```
┌─────────────────────┐     ┌──────────────────────────┐     ┌────────────────┐
│   Next.js 15 App    │────▶│   Rust / Actix-web API   │────▶│  PostgreSQL    │
│   (Vercel)          │     │   (Railway, Docker)       │     │ (Railway PG)   │
└─────────────────────┘     └──────────────────────────┘     └────────────────┘
         │                              │
         │ Magic auth (deterministic    │ Celo RPC (forno.celo.org)
         │  wallet) + viem              │ GoodDollar SDK + Foundry contracts
         ▼                              ▼
   ┌───────────┐                 ┌─────────────────┐
   │ GoodDollar│                 │  Celo Mainnet   │
   │ Identity  │                 │  Smart Contracts│
   └───────────┘                 └─────────────────┘

   decay + reconcile crons → GitHub Actions (every 3h) → POST /decay/run, /battles/bounties/reconcile
```

| Layer | Stack |
|-------|-------|
| Frontend | Next.js 15 App Router, Tailwind, Framer Motion, Three.js / React Three Fiber (the FPS scene) |
| Auth | [Magic](https://magic.link) (email + Google → deterministic wallet), viem (no wagmi connector) |
| Backend | Rust, Actix-web 4, SQLx, Tokio |
| Database | PostgreSQL on [Railway](https://railway.com) (Hobby, same project as the API — direct connection, no pooler). Local dev uses a separate Supabase sandbox. |
| Hosting | Vercel (frontend) + Railway (API + Postgres, Docker) + GitHub Actions (decay/reconcile crons) |
| Chain | Celo Mainnet (chainId 42220) |
| Identity | GoodDollar Citizen SDK (ERC-725 whitelist) |
| Contracts | Foundry (Forge), OpenZeppelin UUPS upgradeable, ERC1155 + ERC677 |

> The stack briefly ran on Render + Neon (mid-2026) but consolidated back onto a single Railway Hobby project (API + Postgres) — see [docs/RAILWAY_MIGRATION.md](docs/RAILWAY_MIGRATION.md). Money + identity are all on-chain, so no funds were ever at risk during platform moves; `scripts/reconstruct-players.mjs` can rebuild off-chain rows from on-chain `StillHuntRecord` events if ever needed.

---

## Smart Contracts (Celo Mainnet)

All contracts are UUPS upgradeable proxies, owned by the deployer EOA. Verified on Celoscan.

| Contract | Proxy Address | Purpose |
|----------|--------------|---------|
| `StillHuntArmory` | `0x3ba09c51895Dacb90273A2A40C95369a5A1b4bFe` | ERC1155 NFT — one token type per item |
| `StillHuntMarketplace` | `0x95D167f569cf05C967C0432e3123baeac5D8d78D` | G$ purchases via permit relay; mints item NFTs |
| `StillHuntRewardPool` | `0x12a3f711A55f4dB0e9AF26C7429cc5018401F1f4` | Holds G$; pays first-clear bounties + rank-up rewards + season payouts via `distributeReward(player, amount, ref)` (idempotent per `ref`, capped at `MAX_REWARD` 10,000 G$/call) |
| `StillHuntRewardPool` (Endless) | `0xd44D31645e3abBDc48a6Fc5E6E1bCd894db77Ba0` | Separate pool for Endless per-wave payouts (UUPS; fund + set `ENDLESS_REWARD_POOL_CONTRACT` to enable) |
| `StillHuntRecord` | `0xd4ec6dB553E206cdf741448F94bD3B02D81c8571` | Immutable on-chain log of battles, rank-ups, character claims |
| G$ SuperToken | `0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A` | GoodDollar token (ERC20 + EIP-2612 permit) |

### Gasless G$ flow (purchases, transfers, re-arm)

Players never need CELO. The pattern:

1. Frontend reads the player's current G$ permit nonce on-chain
2. Player **signs** an EIP-2612 permit off-chain (no gas)
3. Frontend sends `{ wallet, deadline, v, r, s }` to the backend relay
4. Backend submits the on-chain call, **paying CELO gas from the relayer wallet**, and records the result

Used for: marketplace `purchaseWithPermit`, player-to-player transfers (`permit` + `transferFrom`), and the Survival re-arm **session allowance** (one permit per run authorizes many instant re-arms). All signer transactions are serialized behind a nonce lock so concurrent writes can't collide.

### On-chain transaction surface

StillHunt writes to Celo mainnet constantly — every fight, rank-up, reward, purchase, transfer and re-arm is a real transaction. See **[docs/ONCHAIN_TRANSACTIONS.md](docs/ONCHAIN_TRANSACTIONS.md)** for the full catalog of what triggers a transaction, who pays gas, and the ideas for driving more on-chain volume.

---

## The Game (first-person build — live at `/fight`)

### Campaign

A solo, first-person doorkicker campaign: **15 operations across 3 zones** with a day → evening → night arc.

- **Ashfall** (warm day) → **Proving Ground** (golden evening) → **The Rift** (moonlit night, NVG earned)
- **Bosses** on op 5 / 10 / 15 — Cinder, the Warden, StillHunt — each escalating through 3 phases
- **Objective variety**, not 15 identical doorkickers: `reach` (breach/extract), `clear`, `defend` (hold a point while reinforcements trickle in), `rescue` (a hostage follows you out), plus a Rift **blackout** op (NVG jammed — fight by muzzle flash)
- **Weapons + loadout**: a 2-weapon loadout with per-weapon feel (sidearm / SMG / assault / marksman / legendary), fire modes (semi/burst/auto), swap
- **Attachments** (toggleable): NVG, laser, flashlight, optic
- Per-weapon fire audio + per-zone ambience; full VO presence lines; N8AO + set-dressing environment art

### Survival & the Gauntlet

- **Kill-House** (Survival) — an always-open practice arena of escalating waves. No stakes.
- **Gauntlet** — the ranked, prestige tier, **unlocked at campaign completion** (`pve_level >= 15`). A steeper curve, and its runs are **server-validated** (a run token + elapsed-time check reject impossible scores) onto the **seasonal leaderboard** that pays out G$.

### Ranks & XP (the progression loop)

`Iron → Bronze → Silver → Gold → Platinum → Emerald → Diamond` → **prestige** (Diamond I, II, III… uncapped).

Every kill earns XP (headshots worth more); the in-game rank bar reflects your **real server account** (seeded from `pve_level`/rank, not a local counter). The curve is **progressive**, not flat: each rank-up costs more than the last (`RANK_STEP_XP` = 400 / 900 / 1,300 / 2,500 / 4,500 / 8,000; every prestige past Diamond is a flat 8,000). Calibrated so Bronze lands in the first session and one full campaign clear (~2,610 XP) lands Gold.

Ranking up **does** pay G$, and it **grows** with the rank: the Nth rank-up pays `500 × N` (Bronze 500 → Silver 1,000 → … → Diamond 3,000), idempotent per `(wallet, rank)` on-chain and clamped to the 10,000 G$ per-call cap. Rank is also recorded on-chain (`recordRankUp`) and enrolls you in the rank pool.

### Character classes

Classes (**Berserker / Sentinel / Phantom**) are the player's chosen identity, set once at onboarding (permanent; callsign is editable). Their stat-duel special abilities live in the preserved legacy game at `/fight-legacy`.

---

## The Economy (earn loop)

**Principle: XP ≠ G$.** XP is infinite progression; G$ is scarce, earned from competition + spent in sinks.

| | Flow | Detail |
|---|------|--------|
| **In · first-clear bounty** (B0) | on-chain | Clearing a Campaign op the first time pays a one-time, capped G$ bounty (ordinary 2 G$; bosses op 5/10/15 pay 10/15/25). Idempotent in DB (`first_clear_bounties` PK) **and** on-chain (`ref` guard). A cron reconciles any failed payout. |
| **In · rank-up reward** | on-chain | Every rank-up pays `500 × ordinal` G$ (Bronze 500 … Diamond 3,000), from the RewardPool, idempotent per `(wallet, rank)`. |
| **In · Endless per-wave** | on-chain | Every Endless wave cleared pays G$ directly (banded `500 × ceil(wave/4)`: waves 1–4 → 500 each, 5–8 → 1,000 …). Server owns the wave count; a min-seconds-per-wave floor blocks machine-speed spam. Paid from the **Endless pool** (own contract, own ref guard). |
| **In · daily UBI** | GoodDollar | The Daily Check-In claims GoodDollar UBI (5 G$/day) straight from the protocol. (StillHunt's `/daily-claim` endpoint only records the cooldown; the UBI itself is a protocol tx.) |
| **In · season payout** (B3) | on-chain | At season close an admin computes the top Gauntlet runs in the window and distributes a top-heavy split of the prize pool via the RewardPool. |
| **Out · marketplace** (B1) | on-chain | Buy guns / ammo / attachments / cosmetics with G$, gasless via permit relay. |
| **Out · Survival re-arm** (B1) | on-chain | Mid-run **revive / resupply / wave-skip** for G$. One permit per run grants a spending cap (session allowance); re-arms are instant + non-custodial; spent G$ flows into the RewardPool (refilling the prize pool). *Disabled in the ranked Gauntlet — pure skill.* |

**Seasons** (`seasons` table + `prize_pool_g`): the Gauntlet leaderboard is the flagship metric; `GET /seasons/current` surfaces the live pool + each rank's estimated payout; the payout job settles winners on-chain at close.

---

## Local Development

### Prerequisites

- Node.js 22+
- Rust 1.80+ (`rustup update stable`)
- Foundry (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)
- PostgreSQL 15+ (or a Railway / Supabase project) + `psql`

### 1. Clone and install

```bash
git clone https://github.com/MarvyNwaokobia/StillHunt.git
cd StillHunt
npm install
```

### 2. Set up the API

```bash
cd apps/api
cp .env.example .env            # fill in DATABASE_URL, BACKEND_PRIVATE_KEY, contracts…
psql "$DATABASE_URL" < migrations/init.sql   # then the rest, in order (see Deployment)
cargo run                        # http://localhost:8080
```

### 3. Set up the frontend

```bash
cd apps/web
cp .env.local.example .env.local   # fill in NEXT_PUBLIC_* (Magic key, API URL, contracts…)
npm run dev                        # http://localhost:3000  (the FPS sandbox is /dev/verb)
```

### 4. Contracts (optional — mainnet contracts are already deployed)

```bash
cd contracts
forge build && forge test
```

### Tests / verification

- Web engine unit tests: `cd apps/web && npx vitest run src/engine`
- Runtime probes (Playwright vs a dev server): `apps/web/probe-*.mjs`
- API tests: `cd apps/api && cargo test`

---

## Environment Variables

### `apps/web/.env.local`

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_MAGIC_API_KEY` | ✅ | Magic publishable key — email + Google login → deterministic wallet |
| `NEXT_PUBLIC_API_URL` | ✅ | Backend API base URL (the Railway URL in prod) |
| `NEXT_PUBLIC_GOODDOLLAR_ENV` | ✅ | `production` or `staging` |
| `NEXT_PUBLIC_MARKETPLACE_CONTRACT` | ✅ | `StillHuntMarketplace` proxy address |
| `NEXT_PUBLIC_RELAY_ADDRESS` | ✅ | Backend relayer / signer public address |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | — | WalletConnect project id |
| `NEXT_PUBLIC_RANK_POOL_{SILVER,GOLD,PLATINUM,EMERALD,DIAMOND}` | — | GoodCollective UBI pool addresses for rank enrollment |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | — | Local dev sandbox only |

> Runtime URLs (share links, auth redirect, verify callback) are all built from `window.location.origin`, so they follow the custom domain automatically — no per-domain config in the frontend.

### `apps/api/.env` (and Railway env in prod)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | Postgres connection string. In prod: Railway Postgres (a **direct** connection — no pooler, so no SQLx pooler workarounds needed). |
| `BACKEND_PRIVATE_KEY` | ✅ | Relayer wallet key — pays CELO gas + is the RewardPool `backendSigner` |
| `GAME_RECORD_CONTRACT` | ✅ | `StillHuntRecord` proxy — on-chain battle/rank logging |
| `MARKETPLACE_CONTRACT` | ✅ | `StillHuntMarketplace` proxy — gasless purchase relay |
| `REWARD_POOL_CONTRACT` | ✅ | `StillHuntRewardPool` proxy — first-clear bounties + season payouts (**no code fallback: unset = silent failed payouts**) |
| `ENDLESS_REWARD_POOL_CONTRACT` | — | Separate `StillHuntRewardPool` for Endless per-wave payouts, so survival grinding can't starve rank-up/bounty G$. Unset = Endless falls back to `REWARD_POOL_CONTRACT` |
| `ENDLESS_MIN_SECS_PER_WAVE` | — | Min real seconds per Endless wave (default 6) — the anti-script timing floor |
| `ENDLESS_WEEKLY_CAP_G` | — | Per-player weekly Endless G$ cap (default 0 = no cap) |
| `ENDLESS_POOL_WARN_G` | — | Log a low-balance warning when the Endless pool drops below this (default 10000) |
| `CELO_RPC_URL` | ✅ | Celo RPC (default `https://forno.celo.org`) |
| `RELAY_ADDRESS` | ✅ | Public address of `BACKEND_PRIVATE_KEY` |
| `DECAY_CRON_SECRET` | ✅ | Shared `x-cron-secret` for `/decay/run` + `/battles/bounties/reconcile` |
| `FRONTEND_ORIGIN` | ✅ | Comma-separated CORS origins (`https://stillhunt.app,https://stillhunt.vercel.app`) |
| `BIND_ADDR` | — | Bind address (default `0.0.0.0:8080`; Railway targets 8080 via the Dockerfile `EXPOSE`, so leave it at the default) |
| `RANK_POOL_{SILVER,GOLD,PLATINUM,EMERALD,DIAMOND}` | — | GoodCollective UBI pool addresses |
| `G_TOKEN_CONTRACT` | — | G$ SuperToken (defaults to the known mainnet address) |
| `ADMIN_WALLETS` | — | Comma-separated wallets allowed to sign into `/admin` |
| `ADMIN_JWT_SECRET` | — | Signing secret for admin session tokens |
| `RUST_LOG` | — | Log level (default `info`) |

### `contracts/.env`

| Variable | Required | Description |
|----------|----------|-------------|
| `DEPLOYER_PRIVATE_KEY` | Deploy only | Wallet with CELO for gas (prefixed `0x`) |
| `BACKEND_SIGNER_ADDRESS` | Deploy only | Address of `BACKEND_PRIVATE_KEY` |
| `REWARD_POOL_CONTRACT` | Upgrade | Proxy address for upgrade scripts |
| `CELO_RPC_URL` / `CELOSCAN_API_KEY` | Deploy only | RPC + Celoscan verification |

---

## API Reference

### Players & Bank

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/players` | Create player (username + class, auto-confirmed for new wallets) |
| `GET` | `/players` · `/players/search?q=` · `/players/:wallet` | List / search / get |
| `PATCH` | `/players/:wallet` | Update callsign / class / customization / confirm flag |
| `GET`/`PATCH` | `/players/:wallet/inventory[/:itemId]` | Inventory + equip toggle |
| `GET` | `/players/:wallet/battles` · `/achievements` · `/daily-claim-status` | Reads |
| `POST` | `/players/:wallet/daily-claim` · `/decay-check` · `/freeze-decay` | Actions |
| `GET` | `/players/:wallet/ledger-summary` | G$ earned/spent breakdown (Bank page) |
| `POST` | `/players/:wallet/transfer` | Transfer G$ to any wallet (player-signed permit, relayed) |
| `GET` | `/relay-address` | Backend relay wallet address (the permit `spender`) |

### Battles & economy

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/battles/fight/complete` | Finalize a fight/op — server XP → rank; first clear advances `pve_level` + pays the bounty |
| `POST` | `/battles/pvp/complete` · `/battles/bot/*` · `/battles/challenge` | PvP / bot / async challenge |
| `POST` | `/battles/bounties/reconcile` | Cron: re-attempt failed first-clear bounties (idempotent) |
| `POST` | `/survival/arm` | Grant a per-run G$ spending allowance (one signed permit) |
| `POST` | `/survival/rearm` | Spend a re-arm (revive / restock / waveskip) against the allowance |
| `POST` | `/gauntlet/start` · `/gauntlet/submit` | Issue a run token / submit a validated run |
| `GET` | `/gauntlet/leaderboard?scope=weekly` | Best-per-wallet Gauntlet board |
| `GET` | `/seasons/current` | Live season: prize pool + windowed leaderboard + est payout per rank |
| `GET`/`POST` | `/endless/leaderboard` · `/endless/score` | Casual endless board |

### Items, identity, admin

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/items` | Marketplace items |
| `POST` | `/items/:id/purchase-relay` | Gasless purchase (EIP-2612 permit relay) |
| `POST` | `/rewards/sign-claim` · `GET /identity/verify/:wallet` | GoodDollar AppClaim signing / identity status |
| `POST` | `/decay/run` | Decay sweep (cron, `x-cron-secret`) · `GET /health` |
| `POST` | `/admin/login` | Wallet-signature login → short-lived admin JWT (`ADMIN_WALLETS`) |
| `GET`/`POST` | `/admin/seasons[...]` | List / create / `:id/end` / `:id/fund {prize_pool_g}` / `:id/payout` (all admin-bearer) |
| `WS` | `/ws/battle` | Live PvP battle channel |

---

## Deployment

### Frontend (Vercel)

Auto-deploys on push to `main`. Set all `NEXT_PUBLIC_*` in the Vercel dashboard. Custom domain **`stillhunt.app`** is primary (`stillhunt.vercel.app` 308-redirects to it). New domains must be added to the API's **`FRONTEND_ORIGIN`** (CORS, in the Railway env) and the **Magic allowlist** (origins + `/auth/callback`).

### API (Railway, Docker)

A Railway service (root directory `apps/api`) builds `apps/api/Dockerfile` and auto-deploys on push to `main`. Health check `/health`; the app binds `0.0.0.0:8080` and Railway auto-targets 8080 via the Dockerfile `EXPOSE`. Railway Hobby doesn't sleep, so there's no cold-start wait. The API and Postgres live in the **same Railway project** (`FRONTEND_ORIGIN` is the main env that changes per environment; `DATABASE_URL` is provided by the Postgres service). Public URL: `https://stillhunt-production.up.railway.app`.

### Database (Railway Postgres) — bootstrap + migrations

Prod Postgres runs in the same Railway project as the API (direct connection, no pooler). **Migrations apply automatically on API startup** (`apps/api/src/migrate.rs` — a run-once `_schema_migrations` table, embedded `.sql` files, `init.sql` first). To bootstrap a brand-new empty DB out-of-band you can still run them in order via `scripts/bootstrap-db.mjs` (works against any `DATABASE_URL`; run from repo root after `npm i pg --no-save`, with `DATABASE_URL` set to the Railway Postgres connection string):

```
init.sql → 004_guns → 005_pve_level → 006_endless → 007_remove_melee_items →
008_ammo_attachments → add_chain_tx_columns → fix_decimal_columns →
add_gdollar_ledger → add_first_clear_bounties → add_character_confirmed →
add_survival_rearms → add_survival_runs → add_season_payouts
```

`scripts/reconstruct-players.mjs` rebuilds `players` rows from on-chain `StillHuntRecord` events if off-chain data is ever lost.

### Crons (GitHub Actions)

`.github/workflows/decay-cron.yml` runs every 3h, hitting `POST /decay/run` and `POST /battles/bounties/reconcile` with `x-cron-secret`. Requires repo secrets `API_URL` + `DECAY_CRON_SECRET`.

### Contracts

```bash
cd contracts && source .env
forge script script/Deploy.s.sol --rpc-url $CELO_RPC_URL --broadcast --verify --etherscan-api-key $CELOSCAN_API_KEY
forge script script/Setup.s.sol --rpc-url $CELO_RPC_URL --broadcast   # register + list items
forge script script/UpgradeRewardPool.s.sol --rpc-url $CELO_RPC_URL --broadcast --verify   # adds distributeReward
```

New items must be registered on-chain (`StillHuntArmory` + `StillHuntMarketplace`) before they appear in the UI. Fund `StillHuntRewardPool` with G$ so bounties + payouts can pay.

---

## Project Structure

```
StillHunt/
├── apps/
│   ├── web/                      # Next.js 15 frontend (Vercel)
│   │   └── src/
│   │       ├── app/              # App Router (fight/, dev/verb sandbox, auth/callback, admin, bank…)
│   │       ├── engine/
│   │       │   ├── fps/          # Headless FPS sim: FpsSim, campaign (15 ops + survival + gauntlet), xp
│   │       │   ├── scene/        # the R3F game scene, operator rigs, set dressing
│   │       │   ├── audio/        # FpsAudio director
│   │       │   └── story/        # VO presence lines
│   │       ├── components/       # battle/ (OperationsSelect…), marketplace/, player-card/, ui/, providers/
│   │       ├── hooks/            # useSurvivalRearm, useGauntlet, useFightRewards, useMarketplace, useTransferOut…
│   │       ├── stores/ lib/ types/
│   └── api/                      # Rust / Actix-web backend (Railway)
│       └── src/handlers/         # players, battles, survival, gauntlet, seasons, items, admin, decay, ledger…
│       └── migrations/           # SQL migrations
├── contracts/                    # Foundry: StillHuntArmory / Marketplace / RewardPool / GameRecord
├── docs/                         # B0_ECONOMY_DEPLOY, C5_SHIP_GATE, GAME_DESIGN…
└── scripts/                      # bootstrap-db.mjs, reconstruct-players.mjs, generate-vo.mjs…
```

---

## License

MIT
