// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/Tally.sol";
import "../src/StillHuntArmory.sol";
import "../src/StillHuntMarketplace.sol";
import "../src/StillHuntDuels.sol";
import "../src/StillHuntRecord.sol";

/// @notice Deploys the whole StillHunt contract set to Avalanche C-Chain.
///
/// Run:
///   forge script script/Deploy.s.sol --rpc-url $AVALANCHE_RPC_URL --broadcast --verify
///
/// Requires in contracts/.env:
///   DEPLOYER_PRIVATE_KEY  funds the deploy and becomes the owner
///   RELAY_ADDRESS         the backend wallet: mints TALLY, records matches, resolves duels
///
/// Prefer a private RPC before --broadcast. Public endpoints rate-limit, and a deploy
/// that dies halfway leaves orphan contracts you have already paid for.
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address owner = vm.addr(pk);
        address relay = vm.envAddress("RELAY_ADDRESS");

        require(relay != address(0), "RELAY_ADDRESS not set");

        vm.startBroadcast(pk);

        // 1. TALLY. Not upgradeable, on purpose: a token whose rules the studio can
        //    rewrite is not a credible fixed supply, and the cap is the entire reason
        //    a player should trust the number.
        Tally tally = new Tally(owner);

        // 2. Armory (ERC-1155), behind a proxy.
        StillHuntArmory armoryImpl = new StillHuntArmory();
        ERC1967Proxy armoryProxy = new ERC1967Proxy(
            address(armoryImpl),
            abi.encodeCall(StillHuntArmory.initialize, (owner))
        );
        StillHuntArmory armory = StillHuntArmory(address(armoryProxy));

        // 3. Marketplace, behind a proxy.
        StillHuntMarketplace marketImpl = new StillHuntMarketplace();
        ERC1967Proxy marketProxy = new ERC1967Proxy(
            address(marketImpl),
            abi.encodeCall(
                StillHuntMarketplace.initialize,
                (address(tally), address(armory), owner)
            )
        );
        StillHuntMarketplace marketplace = StillHuntMarketplace(address(marketProxy));

        // 4. Duels, behind a proxy. The relay resolves matches.
        StillHuntDuels duelsImpl = new StillHuntDuels();
        ERC1967Proxy duelsProxy = new ERC1967Proxy(
            address(duelsImpl),
            abi.encodeCall(StillHuntDuels.initialize, (address(tally), relay, owner))
        );
        StillHuntDuels duels = StillHuntDuels(address(duelsProxy));

        // 5. Record, behind a proxy. The relay writes it.
        StillHuntRecord recordImpl = new StillHuntRecord();
        ERC1967Proxy recordProxy = new ERC1967Proxy(
            address(recordImpl),
            abi.encodeCall(StillHuntRecord.initialize, (relay, owner))
        );
        StillHuntRecord record = StillHuntRecord(address(recordProxy));

        // 6. Wiring. Only the marketplace may mint gear; only the relay may mint TALLY.
        armory.setMarketplace(address(marketplace));
        tally.setMinter(relay, true);

        vm.stopBroadcast();

        console.log("== StillHunt deployed ==");
        console.log("owner           ", owner);
        console.log("relay           ", relay);
        console.log("Tally  (TALLY)  ", address(tally));
        console.log("Armory  proxy   ", address(armory));
        console.log("Market  proxy   ", address(marketplace));
        console.log("Duels   proxy   ", address(duels));
        console.log("Record  proxy   ", address(record));
        console.log("");
        console.log("Set these in the web env:");
        console.log("  NEXT_PUBLIC_TALLY_ADDRESS       ", address(tally));
        console.log("  NEXT_PUBLIC_MARKETPLACE_ADDRESS ", address(marketplace));
        console.log("  NEXT_PUBLIC_DUELS_ADDRESS       ", address(duels));
        console.log("  NEXT_PUBLIC_GAME_RECORD_ADDRESS ", address(record));
    }
}
