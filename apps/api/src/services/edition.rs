//! Which edition of StillHunt a player belongs to, and whether it pays real money.
//!
//! StillHunt ships through several doors from one codebase (`apps/web/src/editions`):
//! the open web, MiniPay's in-app browser, and later Avalanche. They do not share an
//! economy:
//!
//!   • web       — pays real G$, gated on the GoodDollar whitelist in onboarding
//!   • minipay   — pays NOTHING. No identity gate, precisely because nothing pays
//!                 out. Players spend real stablecoins in the shop; they never earn.
//!   • avalanche — not built. Non-earning until it has a sybil answer of its own.
//!
//! WHY THIS IS A DATABASE COLUMN AND NOT A REQUEST HEADER
//! ------------------------------------------------------
//! The server cannot tell which edition a request came from. Every edition is served
//! from the same domain and origin on purpose, so existing players are never told to
//! go play the same game somewhere else. There is no header, key or origin that
//! distinguishes them that a browser could not also send.
//!
//! So the assertion is made once, at signup, and STORED. Every payout afterwards
//! reads the stored value. That converts a per-request lie into a one-time, sticky,
//! auditable choice, and it removes the dangerous direction entirely: a player who
//! signed up in MiniPay cannot later claim to be a web player to unlock earning.
//!
//! WHAT THIS DOES NOT DEFEND AGAINST
//! ---------------------------------
//! A client that lies AT SIGNUP, claiming `web` while running inside MiniPay. This
//! layer does not stop that, and it is important not to pretend otherwise. What
//! stops it is the GoodDollar whitelist that the web edition gates earning on: a
//! liar lands in the earning edition and then has to pass the same identity check as
//! everyone else. The edition column decides which rules apply; identity is what
//! makes the earning rules worth anything.
//!
//! The reverse lie — claiming `minipay` from a browser — costs the liar their own
//! earnings and gains them nothing, so it needs no defence.

use sqlx::PgPool;

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum Edition {
    Web,
    MiniPay,
    Avalanche,
}

impl Edition {
    /// Parse a client-asserted or stored value. Unknown input is `Web`, matching the
    /// column default: an unrecognised string must not silently stop paying a real
    /// player, which is the worse of the two failures.
    pub fn parse(value: &str) -> Self {
        match value.trim().to_ascii_lowercase().as_str() {
            "minipay" => Edition::MiniPay,
            "avalanche" => Edition::Avalanche,
            _ => Edition::Web,
        }
    }

    /// The canonical string, and the only values the CHECK constraint accepts.
    pub fn as_str(self) -> &'static str {
        match self {
            Edition::Web => "web",
            Edition::MiniPay => "minipay",
            Edition::Avalanche => "avalanche",
        }
    }

    /// Does play in this edition pay real, withdrawable money?
    ///
    /// This is the whole policy, in one place, so a new earn surface cannot forget
    /// to ask. It is deliberately about MONEY only: XP, ranks, unlocks, scores and
    /// leaderboards are untouched in every edition, exactly as under the earning
    /// pause. A MiniPay player progresses normally, they just bank nothing.
    pub fn earns_real_money(self) -> bool {
        match self {
            Edition::Web => true,
            // Nothing pays out here, so there is no identity gate and no sybil
            // surface. Both halves have to stay true together: if MiniPay ever
            // starts paying, it needs a proof-of-unique-human first.
            Edition::MiniPay => false,
            // Not built. GoodDollar is Celo and Fuse only, so this edition has no
            // proof-of-unique-human at all yet. Non-earning until it does.
            Edition::Avalanche => false,
        }
    }
}

/// The edition a wallet signed up in.
///
/// An unknown wallet reads as `Web`. That matters for the reward paths, which can be
/// reached by a wallet whose player row is still being written, and for the roughly
/// 120 players who predate this column. Refusing to pay on a missed lookup would turn
/// a transient read into a silent pay cut, which is the failure mode `cap_reward`'s
/// pool-balance read is also written to avoid.
pub async fn player_edition(db: &PgPool, wallet: &str) -> Edition {
    let row: Option<(String,)> =
        sqlx::query_as("SELECT edition FROM players WHERE wallet_address = $1")
            .bind(wallet)
            .fetch_optional(db)
            .await
            .unwrap_or(None);
    row.map(|(e,)| Edition::parse(&e)).unwrap_or(Edition::Web)
}

/// Whether this wallet may be paid real money at all. The single question every
/// payout path asks.
pub async fn wallet_earns(db: &PgPool, wallet: &str) -> bool {
    player_edition(db, wallet).await.earns_real_money()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_web_edition_pays() {
        assert!(Edition::Web.earns_real_money());
        assert!(!Edition::MiniPay.earns_real_money());
        assert!(!Edition::Avalanche.earns_real_money());
    }

    #[test]
    fn unknown_values_read_as_web() {
        // The safe direction: a typo, a future edition this build predates, or a
        // truncated column must not stop paying an existing player.
        for v in ["", "web", "WEB", " Web ", "banana", "minipayy"] {
            assert_eq!(Edition::parse(v), Edition::Web, "{v:?}");
        }
    }

    #[test]
    fn the_non_earning_editions_parse_exactly() {
        for v in ["minipay", "MiniPay", " MINIPAY "] {
            assert_eq!(Edition::parse(v), Edition::MiniPay, "{v:?}");
        }
        for v in ["avalanche", "Avalanche"] {
            assert_eq!(Edition::parse(v), Edition::Avalanche, "{v:?}");
        }
    }

    #[test]
    fn as_str_round_trips_through_parse() {
        // as_str() is what reaches the CHECK constraint, so a value that does not
        // survive the round trip would be stored and then read back as something
        // else — a player silently changing edition.
        for e in [Edition::Web, Edition::MiniPay, Edition::Avalanche] {
            assert_eq!(Edition::parse(e.as_str()), e);
        }
    }
}
