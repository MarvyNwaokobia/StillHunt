# StillHunt

A first-person tactical shooter that settles its economy on **Avalanche C-Chain**.

Sign in, claim a hunter, and drop into a solo campaign of first-person contracts —
breach, clear, defend, extract — across three zones with escalating bosses. Every
kill earns XP toward your rank; clearing a contract for the first time accrues
**TALLY**, which you claim on-chain when you want it. An endless survival mode and
staked one-on-one duels feed an economy where value moves between players rather
than being printed for them.

No identity check, no wallet funding, no gas. You log in and play.

**API**: https://stillhunt-api-production.up.railway.app
**Chain**: Avalanche C-Chain (43114) · [Snowtrace](https://snowtrace.io)

---

## Contracts

All live and verified. Full addresses and roles in
[contracts/DEPLOYMENTS.md](contracts/DEPLOYMENTS.md).

| Contract | Address | Purpose |
|---|---|---|
| `Tally` (TALLY) | [`0x6708…01e9`](https://snowtrace.io/address/0x670855698cf1137D01F83D6f058F8BC9A74f01e9) | ERC-20 + permit, 1B hard cap |
| `StillHuntArmory` | [`0xE32A…1831`](https://snowtrace.io/address/0xE32A9b1212259f37C2a04361456Fd91bE8bC1831) | ERC-1155 gear, one id per item |
| `StillHuntMarketplace` | [`0x105f…BE5c`](https://snowtrace.io/address/0x105f95c60958f1AaCE8750c5447f585050ABBE5c) | Shop + player resale |
| `StillHuntDuels` | [`0x87f5…2830`](https://snowtrace.io/address/0x87f5F346F09849404274DE01962C36667E2E2830) | Staked 1v1 escrow |
| `StillHuntRecord` | [`0x6D4e…8d3a`](https://snowtrace.io/address/0x6D4e61b683337b3C8Bd3A04738586aC1F86f8d3a) | Append-only match log |

**There is no reward pool, and that is the design.** The four game contracts are
UUPS proxies because rules change. `Tally` is deliberately **not** upgradeable: a
token whose rules the studio can rewrite is not a credible fixed supply, and the
cap is the main thing a player is asked to trust. Extending it does not need
upgradeability — new reward sources get minter rights, and a future redemption
path is a separate contract that burns TALLY.

---

## The economy

**TALLY is earned and spent, but not redeemable.** That is load-bearing rather
than a limitation. There is no proof-of-unique-human available on Avalanche, so a
sellable reward token would make farming fifty wallets worth doing on day one.
Because it cannot be sold, it is not worth doing, and StillHunt needs no identity
gate to launch.

Value still moves — it just **circulates instead of being issued**:

| | Flow |
|---|---|
| **In · first clear** | Clearing a contract the first time accrues TALLY. Once per (wallet, contract). |
| **In · rank up** | Crossing a rank accrues a bonus. Once per (wallet, rank). |
| **In · survival waves** | Each wave cleared accrues, capped weekly so a grinder cannot outpace the supply. |
| **Out · marketplace** | Buy gear with TALLY, gasless via a relayed permit. |
| **Out · re-arm** | Mid-run revive / resupply, debited from the accrued balance. Instant, no signature. |
| **Across · duels** | Two players stake, winner takes the pot minus a house cut. Nothing is minted. |
| **Across · resale** | Players sell gear to each other; the platform takes a fee. |

Rewards **accrue as a balance** and mint on claim, rather than being transferred
from a pool. That removes a whole class of failure: there is no pool to keep
funded, and no payout that can silently fail mid-session — only a claim that
either settles or visibly does not.

`StillHuntDuels` is where the economy actually lives, so its trust boundary is
narrow and tested. The resolver may say **who won** and nothing else: `settle()`
can only pay one of the two participants, stakes are fixed at `open()`, and after
two hours either player can refund both sides with **no resolver and no owner
involved**. A dead backend costs a delay, never a stake.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15, React 19, Three.js / React Three Fiber |
| Auth | Magic (email + Google → deterministic wallet), plus injected wallets |
| Backend | Rust, Actix-web 4, SQLx, Tokio |
| Database | PostgreSQL on Railway |
| Contracts | Foundry, OpenZeppelin, UUPS, ERC-1155 + ERC-20 permit |
| Mobile | Capacitor (iOS + Android) |

Players never need AVAX. Purchases are relayed: the player signs an EIP-2612
permit off-chain, the backend submits the transaction and pays gas.

---

## Local development

Requires Node 22+, Rust 1.80+, Foundry, and PostgreSQL 15+.

```bash
npm install

# API — migrations apply automatically on boot
cd apps/api && cp .env.example .env   # DATABASE_URL, RELAY_PRIVATE_KEY, contract addresses
cargo run                             # http://localhost:8080

# Web
cd apps/web && cp .env.example .env.local
npm run dev                           # http://localhost:3000

# Contracts
cd contracts && forge build && forge test
```

### Tests

```bash
cd apps/api && cargo test     # 90 tests
cd contracts && forge test    # 50 tests
cd apps/web && npx vitest run # 461 tests
npm run typecheck
```

CI runs all of these plus a secret scan on every push — see
[.github/workflows/ci.yml](.github/workflows/ci.yml).

---

## Deployment

**API** — Railway, built from `apps/api/Dockerfile`. `RAILWAY_DOCKERFILE_PATH` is
resolved against the repo root, so the Dockerfile COPYs from `apps/api/` and
`.railwayignore` keeps the upload small. Health check `/health`; `/health/ready`
additionally proves the database is reachable and is what an uptime monitor should
watch.

**Contracts** — see [contracts/DEPLOYMENTS.md](contracts/DEPLOYMENTS.md), which
also records how the first deploy failed halfway and why (a hot deployer wallet
cannot hold a stable nonce across a multi-contract script).

New items must be registered on-chain before they appear:

```bash
cd contracts
forge script script/RegisterItems.s.sol --rpc-url $AVALANCHE_RPC_URL --broadcast
```

---

## Project structure

```
StillHunt/
├── apps/
│   ├── web/                  # Next.js frontend
│   │   └── src/
│   │       ├── config/chain.ts   # the ONLY module that names a chain
│   │       ├── engine/           # FPS sim, scene, audio, campaign
│   │       ├── components/ hooks/ stores/
│   └── api/                  # Rust backend
│       ├── src/services/     # chain writer, earnings, earn_cap
│       ├── src/handlers/     # battles, duels, items, claims…
│       └── migrations/
├── contracts/                # Foundry
└── packages/                 # shared, customizer
```

`config/chain.ts` is the only place a chain is named, so moving to an Avalanche L1
later is a config edit rather than a hunt through call sites.

---

## License

MIT
