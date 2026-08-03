// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "./StillHuntArmory.sol";

/// @title StillHuntMarketplace — the shop, and the player-to-player market
/// @notice Two halves that share a fee accumulator:
///
///   PRIMARY   the studio lists gear at a price; buying mints a new item.
///   RESALE    a player lists gear they own; buying transfers it and pays them,
///             minus a platform fee.
///
/// Resale is the half that matters to StillHunt's economy. TALLY is not redeemable,
/// so the only way it acquires real weight is by CIRCULATING — a player who wants a
/// rifle another player owns has to earn or win the TALLY to buy it. The fee on that
/// trade is revenue that arrives without minting a single new token.
///
/// @dev GAS. Both purchase paths accept an EIP-2612 permit so the backend relay can
///      submit the transaction and pay AVAX on the player's behalf. A player never
///      needs a funded wallet to buy anything, which removes the single largest drop-
///      off in onboarding a non-crypto audience.
///
/// @dev REENTRANCY. OpenZeppelin 5.x's `ReentrancyGuard` keeps its flag in a namespaced
///      ERC-7201 slot rather than a declared state variable, so it claims no slot in
///      this contract's layout and is safe behind a proxy — which is why there is no
///      `ReentrancyGuardUpgradeable` in the upgradeable package to reach for. Its
///      constructor does not run here, leaving the flag at 0 instead of NOT_ENTERED(1);
///      that is harmless, because the guard tests for ENTERED(2) and writes
///      NOT_ENTERED after the first call. Do NOT "fix" it by declaring a `_status`.
contract StillHuntMarketplace is
    OwnableUpgradeable,
    ReentrancyGuard,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    /// @notice TALLY.
    IERC20 public currency;
    /// @notice The ERC-1155 this marketplace is allowed to mint.
    StillHuntArmory public armory;

    struct Listing {
        uint256 itemId;
        uint256 price;
        bool active;
    }

    /// @notice item id => studio listing.
    mapping(uint256 => Listing) public listings;
    uint256[] public listedItemIds;

    /// @notice Fees and primary-sale revenue, withdrawable by the owner. This is the
    ///         only money StillHunt takes, and it is the intended funding source for a
    ///         future TALLY exit — see the note in Tally.sol.
    uint256 public accumulatedRevenue;

    struct ResaleListing {
        address seller;
        uint256 itemId;
        uint256 price;
        bool active;
    }

    mapping(uint256 => ResaleListing) public resaleListings;
    uint256 public nextResaleId;
    /// @notice Platform fee on a resale, in basis points. 500 = 5%.
    uint256 public feeBps;

    uint256[] private _activeResaleIds;
    /// @dev resaleId => index+1 into `_activeResaleIds`. 0 means "not active", which is
    ///      why it is stored offset by one rather than as a bare index.
    mapping(uint256 => uint256) private _activeIndexPlus1;

    event ItemListed(uint256 indexed itemId, uint256 price);
    event ItemDelisted(uint256 indexed itemId);
    event ItemPurchased(address indexed buyer, uint256 indexed itemId, uint256 price);
    event RevenueWithdrawn(address indexed to, uint256 amount);
    event ResaleListed(uint256 indexed resaleId, address indexed seller, uint256 indexed itemId, uint256 price);
    event ResaleCancelled(uint256 indexed resaleId);
    event ResalePurchased(uint256 indexed resaleId, address indexed buyer, address seller, uint256 itemId, uint256 price, uint256 fee);
    event FeeBpsSet(uint256 bps);

    error ItemNotListed();
    error InvalidPrice();
    error ResaleNotActive();
    error NotSeller();
    error CannotBuyOwnListing();
    error NotItemOwner();
    error MarketplaceNotApproved();
    error FeeTooHigh();
    error ZeroAddress();
    error NothingToWithdraw();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _currency, address _armory, address _owner) public initializer {
        if (_currency == address(0) || _armory == address(0)) revert ZeroAddress();
        __Ownable_init(_owner);
        currency = IERC20(_currency);
        armory = StillHuntArmory(_armory);
        feeBps = 500; // 5%
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ── Primary sale ──────────────────────────────────────────────────────────

    function listItem(uint256 itemId, uint256 price) external onlyOwner {
        if (price == 0) revert InvalidPrice();
        if (!listings[itemId].active) listedItemIds.push(itemId);
        listings[itemId] = Listing({ itemId: itemId, price: price, active: true });
        emit ItemListed(itemId, price);
    }

    function delistItem(uint256 itemId) external onlyOwner {
        listings[itemId].active = false;
        emit ItemDelisted(itemId);
    }

    /// @notice Buy a studio-listed item with a signed permit. The caller (our relay)
    ///         pays gas; the buyer signed off-chain and needs no AVAX.
    /// @dev The permit is consumed for exactly `price`, so a relay cannot reuse a
    ///      signature to pull more than the listing costs.
    function purchaseWithPermit(
        address buyer,
        uint256 itemId,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        Listing storage listing = listings[itemId];
        if (!listing.active) revert ItemNotListed();
        uint256 price = listing.price;

        IERC20Permit(address(currency)).permit(buyer, address(this), price, deadline, v, r, s);
        IERC20(address(currency)).safeTransferFrom(buyer, address(this), price);

        accumulatedRevenue += price;
        armory.mint(buyer, itemId, 1);

        emit ItemPurchased(buyer, itemId, price);
    }

    /// @notice Buy with an allowance the buyer approved themselves (they pay gas).
    function purchase(uint256 itemId) external nonReentrant {
        Listing storage listing = listings[itemId];
        if (!listing.active) revert ItemNotListed();
        uint256 price = listing.price;

        IERC20(address(currency)).safeTransferFrom(msg.sender, address(this), price);
        accumulatedRevenue += price;
        armory.mint(msg.sender, itemId, 1);

        emit ItemPurchased(msg.sender, itemId, price);
    }

    function withdrawRevenue(address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 amount = accumulatedRevenue;
        if (amount == 0) revert NothingToWithdraw();
        accumulatedRevenue = 0;
        IERC20(address(currency)).safeTransfer(to, amount);
        emit RevenueWithdrawn(to, amount);
    }

    function getListedItemCount() external view returns (uint256) {
        return listedItemIds.length;
    }

    // ── Resale ────────────────────────────────────────────────────────────────

    function setFeeBps(uint256 _bps) external onlyOwner {
        if (_bps > 2000) revert FeeTooHigh(); // 20% ceiling, enforced on-chain
        feeBps = _bps;
        emit FeeBpsSet(_bps);
    }

    /// @notice List gear you own. Requires `armory.setApprovalForAll(marketplace, true)`
    ///         first — the seller keeps custody until someone actually buys.
    function listForResale(uint256 itemId, uint256 price) external returns (uint256 resaleId) {
        if (price == 0) revert InvalidPrice();
        if (armory.balanceOf(msg.sender, itemId) == 0) revert NotItemOwner();
        if (!armory.isApprovedForAll(msg.sender, address(this))) revert MarketplaceNotApproved();

        resaleId = nextResaleId++;
        resaleListings[resaleId] = ResaleListing({
            seller: msg.sender,
            itemId: itemId,
            price: price,
            active: true
        });
        _addActive(resaleId);
        emit ResaleListed(resaleId, msg.sender, itemId, price);
    }

    function cancelResale(uint256 resaleId) external {
        ResaleListing storage l = resaleListings[resaleId];
        if (!l.active) revert ResaleNotActive();
        if (l.seller != msg.sender) revert NotSeller();
        l.active = false;
        _removeActive(resaleId);
        emit ResaleCancelled(resaleId);
    }

    /// @notice Buy a resale listing on an allowance you approved yourself.
    function buyResale(uint256 resaleId) external nonReentrant {
        _executeResale(resaleId, msg.sender);
    }

    /// @notice Buy a resale listing gaslessly, authorising the spend with a permit.
    /// @dev VALIDATION HAPPENS BEFORE THE PERMIT, deliberately. Reading the price and
    ///      consuming the signature first means a listing that was cancelled or already
    ///      sold burns the buyer's permit and then reverts — they paid attention to a
    ///      signature that bought nothing, and the price read came from a stale struct.
    ///      Checking first costs one storage read and makes the failure legible.
    function buyResaleWithPermit(
        uint256 resaleId,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        ResaleListing storage l = resaleListings[resaleId];
        if (!l.active) revert ResaleNotActive();
        if (msg.sender == l.seller) revert CannotBuyOwnListing();
        uint256 price = l.price;

        IERC20Permit(address(currency)).permit(msg.sender, address(this), price, deadline, v, r, s);
        _executeResale(resaleId, msg.sender);
    }

    function _executeResale(uint256 resaleId, address buyer) private {
        ResaleListing storage l = resaleListings[resaleId];
        if (!l.active) revert ResaleNotActive();
        if (buyer == l.seller) revert CannotBuyOwnListing();

        address seller = l.seller;
        uint256 itemId = l.itemId;
        uint256 price = l.price;

        // Effects before interactions.
        l.active = false;
        _removeActive(resaleId);

        // The seller may have transferred the item away since listing it.
        if (armory.balanceOf(seller, itemId) == 0) revert NotItemOwner();

        IERC20(address(currency)).safeTransferFrom(buyer, address(this), price);
        uint256 fee = (price * feeBps) / 10000;
        uint256 toSeller = price - fee;
        accumulatedRevenue += fee;
        if (toSeller > 0) IERC20(address(currency)).safeTransfer(seller, toSeller);

        armory.safeTransferFrom(seller, buyer, itemId, 1, "");

        emit ResalePurchased(resaleId, buyer, seller, itemId, price, fee);
    }

    function _addActive(uint256 resaleId) private {
        _activeResaleIds.push(resaleId);
        _activeIndexPlus1[resaleId] = _activeResaleIds.length;
    }

    /// @dev Swap-and-pop. Order of `_activeResaleIds` is not meaningful; clients sort.
    function _removeActive(uint256 resaleId) private {
        uint256 idxPlus1 = _activeIndexPlus1[resaleId];
        if (idxPlus1 == 0) return;
        uint256 idx = idxPlus1 - 1;
        uint256 lastIdx = _activeResaleIds.length - 1;
        if (idx != lastIdx) {
            uint256 lastId = _activeResaleIds[lastIdx];
            _activeResaleIds[idx] = lastId;
            _activeIndexPlus1[lastId] = idx + 1;
        }
        _activeResaleIds.pop();
        _activeIndexPlus1[resaleId] = 0;
    }

    function getActiveResales()
        external
        view
        returns (uint256[] memory ids, ResaleListing[] memory entries)
    {
        uint256 n = _activeResaleIds.length;
        ids = new uint256[](n);
        entries = new ResaleListing[](n);
        for (uint256 i; i < n; i++) {
            ids[i] = _activeResaleIds[i];
            entries[i] = resaleListings[_activeResaleIds[i]];
        }
    }

    function getActiveResaleCount() external view returns (uint256) {
        return _activeResaleIds.length;
    }
}
