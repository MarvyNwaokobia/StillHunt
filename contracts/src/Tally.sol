// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title Tally — StillHunt's in-game currency on Avalanche C-Chain
/// @notice A tally is the count a hunter keeps, and a tally stick was real money for
///         six hundred years: a notched piece of wood, split in two, that settled debts
///         because both halves matched. Both meanings are the point. Your balance IS
///         your record of what you took, and it is money only inside the game that
///         issued it.
///
/// @dev WHY THIS IS NOT REDEEMABLE
///      There is no proof-of-unique-human available on Avalanche. If TALLY could be
///      sold for AVAX, one person farming fifty wallets would be worth doing on day
///      one, and StillHunt would be shipping a faucet with no meter on it. Because it
///      cannot be sold, that attack is not worth mounting, and the game needs no
///      identity gate to launch.
///
///      This is a constraint the design leans on rather than works around. Value still
///      MOVES — duel stakes and marketplace resale move TALLY between players, with a
///      house cut on each. That is value circulating, not value issued, so there is no
///      pool to keep funded and nothing a grinder can drain.
///
///      An exit (a TALLY→AVAX swap) must be funded from that house-cut revenue, never
///      from minted supply, and must sit behind an identity gate before it opens. This
///      contract deliberately does not implement one. Adding a redemption path is the
///      single most expensive change available in this repo and belongs in a separate,
///      reviewed contract with its own funding source — not bolted on here.
///
/// @dev SUPPLY
///      A fixed ceiling, minted on demand up to it. The cap is what makes the token
///      credible to a player and to a reviewer: "the studio can print without limit" is
///      a far worse thing to defend than a number anyone can check on-chain. Past the
///      cap, rewards come from what flows back through sinks.
///
/// @dev PERMIT
///      EIP-2612, so the marketplace can check out via a signed permit relayed by the
///      backend and the player never needs gas. The EIP-712 domain is THIS token's own
///      (name "Tally", version "1"); copying another token's domain produces signatures
///      that verify in the browser and revert on-chain.
contract Tally is ERC20, ERC20Permit, ERC20Burnable, Ownable {
    /// @notice Hard ceiling on total supply. 1 billion TALLY.
    uint256 public constant MAX_SUPPLY = 1_000_000_000e18;

    /// @notice Addresses allowed to mint rewards — the backend relay, and later any
    ///         contract that issues TALLY directly.
    /// @dev    A set rather than a single address so the relay can be rotated without
    ///         redeploying, and a compromised relay can be revoked without taking the
    ///         game down. Rotation is expected, not exceptional.
    mapping(address => bool) public minters;

    event MinterSet(address indexed account, bool allowed);

    error NotMinter(address caller);
    error MaxSupplyExceeded(uint256 requested, uint256 remaining);
    error ZeroAddress();

    modifier onlyMinter() {
        if (!minters[msg.sender]) revert NotMinter(msg.sender);
        _;
    }

    /// @param owner_ Contract owner: can add and remove minters.
    constructor(address owner_) ERC20("Tally", "TALLY") ERC20Permit("Tally") Ownable(owner_) {
        if (owner_ == address(0)) revert ZeroAddress();
    }

    /// @notice Allow or revoke an address's ability to mint.
    function setMinter(address account, bool allowed) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        minters[account] = allowed;
        emit MinterSet(account, allowed);
    }

    /// @notice Issue TALLY to a player. Called by the backend when a claim settles.
    /// @dev    Reverts past MAX_SUPPLY rather than silently minting what is left. A
    ///         partial mint would settle a claim for less than the player was owed
    ///         while the database recorded the full amount — a discrepancy nobody
    ///         notices until someone audits the two against each other.
    function mint(address to, uint256 amount) external onlyMinter {
        uint256 remaining = MAX_SUPPLY - totalSupply();
        if (amount > remaining) revert MaxSupplyExceeded(amount, remaining);
        _mint(to, amount);
    }
}
