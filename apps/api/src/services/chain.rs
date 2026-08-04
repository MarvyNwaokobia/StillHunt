//! The Avalanche C-Chain relay — the only chain writer StillHunt has.
//!
//! WHAT IT WRITES
//!   • Contract records — every completed or failed operation, and every rank
//!     crossed. Append-only, never read back (see StillHuntRecord.sol for why).
//!   • TALLY mints — when a player claims the balance they accrued by playing.
//!   • Marketplace purchases — relayed from a signed permit, so the player needs
//!     no AVAX to buy anything.
//!   • Duel settlements — naming the winner of a staked match.
//!
//! WHAT IT DOES NOT WRITE
//!   Reward payouts, because there are none. StillHunt has no reward pool: play
//!   ACCRUES a balance in the database, and that balance mints on claim. The
//!   difference matters operationally — there is no pool to keep funded, and no
//!   payout that can silently fail mid-session, only a claim that either settles
//!   or visibly does not.
//!
//! GAS IS AVAX, AND IT IS NOT FREE
//!   This is the cost of choosing C-Chain over a custom L1, where we would mint
//!   the gas token and writes would be effectively free. Here every write spends
//!   real AVAX from the relay wallet, and a relay that runs dry stops writes with
//!   no player-visible cause. That is why `relay_can_pay` is checked BEFORE any
//!   path that would otherwise fail halfway, and why the balance is logged loudly
//!   at boot.

use ethers::{
    middleware::SignerMiddleware,
    prelude::abigen,
    providers::{Http, Middleware, Provider},
    signers::{LocalWallet, Signer},
    types::{Address, H256, U256},
};
use std::{str::FromStr, sync::Arc, time::Duration};

/// Avalanche C-Chain mainnet. A fixed fact, so it is a constant rather than
/// configuration — a chain id read from env could be set wrong, and would then
/// happily sign transactions for a chain nobody intended.
pub const CHAIN_ID: u64 = 43114;

/// Marker prefix for "the relay cannot pay gas". Callers match on this to tell a
/// player it is our problem, not their wallet — a distinction whose absence once
/// had us chasing signing bugs for hours.
pub const RELAY_OUT_OF_GAS: &str = "RELAY_OUT_OF_GAS";

/// Whether a node error is really "the relay is broke".
///
/// Matched on text because that is all the RPC gives us. Deliberately broad: a
/// false positive tells the player to wait, a false negative tells them to
/// re-sign something that can never succeed.
pub fn is_out_of_gas(err: &str) -> bool {
    let e = err.to_ascii_lowercase();
    e.contains("insufficient funds")
        || e.contains("gas required exceeds allowance")
        || e.contains("not enough balance")
        || e.contains("insufficient balance for transfer")
}

abigen!(
    TallyToken,
    r#"[
        function mint(address to, uint256 amount) external
        function balanceOf(address account) external view returns (uint256)
        function totalSupply() external view returns (uint256)
        function allowance(address owner, address spender) external view returns (uint256)
        function transferFrom(address from, address to, uint256 amount) external returns (bool)
    ]"#
);

abigen!(
    HuntRecord,
    r#"[
        function recordContract(bytes32 contractId, address winner, address loser, uint32 xpWinner, uint32 xpLoser, bool solo) external
        function recordRank(address player, string rank) external
        function enlistHunter(address player, string discipline, string callsign) external
    ]"#
);

abigen!(
    HuntMarketplace,
    r#"[
        function purchaseWithPermit(address buyer, uint256 itemId, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external
    ]"#
);

abigen!(
    HuntDuels,
    r#"[
        function settle(uint256 duelId, address winner) external
        function expiresAt(uint256 duelId) external view returns (uint256)
    ]"#
);

type ChainClient = SignerMiddleware<Provider<Http>, LocalWallet>;

/// Gas headroom for one write, used to decide whether the relay can afford to
/// try. A record write costs well under 150k; a mint is smaller. Three times that
/// at the current price is the cushion, because the base fee moves between the
/// check and the send.
const WRITE_GAS_ESTIMATE: u64 = 150_000;

#[derive(Clone)]
pub struct ChainWriter {
    client:      Arc<ChainClient>,
    record:      Arc<HuntRecord<ChainClient>>,
    tally:       Option<Arc<TallyToken<ChainClient>>>,
    marketplace: Option<Arc<HuntMarketplace<ChainClient>>>,
    duels:       Option<Arc<HuntDuels<ChainClient>>>,
    /// Serialises every state-changing send from this signer.
    ///
    /// Not optional. An operation finishing fires a record write while a claim may
    /// be minting, and a plain SignerMiddleware reads the pending nonce
    /// independently per transaction — two racing writes take the SAME nonce and
    /// the loser is rejected as "replacement transaction underpriced". Holding the
    /// lock across each broadcast means the next send reads the nonce only once
    /// the previous one is in the mempool.
    tx_lock:     Arc<tokio::sync::Mutex<()>>,
}

impl ChainWriter {
    /// Builds the relay from the environment, or `None` if it is not configured.
    ///
    /// `None` is the normal state before the contracts are deployed, and it must
    /// stay harmless: the game runs, it simply writes nothing on-chain. Every call
    /// site treats a missing writer as "skip", never as an error.
    ///
    /// Required:
    ///   RELAY_PRIVATE_KEY  — the relay wallet's key. NOT the deployer's: the
    ///                        deployer owns every proxy and carries upgrade
    ///                        rights, and this key is hot.
    ///   RECORD_ADDRESS     — StillHuntRecord proxy.
    ///
    /// Optional, each parsed separately so one bad address disables ONE capability
    /// rather than taking the whole relay down:
    ///   TALLY_ADDRESS       — without it, claims cannot settle.
    ///   MARKETPLACE_ADDRESS — without it, relayed purchases are disabled.
    ///   DUELS_ADDRESS       — without it, staked duels cannot be settled.
    ///   AVALANCHE_RPC_URL   — defaults to a public endpoint.
    pub fn from_env() -> Option<Self> {
        let private_key = std::env::var("RELAY_PRIVATE_KEY").ok()?;
        let record_addr = std::env::var("RECORD_ADDRESS").ok()?;
        let rpc_url = std::env::var("AVALANCHE_RPC_URL")
            .unwrap_or_else(|_| "https://avalanche-c-chain-rpc.publicnode.com".to_string());

        let wallet: LocalWallet = private_key
            .trim_start_matches("0x")
            .parse::<LocalWallet>()
            .map_err(|e| tracing::warn!("ChainWriter: invalid RELAY_PRIVATE_KEY: {}", e))
            .ok()?
            // Signing with the wrong chain id produces a transaction the node
            // rejects, or worse one that is valid somewhere it was never meant
            // for. This is the whole purpose of EIP-155.
            .with_chain_id(CHAIN_ID);

        let provider = Provider::<Http>::try_from(rpc_url.as_str())
            .map_err(|e| tracing::warn!("ChainWriter: bad RPC URL: {}", e))
            .ok()?
            .interval(Duration::from_millis(500));

        let record: Address = record_addr
            .parse()
            .map_err(|e| tracing::warn!("ChainWriter: bad RECORD_ADDRESS: {}", e))
            .ok()?;

        let client = Arc::new(SignerMiddleware::new(provider, wallet));

        let tally = optional_contract("TALLY_ADDRESS")
            .map(|addr| Arc::new(TallyToken::new(addr, client.clone())));
        let marketplace = optional_contract("MARKETPLACE_ADDRESS")
            .map(|addr| Arc::new(HuntMarketplace::new(addr, client.clone())));
        let duels = optional_contract("DUELS_ADDRESS")
            .map(|addr| Arc::new(HuntDuels::new(addr, client.clone())));

        tracing::info!(
            "Chain relay ready: {:?} (tally: {}, marketplace: {}, duels: {})",
            client.address(),
            yes_no(tally.is_some(), "NOT SET — claims cannot settle"),
            yes_no(marketplace.is_some(), "NOT SET — purchases disabled"),
            yes_no(duels.is_some(), "NOT SET — staked duels disabled"),
        );

        Some(Self {
            record: Arc::new(HuntRecord::new(record, client.clone())),
            client,
            tally,
            marketplace,
            duels,
            tx_lock: Arc::new(tokio::sync::Mutex::new(())),
        })
    }

    // ── Health ────────────────────────────────────────────────────────────────

    /// The relay's AVAX balance.
    pub async fn relay_gas_balance(&self) -> Option<U256> {
        self.client.get_balance(self.client.address(), None).await.ok()
    }

    /// Whether the relay can afford one write right now.
    ///
    /// Returns true when the balance cannot be read: an RPC blip must not silently
    /// stop the game recording anything.
    pub async fn relay_can_pay(&self) -> bool {
        let Some(balance) = self.relay_gas_balance().await else { return true };
        let price = self
            .client
            .get_gas_price()
            .await
            .unwrap_or_else(|_| U256::from(50_000_000_000u64));
        balance >= price * U256::from(WRITE_GAS_ESTIMATE) * U256::from(3u64)
    }

    /// The relay's own address, for logging and balance alerts.
    pub fn relay_address(&self) -> Address {
        self.client.address()
    }

    pub fn can_mint(&self) -> bool { self.tally.is_some() }
    pub fn can_sell(&self) -> bool { self.marketplace.is_some() }
    pub fn can_settle_duels(&self) -> bool { self.duels.is_some() }

    // ── Record: append-only history ───────────────────────────────────────────

    /// Records a finished operation. `None` on any failure.
    ///
    /// Failing here must never fail the operation: it already happened and the
    /// player already has their XP. A missing record costs a row in a public log
    /// and nothing else — which is exactly why the database, not the chain, is the
    /// operational source of truth.
    pub async fn record_contract(
        &self,
        contract_id: [u8; 32],
        winner: Address,
        loser: Address,
        xp_winner: u32,
        xp_loser: u32,
        solo: bool,
    ) -> Option<H256> {
        let call = self
            .record
            .record_contract(contract_id, winner, loser, xp_winner, xp_loser, solo);
        self.fire(call.tx, "recordContract").await
    }

    /// Records a rank crossing.
    pub async fn record_rank(&self, player: Address, rank: String) -> Option<H256> {
        let call = self.record.record_rank(player, rank);
        self.fire(call.tx, "recordRank").await
    }

    /// Records a new hunter signing on.
    pub async fn enlist_hunter(
        &self,
        player: Address,
        discipline: String,
        callsign: String,
    ) -> Option<H256> {
        let call = self.record.enlist_hunter(player, discipline, callsign);
        self.fire(call.tx, "enlistHunter").await
    }

    // ── TALLY ─────────────────────────────────────────────────────────────────

    /// Mints TALLY to a player, settling a claim.
    ///
    /// Returns an error string the caller MUST act on by failing the claim and
    /// releasing its earnings. Unlike a missed record write, a silently dropped
    /// mint is a balance the player was told they had and never received.
    pub async fn mint_tally(&self, to: Address, amount: U256) -> Result<H256, String> {
        let tally = self
            .tally
            .as_ref()
            .ok_or_else(|| "TALLY_ADDRESS is not set; claims cannot settle".to_string())?;

        let _guard = self.tx_lock.lock().await;

        // Bound to a local first: `tally.mint(..)` returns a builder the pending
        // future borrows from, so inlining it drops the builder while the receipt
        // is still being awaited.
        let call = tally.mint(to, amount);
        let pending = call.send().await.map_err(|e| gas_aware(e.to_string()))?;

        match pending.await {
            Ok(Some(receipt)) => Ok(receipt.transaction_hash),
            // No receipt is NOT proof the mint did not happen — it may still be
            // mined. The caller releases the earnings, risking paying twice rather
            // than never, which is the right way round for a token we mint
            // ourselves and can reconcile against an on-chain balance.
            Ok(None) => Err("mint sent but no receipt returned".to_string()),
            Err(e) => Err(format!("mint receipt failed: {e}")),
        }
    }

    /// A wallet's TALLY balance.
    pub async fn tally_balance(&self, owner: Address) -> Result<U256, String> {
        let tally = self.tally.as_ref().ok_or_else(|| "TALLY_ADDRESS not set".to_string())?;
        tally.balance_of(owner).call().await.map_err(|e| e.to_string())
    }

    /// Total TALLY in circulation, for the admin dashboard.
    pub async fn tally_supply(&self) -> Result<U256, String> {
        let tally = self.tally.as_ref().ok_or_else(|| "TALLY_ADDRESS not set".to_string())?;
        tally.total_supply().call().await.map_err(|e| e.to_string())
    }

    // ── Marketplace ───────────────────────────────────────────────────────────

    /// Relays a marketplace purchase so the player needs no AVAX for gas.
    ///
    /// The permit the buyer signed must be for the price the marketplace actually
    /// holds, or `permit()` rejects the signature and the whole thing reverts
    /// after they have already approved it.
    pub async fn purchase_item_for(
        &self,
        buyer: Address,
        item_id: u64,
        deadline: u64,
        v: u8,
        r_hex: &str,
        s_hex: &str,
    ) -> Result<H256, String> {
        let marketplace = self
            .marketplace
            .as_ref()
            .ok_or_else(|| "Purchases are not configured (MARKETPLACE_ADDRESS unset)".to_string())?;

        let r: [u8; 32] = H256::from_str(r_hex).map_err(|_| format!("Invalid r: {r_hex}"))?.0;
        let s: [u8; 32] = H256::from_str(s_hex).map_err(|_| format!("Invalid s: {s_hex}"))?.0;

        let call = marketplace.purchase_with_permit(
            buyer,
            U256::from(item_id),
            U256::from(deadline),
            v,
            r,
            s,
        );

        // Hold the nonce lock only across the broadcast, then release so the
        // confirmation wait does not serialise record writes behind a purchase.
        let pending = {
            let _guard = self.tx_lock.lock().await;
            call.send().await.map_err(|e| gas_aware(e.to_string()))?
        };

        let hash = pending.tx_hash();
        tracing::info!("purchaseWithPermit submitted: {:?}", hash);

        // C-Chain finalises in ~2s, so 60s is generous rather than tight.
        tokio::time::timeout(Duration::from_secs(60), pending.confirmations(1))
            .await
            .map_err(|_| "Transaction timed out waiting for confirmation".to_string())?
            .map_err(|e| format!("Transaction failed on-chain: {e}"))?
            .ok_or_else(|| "Transaction was dropped from mempool".to_string())?;

        tracing::info!("purchaseWithPermit confirmed: {:?}", hash);
        Ok(hash)
    }

    // ── Duels ─────────────────────────────────────────────────────────────────

    /// Declares the winner of a staked duel, paying out the pot minus the house
    /// cut.
    ///
    /// The contract only ever pays one of the two participants, so the worst a
    /// compromised relay can do here is name the wrong winner — visible on-chain
    /// and disputable. It cannot take the stakes.
    ///
    /// If this never runs, the players are not stuck: after the contract's expiry
    /// window either of them can refund both sides without us.
    pub async fn settle_duel(&self, duel_id: u64, winner: Address) -> Result<H256, String> {
        let duels = self
            .duels
            .as_ref()
            .ok_or_else(|| "Staked duels are not configured (DUELS_ADDRESS unset)".to_string())?;

        let _guard = self.tx_lock.lock().await;
        let call = duels.settle(U256::from(duel_id), winner);
        let pending = call.send().await.map_err(|e| gas_aware(e.to_string()))?;

        match pending.await {
            Ok(Some(receipt)) => Ok(receipt.transaction_hash),
            Ok(None) => Err("settle sent but no receipt returned".to_string()),
            Err(e) => Err(format!("settle receipt failed: {e}")),
        }
    }

    /// When a duel becomes refundable by its players. 0 while it is not active.
    pub async fn duel_expires_at(&self, duel_id: u64) -> Result<u64, String> {
        let duels = self.duels.as_ref().ok_or_else(|| "DUELS_ADDRESS not set".to_string())?;
        duels
            .expires_at(U256::from(duel_id))
            .call()
            .await
            .map(|v| v.as_u64())
            .map_err(|e| e.to_string())
    }

    // ── Internals ─────────────────────────────────────────────────────────────

    /// Sends a best-effort write and returns its hash, logging rather than
    /// propagating failures.
    ///
    /// Every caller of this is recording something that ALREADY HAPPENED, so a
    /// failure here must never surface to the player as a failed action.
    async fn fire(
        &self,
        tx: ethers::types::transaction::eip2718::TypedTransaction,
        what: &str,
    ) -> Option<H256> {
        let _guard = self.tx_lock.lock().await;
        match self.client.send_transaction(tx, None).await {
            Ok(pending) => match pending.await {
                Ok(Some(receipt)) => Some(receipt.transaction_hash),
                Ok(None) => {
                    tracing::warn!("{}: no receipt (dropped?)", what);
                    None
                }
                Err(e) => {
                    tracing::warn!("{} receipt failed: {}", what, e);
                    None
                }
            },
            Err(e) => {
                let msg = e.to_string();
                if is_out_of_gas(&msg) {
                    // Named explicitly so this is never misread as a game bug.
                    tracing::error!("{}: relay is out of AVAX: {}", RELAY_OUT_OF_GAS, msg);
                } else {
                    tracing::warn!("{} failed: {}", what, msg);
                }
                None
            }
        }
    }
}

/// Reads an optional contract address, warning (not failing) on a malformed one.
fn optional_contract(var: &str) -> Option<Address> {
    let raw = std::env::var(var).ok()?;
    match Address::from_str(&raw) {
        Ok(addr) => Some(addr),
        Err(e) => {
            tracing::warn!("ChainWriter: bad {}: {}", var, e);
            None
        }
    }
}

fn yes_no(present: bool, absent_msg: &'static str) -> &'static str {
    if present { "yes" } else { absent_msg }
}

/// Tags an error with the out-of-gas marker when that is what it really is.
fn gas_aware(msg: String) -> String {
    if is_out_of_gas(&msg) {
        format!("{RELAY_OUT_OF_GAS}: relay is out of AVAX: {msg}")
    } else {
        msg
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_chain_id_is_c_chain_mainnet() {
        // A fixed fact, asserted so a stray edit cannot point the signer at a
        // testnet while every price and balance in the UI still reads as real.
        assert_eq!(CHAIN_ID, 43114);
        assert_ne!(CHAIN_ID, 43113, "43113 is Fuji, not mainnet");
    }

    #[test]
    fn out_of_gas_is_recognised_from_what_nodes_actually_say() {
        for msg in [
            "insufficient funds for gas * price + value",
            "Insufficient Funds",
            "gas required exceeds allowance (0)",
            "not enough balance",
        ] {
            assert!(is_out_of_gas(msg), "{msg:?} should read as out of gas");
        }
    }

    #[test]
    fn ordinary_failures_are_not_mistaken_for_an_empty_relay() {
        // The dangerous direction: telling a player to wait for us to top up when
        // the real problem is their signature.
        for msg in ["execution reverted: ItemNotListed", "nonce too low", "permit expired"] {
            assert!(!is_out_of_gas(msg), "{msg:?} should NOT read as out of gas");
        }
    }

    #[test]
    fn the_gas_marker_is_prefixed_only_when_it_applies() {
        assert!(gas_aware("insufficient funds".into()).starts_with(RELAY_OUT_OF_GAS));
        assert_eq!(gas_aware("nonce too low".into()), "nonce too low");
    }
}
