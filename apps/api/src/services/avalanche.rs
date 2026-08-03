//! The Avalanche C-Chain relay.
//!
//! Deliberately NOT a second `ChainWriter`. That type is Celo-shaped all the way
//! down: it holds a non-optional G$ token, the GoodCollective rank pools, the
//! reward pool and the Endless pool. None of those exist on Avalanche, and
//! bending it to pretend they might would leave every call site checking which
//! chain it was really talking to. Two small honest types beat one type with a
//! chain-shaped hole in it.
//!
//! WHAT THIS WRITES
//!   • Match records — the same real fight already recorded on Celo, written to a
//!     second ledger. This is the transaction volume an Avalanche grant counts.
//!   • Scrip mints — when a player claims their accrued balance in the Bank.
//!
//! WHAT IT DOES NOT WRITE
//!   Anything involving G$. Every G$ payout stays on Celo, permanently, because
//!   StillHunt's GoodDollar grant requires rewards to be paid in G$ and G$ exists only
//!   on Celo and Fuse. See services::chain_id for the same rule stated once more.
//!
//! GAS IS AVAX, AND IT IS NOT FREE
//!   This was the cost of choosing C-Chain over a StillHunt L1: on an L1 we would mint
//!   the gas token and writes would be effectively free. Here every write spends
//!   real AVAX from the relay wallet. The relay running dry is already the single
//!   most common cause of failed payouts in this project's history, on a different
//!   chain, with a different token. It will happen here too if nobody watches the
//!   balance, so `relay_can_pay` exists for the same reason it does on Celo.

use ethers::{
    middleware::SignerMiddleware,
    prelude::abigen,
    providers::{Http, Middleware, Provider},
    signers::{LocalWallet, Signer},
    types::{Address, H256, U256},
};
use std::{str::FromStr, sync::Arc, time::Duration};

use crate::services::chain::{is_out_of_gas, RELAY_OUT_OF_GAS};
use crate::services::chain_id::AVALANCHE;

abigen!(
    ScripToken,
    r#"[
        function mint(address to, uint256 amount) external
        function balanceOf(address account) external view returns (uint256)
        function totalSupply() external view returns (uint256)
    ]"#
);

abigen!(
    AvaxGameRecord,
    r#"[
        function recordBattle(bytes32 battleId, address winner, address loser, uint8 xpWinner, uint8 xpLoser, bool isBot) external
    ]"#
);

abigen!(
    AvaxMarketplace,
    r#"[
        function purchaseWithPermit(address buyer, uint256 itemId, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external
    ]"#
);

type ChainClient = SignerMiddleware<Provider<Http>, LocalWallet>;

/// Gas headroom for one write, used to decide whether the relay can afford to try.
///
/// A `recordBattle` costs well under 150k; a `mint` is smaller still. Three times
/// that at the current price is the same 3x cushion the Celo relay uses, because
/// the base fee moves between the check and the send.
const WRITE_GAS_ESTIMATE: u64 = 150_000;

#[derive(Clone)]
pub struct AvalancheWriter {
    client:      Arc<ChainClient>,
    game_record: Arc<AvaxGameRecord<ChainClient>>,
    scrip:       Option<Arc<ScripToken<ChainClient>>>,
    marketplace: Option<Arc<AvaxMarketplace<ChainClient>>>,
    /// Serialises every state-changing send from this signer.
    ///
    /// Same reason as `ChainWriter::tx_lock`, and it is not optional: a fight
    /// finishing fires a match record while a claim may be minting, and a plain
    /// SignerMiddleware reads the pending nonce independently per transaction. Two
    /// racing writes take the SAME nonce and the loser is rejected as "replacement
    /// transaction underpriced". Holding the lock across each broadcast means the
    /// next send reads the nonce only once the previous one is in the mempool.
    tx_lock:     Arc<tokio::sync::Mutex<()>>,
}

impl AvalancheWriter {
    /// Builds the relay from the environment, or `None` if it is not configured.
    ///
    /// `None` is the normal state until the contracts are deployed, and it must
    /// stay harmless: the app runs perfectly well with no Avalanche relay at all,
    /// it simply writes nothing there. Every call site treats a missing writer as
    /// "skip", never as an error, exactly as the Celo writer is treated today.
    ///
    /// Required:
    ///   AVALANCHE_PRIVATE_KEY          — the relay wallet's key. Use a DIFFERENT
    ///                                    key from the Celo relay: sharing one means
    ///                                    a single compromise takes both chains, and
    ///                                    an Avalanche bug could drain the wallet
    ///                                    that pays real G$.
    ///   AVALANCHE_GAME_RECORD_CONTRACT — StillHuntRecord proxy on C-Chain.
    /// Optional:
    ///   SCRIP_CONTRACT                 — the Scrip token. Without it, claims cannot
    ///                                    settle but match records still write.
    ///   AVALANCHE_RPC_URL              — defaults to a public endpoint.
    pub fn from_env() -> Option<Self> {
        let private_key = std::env::var("AVALANCHE_PRIVATE_KEY").ok()?;
        let record_addr = std::env::var("AVALANCHE_GAME_RECORD_CONTRACT").ok()?;
        let rpc_url = std::env::var("AVALANCHE_RPC_URL")
            .unwrap_or_else(|_| "https://avalanche.api.onfinality.io/public/ext/bc/C/rpc".to_string());

        let wallet: LocalWallet = private_key
            .trim_start_matches("0x")
            .parse::<LocalWallet>()
            .map_err(|e| tracing::warn!("AvalancheWriter: invalid key: {}", e))
            .ok()?
            // Signing with the wrong chain id produces a transaction the node
            // rejects, or worse, one that is valid somewhere it was never meant
            // for. This is the whole purpose of EIP-155.
            .with_chain_id(AVALANCHE as u64);

        let provider = Provider::<Http>::try_from(rpc_url.as_str())
            .map_err(|e| tracing::warn!("AvalancheWriter: bad RPC URL: {}", e))
            .ok()?
            .interval(Duration::from_millis(500));

        let record: Address = record_addr
            .parse()
            .map_err(|e| tracing::warn!("AvalancheWriter: bad game record addr: {}", e))
            .ok()?;

        let client = Arc::new(SignerMiddleware::new(provider, wallet));

        // Optional and parsed separately so a typo'd Scrip address disables minting
        // rather than taking down match recording with it.
        let scrip = std::env::var("SCRIP_CONTRACT").ok().and_then(|a| {
            Address::from_str(&a)
                .map_err(|e| tracing::warn!("AvalancheWriter: bad SCRIP_CONTRACT: {}", e))
                .ok()
                .map(|addr| Arc::new(ScripToken::new(addr, client.clone())))
        });

        // Same treatment as Scrip: parsed separately so a bad address disables ONE
        // capability rather than taking match recording down with it.
        let marketplace = std::env::var("AVALANCHE_MARKETPLACE_CONTRACT").ok().and_then(|a| {
            Address::from_str(&a)
                .map_err(|e| tracing::warn!("AvalancheWriter: bad AVALANCHE_MARKETPLACE_CONTRACT: {}", e))
                .ok()
                .map(|addr| Arc::new(AvaxMarketplace::new(addr, client.clone())))
        });

        tracing::info!(
            "Avalanche relay ready: {:?} (scrip: {}, marketplace: {})",
            client.address(),
            if scrip.is_some() { "yes" } else { "NOT SET — claims cannot settle" },
            if marketplace.is_some() { "yes" } else { "NOT SET — SCRP purchases disabled" },
        );

        Some(Self {
            game_record: Arc::new(AvaxGameRecord::new(record, client.clone())),
            client,
            scrip,
            marketplace,
            tx_lock: Arc::new(tokio::sync::Mutex::new(())),
        })
    }

    /// The relay's AVAX balance.
    pub async fn relay_gas_balance(&self) -> Option<U256> {
        self.client.get_balance(self.client.address(), None).await.ok()
    }

    /// Whether the relay can afford one write right now.
    ///
    /// Returns true when the balance cannot be read, matching the Celo writer: an
    /// RPC blip must not silently stop the game recording matches.
    pub async fn relay_can_pay(&self) -> bool {
        let Some(balance) = self.relay_gas_balance().await else { return true };
        let price = self
            .client
            .get_gas_price()
            .await
            .unwrap_or_else(|_| U256::from(50_000_000_000u64));
        balance >= price * U256::from(WRITE_GAS_ESTIMATE) * U256::from(3u64)
    }

    /// Mirrors a match onto Avalanche. `None` on any failure.
    ///
    /// Failing here must never fail the fight: the match already happened, the
    /// player already has their XP, and Celo already holds the authoritative
    /// record. A missing mirror costs a row in a reporting table, nothing more.
    pub async fn record_battle(
        &self,
        battle_id: [u8; 32],
        winner: Address,
        loser: Address,
        xp_winner: u8,
        xp_loser: u8,
        is_bot: bool,
    ) -> Option<H256> {
        let _guard = self.tx_lock.lock().await;

        let call = self
            .game_record
            .record_battle(battle_id, winner, loser, xp_winner, xp_loser, is_bot);

        match call.send().await {
            Ok(pending) => match pending.await {
                Ok(Some(receipt)) => Some(receipt.transaction_hash),
                Ok(None) => {
                    tracing::warn!("Avalanche recordBattle: no receipt (dropped?)");
                    None
                }
                Err(e) => {
                    tracing::warn!("Avalanche recordBattle receipt failed: {}", e);
                    None
                }
            },
            Err(e) => {
                let msg = e.to_string();
                if is_out_of_gas(&msg) {
                    // Named explicitly so this never gets misread as a game bug the
                    // way the Celo equivalent was for hours.
                    tracing::error!("{}: Avalanche relay is out of AVAX: {}", RELAY_OUT_OF_GAS, msg);
                } else {
                    tracing::warn!("Avalanche recordBattle failed: {}", msg);
                }
                None
            }
        }
    }

    /// Mints Scrip to a player, settling a claim.
    ///
    /// Returns the transaction hash, or an error string the caller MUST act on by
    /// failing the claim and releasing its earnings. Unlike a missed match record,
    /// a silently dropped mint is money the player was told they had and never
    /// received. See `services::earnings::fail_claim`.
    pub async fn mint_scrip(&self, to: Address, amount: U256) -> Result<H256, String> {
        let scrip = self
            .scrip
            .as_ref()
            .ok_or_else(|| "SCRIP_CONTRACT is not set; claims cannot settle".to_string())?;

        let _guard = self.tx_lock.lock().await;

        // Bound to a local first: `scrip.mint(..)` returns a builder that the
        // pending-transaction future borrows from, so inlining it drops the builder
        // while the receipt is still being awaited.
        let call = scrip.mint(to, amount);
        let pending = call.send().await.map_err(|e| {
            let msg = e.to_string();
            if is_out_of_gas(&msg) {
                format!("{}: Avalanche relay is out of AVAX: {}", RELAY_OUT_OF_GAS, msg)
            } else {
                msg
            }
        })?;

        match pending.await {
            Ok(Some(receipt)) => Ok(receipt.transaction_hash),
            // No receipt is NOT proof the mint did not happen — it may still be
            // mined later. The caller releases the earnings, which risks paying
            // twice rather than never, and that is the right way round for a
            // token we mint ourselves and can reconcile against on-chain balance.
            Ok(None) => Err("mint sent but no receipt returned".to_string()),
            Err(e) => Err(format!("mint receipt failed: {e}")),
        }
    }

    /// Relays a SCRP marketplace purchase, so the player needs no AVAX for gas.
    ///
    /// Mirrors `ChainWriter::purchase_item_for`. The permit the buyer signed must be
    /// for the price THIS chain's marketplace holds — 6,000 SCRP where Celo says
    /// 1,200 G$ — or `permit()` rejects the signature and the whole thing reverts
    /// after they have already approved it. That is why the items API serves
    /// per-chain prices rather than one number.
    pub async fn purchase_item_for(
        &self,
        buyer: Address,
        item_id: u64,
        deadline: u64,
        v: u8,
        r_hex: &str,
        s_hex: &str,
    ) -> Result<H256, String> {
        let marketplace = self.marketplace.as_ref().ok_or_else(|| {
            "SCRP purchases are not configured (AVALANCHE_MARKETPLACE_CONTRACT unset)".to_string()
        })?;

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

        // Hold the nonce lock only across broadcast, then release so the confirmation
        // wait does not serialize match mirroring behind a purchase.
        let pending = {
            let _guard = self.tx_lock.lock().await;
            call.send().await.map_err(|e| {
                let msg = e.to_string();
                if is_out_of_gas(&msg) {
                    format!("{RELAY_OUT_OF_GAS}: Avalanche relay is out of AVAX: {msg}")
                } else {
                    format!("TX submission failed: {msg}")
                }
            })?
        };

        let hash = pending.tx_hash();
        tracing::info!("SCRP purchaseWithPermit submitted: {:?}", hash);

        // C-Chain finalises in ~2s, so 60s is generous rather than tight.
        tokio::time::timeout(Duration::from_secs(60), pending.confirmations(1))
            .await
            .map_err(|_| "Transaction timed out waiting for confirmation".to_string())?
            .map_err(|e| format!("Transaction failed on-chain: {e}"))?
            .ok_or_else(|| "Transaction was dropped from mempool".to_string())?;

        tracing::info!("SCRP purchaseWithPermit confirmed: {:?}", hash);
        Ok(hash)
    }

    /// Whether SCRP purchases can be relayed at all.
    pub fn can_sell(&self) -> bool {
        self.marketplace.is_some()
    }

    /// The relay's own address, for logging and balance alerts.
    pub fn relay_address(&self) -> Address {
        self.client.address()
    }

    /// Whether Scrip minting is available.
    pub fn can_mint(&self) -> bool {
        self.scrip.is_some()
    }
}
