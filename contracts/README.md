# StillHunt — Smart Contracts

Foundry project containing the four StillHunt smart contracts deployed on Celo Mainnet.

## Deployed Contracts (Celo Mainnet)

All are UUPS upgradeable proxies. Verified on [Celoscan](https://celoscan.io).

| Contract | Proxy Address |
|----------|--------------|
| `StillHuntArmory` | `0x3ba09c51895Dacb90273A2A40C95369a5A1b4bFe` |
| `StillHuntMarketplace` | `0x95D167f569cf05C967C0432e3123baeac5D8d78D` |
| `StillHuntRewardPool` | `0x12a3f711A55f4dB0e9AF26C7429cc5018401F1f4` |
| `StillHuntRecord` | `0xd4ec6dB553E206cdf741448F94bD3B02D81c8571` |

## Contracts

### `StillHuntArmory` — ERC1155 item NFTs

One token type per game item (itemId 1–9). Only `StillHuntMarketplace` can mint. Items are non-fungible in practice (max 1 per player type, enforced by the game layer).

### `StillHuntMarketplace` — Gasless G$ purchases

Two purchase paths:

| Path | Who calls | Gas paid by |
|------|-----------|-------------|
| `onTokenTransfer` | Player calls `G$.transferAndCall(...)` | Player (CELO) |
| `purchaseWithPermit` | Backend relays with player's EIP-2612 permit | Backend wallet (CELO) |

The permit path is the active production flow — players only sign a message, no CELO required.

```solidity
function purchaseWithPermit(
    address buyer,
    uint256 itemId,
    uint256 deadline,
    uint8 v, bytes32 r, bytes32 s
) external nonReentrant
```

Revenue accumulates in the contract and can be withdrawn by the owner.

### `StillHuntRewardPool` — G$ reward distribution

Holds G$ funded by the project. The backend calls `distributeReward(player, amount)` on rank-up and daily check-in. Must be funded manually before rewards go live.

### `StillHuntRecord` — On-chain game event log

Immutable record of significant game events emitted by the backend:

- `CharacterClaimed(player, class, name, timestamp)`
- `BattleRecorded(battleId, winner, loser, xpWinner, xpLoser, isBot, timestamp)`
- `RankUpRecorded(player, newRank, timestamp)`

Only the `backendSigner` address can call these functions. Events are permanent and publicly verifiable on Celo.

## Setup

```bash
# Install Foundry if you haven't
curl -L https://foundry.paradigm.xyz | bash && foundryup

# Install dependencies
forge install

# Build
forge build

# Test
forge test -v

# Format
forge fmt
```

## Environment

Create `contracts/.env`:

```
DEPLOYER_PRIVATE_KEY=0x...        # wallet with CELO for gas
BACKEND_SIGNER_ADDRESS=0x...      # address of the backend relayer wallet
CELO_RPC_URL=https://forno.celo.org
CELOSCAN_API_KEY=...
```

## Deployment

Contracts are already deployed on mainnet. To deploy to a new environment (testnet or fresh mainnet):

```bash
source .env

# Step 1 — Deploy all four contracts
forge script script/Deploy.s.sol \
  --rpc-url $CELO_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $CELOSCAN_API_KEY

# Step 2 — Register items on StillHuntArmory and list them on StillHuntMarketplace
ITEMS_CONTRACT=<address> MARKETPLACE_CONTRACT=<address> \
  forge script script/Setup.s.sol \
  --rpc-url $CELO_RPC_URL \
  --broadcast
```

After deploying, copy the proxy addresses into `apps/web/.env.local` and Railway env vars.

## Upgrading

Contracts use OpenZeppelin UUPS. To upgrade `StillHuntMarketplace`:

```bash
forge script script/UpgradeMarketplace.s.sol \
  --rpc-url $CELO_RPC_URL \
  --broadcast
```

## Testing

```bash
forge test -v              # run all tests
forge test --match-contract StillHuntMarketplace -vvv   # single contract, verbose
forge coverage             # coverage report
```

Tests cover:
- `StillHuntArmory.t.sol` — mint access control, ERC1155 compliance
- `StillHuntMarketplace.t.sol` — permit purchase, transferAndCall, revenue withdrawal
- `StillHuntRewardPool.t.sol` — reward distribution, access control

## G$ Token (Celo Mainnet)

| Property | Value |
|----------|-------|
| Address | `0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A` |
| Decimals | 18 |
| Standard | ERC20 + ERC677 + ERC2612 (permit) |
