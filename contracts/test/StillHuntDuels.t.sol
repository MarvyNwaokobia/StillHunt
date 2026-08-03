// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/Tally.sol";
import "../src/StillHuntDuels.sol";

contract StillHuntDuelsTest is Test {
    Tally tally;
    StillHuntDuels duels;

    address owner = address(0xA11CE);
    address relay = address(0xBEEF);
    address alice = address(0xA1);
    address bob = address(0xB0B);
    address mallory = address(0xBAD);

    uint256 constant STAKE = 100e18;

    function setUp() public {
        tally = new Tally(owner);
        vm.prank(owner);
        tally.setMinter(relay, true);

        StillHuntDuels impl = new StillHuntDuels();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(impl),
            abi.encodeCall(StillHuntDuels.initialize, (address(tally), relay, owner))
        );
        duels = StillHuntDuels(address(proxy));

        vm.startPrank(relay);
        tally.mint(alice, 1000e18);
        tally.mint(bob, 1000e18);
        tally.mint(mallory, 1000e18);
        vm.stopPrank();

        vm.prank(alice);
        tally.approve(address(duels), type(uint256).max);
        vm.prank(bob);
        tally.approve(address(duels), type(uint256).max);
        vm.prank(mallory);
        tally.approve(address(duels), type(uint256).max);
    }

    function _openAndAccept() internal returns (uint256 duelId) {
        vm.prank(alice);
        duelId = duels.open(STAKE);
        vm.prank(bob);
        duels.accept(duelId);
    }

    // ── Happy path ────────────────────────────────────────────────────────────

    function test_OpenEscrowsTheStake() public {
        vm.prank(alice);
        uint256 id = duels.open(STAKE);

        assertEq(tally.balanceOf(alice), 900e18);
        assertEq(tally.balanceOf(address(duels)), STAKE);
        (, , uint256 stake, , StillHuntDuels.Status status) = duels.duels(id);
        assertEq(stake, STAKE);
        assertEq(uint8(status), uint8(StillHuntDuels.Status.Open));
    }

    function test_SettlePaysWinnerMinusFee() public {
        uint256 id = _openAndAccept();

        vm.prank(relay);
        duels.settle(id, alice);

        uint256 pot = STAKE * 2;
        uint256 fee = (pot * 500) / 10000; // 5%
        // Alice staked 100 of her 1000, and takes back the pot less the cut.
        assertEq(tally.balanceOf(alice), 900e18 + (pot - fee));
        assertEq(tally.balanceOf(bob), 900e18);
        assertEq(duels.accumulatedFees(), fee);
    }

    /// Nothing is minted. Every token paid out was staked by a player — this is the
    /// property that lets StillHunt run a real economy with no reward pool.
    function test_SettleIsZeroSum() public {
        uint256 supplyBefore = tally.totalSupply();
        uint256 id = _openAndAccept();
        vm.prank(relay);
        duels.settle(id, bob);
        assertEq(tally.totalSupply(), supplyBefore, "duels must never mint");
    }

    // ── The trust boundary ────────────────────────────────────────────────────

    function test_OnlyResolverCanSettle() public {
        uint256 id = _openAndAccept();
        vm.expectRevert(StillHuntDuels.OnlyResolver.selector);
        vm.prank(mallory);
        duels.settle(id, mallory);
    }

    /// The resolver is trusted to say WHO WON and nothing else. Naming an outsider —
    /// including itself — must revert, so a compromised relay cannot redirect a pot.
    function test_ResolverCannotPayANonParticipant() public {
        uint256 id = _openAndAccept();

        vm.expectRevert(StillHuntDuels.WinnerNotInDuel.selector);
        vm.prank(relay);
        duels.settle(id, mallory);

        vm.expectRevert(StillHuntDuels.WinnerNotInDuel.selector);
        vm.prank(relay);
        duels.settle(id, relay);
    }

    function test_CannotSettleTwice() public {
        uint256 id = _openAndAccept();
        vm.prank(relay);
        duels.settle(id, alice);

        vm.expectRevert(StillHuntDuels.NotActive.selector);
        vm.prank(relay);
        duels.settle(id, bob);
    }

    // ── Expiry: the escape hatch ──────────────────────────────────────────────

    /// The property that makes staking safe: if our backend dies, players get their
    /// money back without us. No resolver, no owner, no house cut.
    function test_ExpireRefundsBothPlayersInFull() public {
        uint256 id = _openAndAccept();

        vm.warp(block.timestamp + duels.EXPIRY_SECONDS());
        vm.prank(alice);
        duels.expire(id);

        assertEq(tally.balanceOf(alice), 1000e18, "alice made whole");
        assertEq(tally.balanceOf(bob), 1000e18, "bob made whole");
        assertEq(duels.accumulatedFees(), 0, "no cut on a refund");
        assertEq(tally.balanceOf(address(duels)), 0);
    }

    function test_CannotExpireEarly() public {
        uint256 id = _openAndAccept();
        vm.warp(block.timestamp + duels.EXPIRY_SECONDS() - 1);
        vm.expectRevert(StillHuntDuels.NotYetExpired.selector);
        vm.prank(alice);
        duels.expire(id);
    }

    function test_OnlyParticipantsCanExpire() public {
        uint256 id = _openAndAccept();
        vm.warp(block.timestamp + duels.EXPIRY_SECONDS());
        vm.expectRevert(StillHuntDuels.NotAParticipant.selector);
        vm.prank(mallory);
        duels.expire(id);
    }

    function test_SettledDuelCannotBeExpired() public {
        uint256 id = _openAndAccept();
        vm.prank(relay);
        duels.settle(id, alice);

        vm.warp(block.timestamp + duels.EXPIRY_SECONDS());
        vm.expectRevert(StillHuntDuels.NotActive.selector);
        vm.prank(alice);
        duels.expire(id);
    }

    // ── Cancel ────────────────────────────────────────────────────────────────

    function test_ChallengerCanCancelBeforeAcceptance() public {
        vm.prank(alice);
        uint256 id = duels.open(STAKE);
        vm.prank(alice);
        duels.cancel(id);
        assertEq(tally.balanceOf(alice), 1000e18);
    }

    function test_OnlyChallengerCancels() public {
        vm.prank(alice);
        uint256 id = duels.open(STAKE);
        vm.expectRevert(StillHuntDuels.NotChallenger.selector);
        vm.prank(mallory);
        duels.cancel(id);
    }

    function test_CannotCancelOnceAccepted() public {
        uint256 id = _openAndAccept();
        vm.expectRevert(StillHuntDuels.NotOpen.selector);
        vm.prank(alice);
        duels.cancel(id);
    }

    // ── Guards ────────────────────────────────────────────────────────────────

    function test_CannotAcceptYourOwnDuel() public {
        vm.prank(alice);
        uint256 id = duels.open(STAKE);
        vm.expectRevert(StillHuntDuels.CannotDuelYourself.selector);
        vm.prank(alice);
        duels.accept(id);
    }

    function test_CannotAcceptTwice() public {
        uint256 id = _openAndAccept();
        vm.expectRevert(StillHuntDuels.NotOpen.selector);
        vm.prank(mallory);
        duels.accept(id);
    }

    function test_ZeroStakeRejected() public {
        vm.expectRevert(StillHuntDuels.InvalidStake.selector);
        vm.prank(alice);
        duels.open(0);
    }

    // ── Fees ──────────────────────────────────────────────────────────────────

    /// Fees come from a counter, never from the contract balance. Withdrawing against
    /// the balance would spend TALLY belonging to a duel still in progress.
    function test_WithdrawCannotTouchLiveStakes() public {
        uint256 settledId = _openAndAccept();
        vm.prank(relay);
        duels.settle(settledId, alice);
        uint256 fee = duels.accumulatedFees();

        // A second duel is live; its stakes sit in the same balance.
        vm.prank(alice);
        uint256 liveId = duels.open(STAKE);
        vm.prank(bob);
        duels.accept(liveId);

        vm.prank(owner);
        duels.withdrawFees(owner);

        assertEq(tally.balanceOf(owner), fee, "owner got exactly the fee");
        assertEq(tally.balanceOf(address(duels)), STAKE * 2, "live pot untouched");

        // And the live duel still settles correctly afterwards.
        vm.prank(relay);
        duels.settle(liveId, bob);
    }

    function test_FeeCapEnforced() public {
        vm.expectRevert(StillHuntDuels.FeeTooHigh.selector);
        vm.prank(owner);
        duels.setFeeBps(2001);

        vm.prank(owner);
        duels.setFeeBps(2000); // ceiling is allowed
        assertEq(duels.feeBps(), 2000);
    }

    function test_OnlyOwnerWithdrawsFees() public {
        vm.expectRevert();
        vm.prank(mallory);
        duels.withdrawFees(mallory);
    }

    function test_ZeroFeeMeansWinnerTakesWholePot() public {
        vm.prank(owner);
        duels.setFeeBps(0);
        uint256 id = _openAndAccept();
        vm.prank(relay);
        duels.settle(id, alice);
        assertEq(tally.balanceOf(alice), 900e18 + STAKE * 2);
        assertEq(duels.accumulatedFees(), 0);
    }
}
