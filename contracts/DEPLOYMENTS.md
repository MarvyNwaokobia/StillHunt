# Deployments

## Avalanche C-Chain (43114) — 2026-08-03

All five contracts are live and verified on Snowtrace/Routescan.

| Contract | Address | Notes |
|---|---|---|
| `Tally` (TALLY) | [`0x670855698cf1137D01F83D6f058F8BC9A74f01e9`](https://snowtrace.io/address/0x670855698cf1137D01F83D6f058F8BC9A74f01e9) | ERC20 + permit. Not a proxy — see below. |
| `StillHuntArmory` | [`0xE32A9b1212259f37C2a04361456Fd91bE8bC1831`](https://snowtrace.io/address/0xE32A9b1212259f37C2a04361456Fd91bE8bC1831) | UUPS proxy → `0x62618fbe…ae288` |
| `StillHuntMarketplace` | [`0x105f95c60958f1AaCE8750c5447f585050ABBE5c`](https://snowtrace.io/address/0x105f95c60958f1AaCE8750c5447f585050ABBE5c) | UUPS proxy → `0x50d4f950…b8bec0` |
| `StillHuntDuels` | [`0x87f5F346F09849404274DE01962C36667E2E2830`](https://snowtrace.io/address/0x87f5F346F09849404274DE01962C36667E2E2830) | UUPS proxy → `0x616a6ded…c6e786` |
| `StillHuntRecord` | [`0x6D4e61b683337b3C8Bd3A04738586aC1F86f8d3a`](https://snowtrace.io/address/0x6D4e61b683337b3C8Bd3A04738586aC1F86f8d3a) | UUPS proxy → `0x5a2a3966…6f3120` |

**Tally is deliberately not upgradeable.** A token whose rules the studio can
rewrite is not a credible fixed supply, and the 1,000,000,000 cap is the entire
reason a player should trust the number. The other four are UUPS proxies because
game rules do change.

### Roles

| Role | Address |
|---|---|
| Owner (all contracts) | `0x25496AC7711B06663Ac1DFfb29E717284e800b43` |
| Relay — minter, recorder, duel resolver | `0x380d056654cEd771e6f3Fa014E7D3866cEE89593` |

Verified on-chain after deploy: the relay holds minter rights, **the owner does
not** (administering minters and being one are separate, so a compromised owner
key cannot print supply in a single call); the armory will only mint for the
marketplace; both fee rates are 500 bps; the duel expiry window is 7200s.

### Known issue with this deployment

The deploy transaction ran while the deployer wallet was **also being used by
another process**, and its nonce moved from 232 to 304 mid-run. Foundry had
pre-computed a nonce sequence, so the last two transactions in the script were
rejected as `nonce too low` and the run aborted after the contracts themselves
had already been created.

Nothing was lost — the five contracts deployed and initialised correctly — but
the two final wiring calls (`armory.setMarketplace` and `tally.setMinter`) had to
be sent separately afterwards:

- `0x814582c6d87587064c657efb64c8c84a38ba242c4e76fda5a61da63bfdc48a9e`
- `0x0c68bc1ada4784aa737b168044f668a220146b4bff92931bf42105b3022bcca5`

**Use a dedicated deployer wallet next time.** A hot wallet that other software
is transacting from cannot hold a stable nonce for the length of a multi-contract
script, and the failure lands halfway through — after you have paid for the
contracts but before they are wired to each other.

### Reproducing

```bash
cd contracts
cp .env.example .env    # fill DEPLOYER_PRIVATE_KEY + RELAY_ADDRESS
forge script script/Deploy.s.sol --rpc-url $AVALANCHE_RPC_URL --broadcast --verify --slow
```
