// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/StillHuntArmory.sol";
import "../src/StillHuntMarketplace.sol";

/// @notice Registers the gear catalogue on-chain and lists it for sale.
///
/// Two calls per item, and both are needed: `registerItem` makes an id mintable
/// and gives it a supply rule, `listItem` gives it a price. An item with only the
/// first is unbuyable; one with only the second reverts at mint time. The shop
/// renders empty until this has run.
///
/// Idempotent. Re-running overwrites each item's supply, metadata and price with
/// the same values, so it is safe to run again after adding items.
///
/// Prices are whole TALLY and mirror `items.price_g` in the database. The two must
/// agree: the marketplace charges from ITS listing, so a database price that has
/// drifted shows the player one number and takes another.
///
///   forge script script/RegisterItems.s.sol --rpc-url $AVALANCHE_RPC_URL --broadcast
contract RegisterItems is Script {
    StillHuntArmory   armory;
    StillHuntMarketplace market;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        armory = StillHuntArmory(vm.envAddress("ARMORY_ADDRESS"));
        market = StillHuntMarketplace(vm.envAddress("MARKETPLACE_ADDRESS"));

        vm.startBroadcast(pk);
        _add(1, 5, 0, "Iron Sword");
        _add(2, 15, 0, "Steel Blade");
        _add(3, 35, 0, "Void Edge");
        _add(4, 5, 0, "Iron Shield");
        _add(5, 20, 0, "StillHunt Guard");
        _add(6, 40, 0, "Fortress Wall");
        _add(7, 30, 0, "XP Booster");
        _add(8, 75, 0, "Elite Booster");
        _add(9, 100, 50, "The Last Blade");
        _add(10, 90, 0, "Compact SMG");
        _add(11, 250, 0, "Assault Rifle");
        _add(12, 500, 0, "Marksman Rifle");
        _add(13, 1200, 0, "StillHunt Prototype");
        _add(14, 40, 0, "Hollow Point Rounds");
        _add(15, 120, 0, "Armor Piercing Rounds");
        _add(16, 50, 0, "Tracer Rounds");
        _add(17, 250, 0, "Incendiary Rounds");
        _add(18, 60, 0, "Suppressor");
        _add(19, 140, 0, "Extended Barrel");
        _add(20, 50, 0, "Red Dot Sight");
        _add(21, 160, 0, "ACOG Scope");
        _add(22, 45, 0, "Foregrip");
        _add(23, 130, 0, "Quick Grip");
        _add(24, 50, 0, "Extended Magazine");
        _add(25, 150, 0, "Speed Loader");
        _add(26, 45, 0, "Tactical Flashlight");
        _add(27, 180, 0, "Night Vision Goggles");
        _add(28, 70, 0, "Laser Sight");
        _add(29, 3000, 0, "Ashfall Carbine");
        _add(30, 4500, 0, "Warden's Repeater");
        _add(31, 6500, 0, "Rift Lance");
        _add(32, 8000, 0, "Seraph");
        _add(33, 10000, 0, "Ember Halo");
        vm.stopBroadcast();

        console.log("catalogue registered + listed");
    }

    /// @param supply 0 = unlimited.
    function _add(uint256 id, uint256 priceTally, uint256 supply, string memory name) internal {
        armory.registerItem(id, supply, string.concat("stillhunt://item/", vm.toString(id)));
        market.listItem(id, priceTally * 1e18);
        console.log(name, id, priceTally);
    }
}
