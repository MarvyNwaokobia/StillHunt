//! Which chain a transaction landed on.
//!
//! Not to be confused with `services::chain`, which is the ethers client that
//! WRITES transactions. This module only names chains and their ids.
//!
//! WHY THIS IS AN ENUM AND NOT A BARE INTEGER
//! ------------------------------------------
//! `g_ledger.chain_id` defaults to Celo in SQL, which is correct for the ~731
//! rows that predate any second chain. But a default is a trap for new code: an
//! Avalanche payout whose call site forgot to pass a chain would silently record
//! as Celo, and nothing would ever surface it. Reporting would be quietly wrong
//! and the money would still have moved.
//!
//! So `insert_ledger_entry` takes a `ChainId` as a REQUIRED argument. The
//! compiler, not a code reviewer, is what stops that mistake. This codebase has
//! already been bitten once by a silent write failure (the 999 XP cap, swallowed
//! by `let _ =`), which is the argument for paying the small ergonomic cost here.

/// Celo mainnet. Every StillHunt transaction before the multichain work was here.
pub const CELO: i32 = 42220;

/// Avalanche C-Chain mainnet.
///
/// A public chain that already exists, which is why this is a constant rather
/// than configuration: 43114 is as fixed a fact as Celo's 42220. StillHunt deploys
/// its own contracts here; it does not run this chain.
pub const AVALANCHE: i32 = 43114;

/// Chains StillHunt can record a transaction on.
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum ChainId {
    /// G$ payouts, GoodDollar identity, MiniPay. The money rail.
    Celo,
    /// Scrip, the marketplace and match records. The activity rail.
    Avalanche,
}

impl ChainId {
    /// The numeric id to store.
    pub fn as_i32(self) -> i32 {
        match self {
            ChainId::Celo => CELO,
            ChainId::Avalanche => AVALANCHE,
        }
    }

    /// What players earn and spend here. Used for ledger display and for the
    /// Bank's payout options.
    pub fn currency_symbol(self) -> &'static str {
        match self {
            ChainId::Celo => "G$",
            ChainId::Avalanche => "SCRP",
        }
    }

    /// Does this chain pay real, withdrawable money?
    ///
    /// Celo does: G$ is a live currency with an exchange rate, and the
    /// GoodDollar whitelist is what stops one person farming it from fifty
    /// wallets. Scrip does NOT, and that is deliberate — there is no
    /// proof-of-unique-human available on Avalanche, so Scrip must stay
    /// unsellable until the Bank's AVAX swap exists and is funded from real
    /// revenue rather than minted supply. Fifty farmed wallets earning fifty
    /// piles of something with no exit is not an attack worth mounting.
    ///
    /// Flipping this to true without a sybil answer is the single most expensive
    /// mistake available in this codebase.
    pub fn is_redeemable(self) -> bool {
        match self {
            ChainId::Celo => true,
            ChainId::Avalanche => false,
        }
    }

    /// Recognise a stored id. Unknown ids read as `None` rather than falling
    /// back to Celo, because mislabelling an Avalanche row as Celo is exactly
    /// the corruption this module exists to prevent.
    pub fn from_i32(id: i32) -> Option<Self> {
        match id {
            CELO => Some(ChainId::Celo),
            AVALANCHE => Some(ChainId::Avalanche),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_round_trip() {
        for c in [ChainId::Celo, ChainId::Avalanche] {
            assert_eq!(ChainId::from_i32(c.as_i32()), Some(c), "{c:?}");
        }
        assert_eq!(ChainId::Celo.as_i32(), 42220);
        assert_eq!(ChainId::Avalanche.as_i32(), 43114);
    }

    #[test]
    fn an_unknown_id_is_none_not_celo() {
        // The dangerous direction: a row written by a future chain must not read
        // back as Celo and quietly join Celo's grant-reported volume.
        assert_eq!(ChainId::from_i32(1), None);
        assert_eq!(ChainId::from_i32(43113), None, "Fuji testnet is not mainnet");
        assert_eq!(ChainId::from_i32(0), None);
    }

    #[test]
    fn only_celo_pays_real_money() {
        // Scrip has no exit, which is the whole reason Avalanche needs no
        // proof-of-unique-human yet. If this test ever fails, a sybil answer
        // had better have shipped alongside it.
        assert!(ChainId::Celo.is_redeemable());
        assert!(!ChainId::Avalanche.is_redeemable());
    }

    #[test]
    fn the_currencies_are_distinct() {
        assert_eq!(ChainId::Celo.currency_symbol(), "G$");
        assert_eq!(ChainId::Avalanche.currency_symbol(), "SCRP");
    }
}
