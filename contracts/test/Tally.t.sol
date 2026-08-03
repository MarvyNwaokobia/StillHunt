// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/Tally.sol";

contract TallyTest is Test {
    Tally tally;

    address owner = address(0xA11CE);
    address relay = address(0xBEEF);
    address player = address(0xCAFE);

    function setUp() public {
        tally = new Tally(owner);
        vm.prank(owner);
        tally.setMinter(relay, true);
    }

    function test_Metadata() public view {
        assertEq(tally.name(), "Tally");
        assertEq(tally.symbol(), "TALLY");
        assertEq(tally.decimals(), 18);
    }

    function test_MinterCanMint() public {
        vm.prank(relay);
        tally.mint(player, 100e18);
        assertEq(tally.balanceOf(player), 100e18);
    }

    function test_NonMinterCannotMint() public {
        vm.expectRevert(abi.encodeWithSelector(Tally.NotMinter.selector, player));
        vm.prank(player);
        tally.mint(player, 1e18);
    }

    /// The owner administers minters; it is not itself one. Keeping those separate
    /// means a compromised owner key still cannot print supply in a single call.
    function test_OwnerIsNotAutomaticallyAMinter() public {
        vm.expectRevert(abi.encodeWithSelector(Tally.NotMinter.selector, owner));
        vm.prank(owner);
        tally.mint(player, 1e18);
    }

    function test_MinterCanBeRevoked() public {
        vm.prank(owner);
        tally.setMinter(relay, false);
        vm.expectRevert(abi.encodeWithSelector(Tally.NotMinter.selector, relay));
        vm.prank(relay);
        tally.mint(player, 1e18);
    }

    function test_OnlyOwnerSetsMinters() public {
        vm.expectRevert();
        vm.prank(player);
        tally.setMinter(player, true);
    }

    function test_ConstructorRejectsZeroOwner() public {
        vm.expectRevert();
        new Tally(address(0));
    }

    /// The cap is the token's whole credibility claim. It must be enforced, and it
    /// must revert rather than mint a partial amount — a partial mint would settle a
    /// claim for less than the database recorded.
    function test_CapIsEnforced() public {
        uint256 max = tally.MAX_SUPPLY();
        vm.prank(relay);
        tally.mint(player, max);
        assertEq(tally.totalSupply(), max);

        vm.expectRevert(abi.encodeWithSelector(Tally.MaxSupplyExceeded.selector, 1, 0));
        vm.prank(relay);
        tally.mint(player, 1);
    }

    function test_CapRevertsRatherThanMintingPartially() public {
        uint256 max = tally.MAX_SUPPLY();
        vm.prank(relay);
        tally.mint(player, max - 10);

        // Asking for 50 with 10 left must mint NOTHING, not 10.
        vm.expectRevert(abi.encodeWithSelector(Tally.MaxSupplyExceeded.selector, 50, 10));
        vm.prank(relay);
        tally.mint(player, 50);
        assertEq(tally.balanceOf(player), max - 10, "balance moved on a reverted mint");
    }

    function test_BurningFreesCapRoom() public {
        uint256 max = tally.MAX_SUPPLY();
        vm.prank(relay);
        tally.mint(player, max);

        vm.prank(player);
        tally.burn(100e18);

        vm.prank(relay);
        tally.mint(player, 100e18); // fits again
        assertEq(tally.totalSupply(), max);
    }

    // ── Permit ────────────────────────────────────────────────────────────────

    function _permitDigest(
        uint256 ownerPk,
        address spender,
        uint256 value,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        address signer = vm.addr(ownerPk);
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                signer,
                spender,
                value,
                tally.nonces(signer),
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", tally.DOMAIN_SEPARATOR(), structHash));
        (v, r, s) = vm.sign(ownerPk, digest);
    }

    function test_PermitGivesAllowanceWithoutGasFromTheOwner() public {
        uint256 pk = 0xA11CE5;
        address signer = vm.addr(pk);
        vm.prank(relay);
        tally.mint(signer, 100e18);

        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _permitDigest(pk, relay, 50e18, deadline);

        // Submitted by the relay, not the signer — the whole point of the pattern.
        vm.prank(relay);
        tally.permit(signer, relay, 50e18, deadline, v, r, s);
        assertEq(tally.allowance(signer, relay), 50e18);
    }

    function test_PermitCannotBeReplayed() public {
        uint256 pk = 0xA11CE5;
        address signer = vm.addr(pk);
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _permitDigest(pk, relay, 50e18, deadline);

        tally.permit(signer, relay, 50e18, deadline, v, r, s);
        vm.expectRevert(); // nonce consumed
        tally.permit(signer, relay, 50e18, deadline, v, r, s);
    }

    /// The domain must be Tally's OWN. A signature produced against a different
    /// token's domain verifies in a browser and reverts here, which is the failure
    /// this test exists to catch before a deploy rather than after.
    function test_DomainSeparatorIsTallysOwn() public view {
        bytes32 expected = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("Tally")),
                keccak256(bytes("1")),
                block.chainid,
                address(tally)
            )
        );
        assertEq(tally.DOMAIN_SEPARATOR(), expected);
    }
}
