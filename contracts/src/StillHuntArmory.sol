// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title StillHuntArmory — every piece of gear in the game, as an ERC-1155
/// @notice One token id per item: rifles, optics, ammunition, field kits, cosmetics.
///         Players own their gear outright, which is what makes the resale market in
///         StillHuntMarketplace possible — the contract moves an asset the player
///         holds rather than a row in our database.
///
/// @dev Minting is restricted to the marketplace. That is the whole access-control
///      story: gear enters circulation by being BOUGHT, never by being granted, so
///      there is no path by which the studio quietly mints itself inventory. Items
///      must be registered by the owner before they can be minted, so a typo'd id
///      mints nothing rather than creating an item that exists on-chain and nowhere
///      else.
contract StillHuntArmory is ERC1155Upgradeable, OwnableUpgradeable, UUPSUpgradeable {
    string public name;
    string public symbol;

    /// @notice The only address allowed to mint.
    address public marketplace;

    /// @notice item id => max supply. 0 means unlimited.
    mapping(uint256 => uint256) public maxSupply;
    /// @notice item id => how many have been minted so far.
    mapping(uint256 => uint256) public totalMinted;
    /// @notice item id => metadata URI.
    mapping(uint256 => string) private _itemUris;
    /// @notice item id => registered. Distinguishes "unlimited supply" from "unknown
    ///         item", which `maxSupply == 0` alone cannot.
    mapping(uint256 => bool) public registered;

    event MarketplaceSet(address indexed marketplace);
    event ItemRegistered(uint256 indexed itemId, uint256 maxSupply);

    error OnlyMarketplace();
    error ItemNotRegistered(uint256 itemId);
    error MaxSupplyReached(uint256 itemId);
    error ZeroAddress();

    modifier onlyMarketplace() {
        if (msg.sender != marketplace) revert OnlyMarketplace();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _owner) public initializer {
        __ERC1155_init("");
        __Ownable_init(_owner);
        name = "StillHunt Armory";
        symbol = "ARMS";
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function setMarketplace(address _marketplace) external onlyOwner {
        if (_marketplace == address(0)) revert ZeroAddress();
        marketplace = _marketplace;
        emit MarketplaceSet(_marketplace);
    }

    /// @notice Make an item mintable. Re-registering updates supply and metadata.
    /// @param _maxSupply 0 for unlimited; any other value is a hard ceiling.
    function registerItem(uint256 itemId, uint256 _maxSupply, string calldata metadataUri)
        external
        onlyOwner
    {
        registered[itemId] = true;
        maxSupply[itemId] = _maxSupply;
        _itemUris[itemId] = metadataUri;
        emit ItemRegistered(itemId, _maxSupply);
    }

    /// @notice Mint gear to a buyer. Marketplace only.
    /// @dev Reverts on an unregistered id rather than minting it. An unregistered item
    ///      has no metadata and no supply rule, so it would render as a blank in every
    ///      client — an item that exists on-chain and nowhere else.
    function mint(address to, uint256 itemId, uint256 amount) external onlyMarketplace {
        if (!registered[itemId]) revert ItemNotRegistered(itemId);
        uint256 max = maxSupply[itemId];
        if (max > 0 && totalMinted[itemId] + amount > max) revert MaxSupplyReached(itemId);
        totalMinted[itemId] += amount;
        _mint(to, itemId, amount, "");
    }

    function uri(uint256 itemId) public view override returns (string memory) {
        string memory itemUri = _itemUris[itemId];
        return bytes(itemUri).length > 0 ? itemUri : super.uri(itemId);
    }

    function remainingSupply(uint256 itemId) external view returns (uint256) {
        uint256 max = maxSupply[itemId];
        if (max == 0) return type(uint256).max;
        return max - totalMinted[itemId];
    }
}
