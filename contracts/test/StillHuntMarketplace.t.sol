// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/Tally.sol";
import "../src/StillHuntArmory.sol";
import "../src/StillHuntMarketplace.sol";

contract StillHuntMarketplaceTest is Test {
    Tally tally;
    StillHuntArmory armory;
    StillHuntMarketplace market;

    address owner = address(0xA11CE);
    address relay = address(0xBEEF);
    address buyer = address(0xB0B);
    address seller = address(0xA1);

    uint256 constant ITEM = 1;
    uint256 constant PRICE = 100e18;

    function setUp() public {
        tally = new Tally(owner);
        vm.prank(owner);
        tally.setMinter(relay, true);

        StillHuntArmory armoryImpl = new StillHuntArmory();
        armory = StillHuntArmory(address(new ERC1967Proxy(
            address(armoryImpl),
            abi.encodeCall(StillHuntArmory.initialize, (owner))
        )));

        StillHuntMarketplace marketImpl = new StillHuntMarketplace();
        market = StillHuntMarketplace(address(new ERC1967Proxy(
            address(marketImpl),
            abi.encodeCall(StillHuntMarketplace.initialize, (address(tally), address(armory), owner))
        )));

        vm.startPrank(owner);
        armory.setMarketplace(address(market));
        armory.registerItem(ITEM, 0, "ipfs://item-1");
        market.listItem(ITEM, PRICE);
        vm.stopPrank();

        vm.startPrank(relay);
        tally.mint(buyer, 1000e18);
        tally.mint(seller, 1000e18);
        vm.stopPrank();
    }

    // ── Primary sale ──────────────────────────────────────────────────────────

    function test_PurchaseMintsAndTakesRevenue() public {
        vm.startPrank(buyer);
        tally.approve(address(market), PRICE);
        market.purchase(ITEM);
        vm.stopPrank();

        assertEq(armory.balanceOf(buyer, ITEM), 1);
        assertEq(tally.balanceOf(buyer), 900e18);
        assertEq(market.accumulatedRevenue(), PRICE);
    }

    function test_UnlistedItemReverts() public {
        vm.prank(buyer);
        tally.approve(address(market), PRICE);
        vm.expectRevert(StillHuntMarketplace.ItemNotListed.selector);
        vm.prank(buyer);
        market.purchase(99);
    }

    /// Gear enters circulation only by being bought. Nothing else may call mint.
    function test_OnlyMarketplaceCanMintGear() public {
        vm.expectRevert(StillHuntArmory.OnlyMarketplace.selector);
        vm.prank(owner);
        armory.mint(owner, ITEM, 1);
    }

    /// An unregistered id would render as a blank in every client — an item that
    /// exists on-chain and nowhere else.
    function test_UnregisteredItemCannotBeMinted() public {
        vm.prank(owner);
        market.listItem(42, PRICE); // listed but never registered in the armory

        vm.prank(buyer);
        tally.approve(address(market), PRICE);
        vm.expectRevert(abi.encodeWithSelector(StillHuntArmory.ItemNotRegistered.selector, 42));
        vm.prank(buyer);
        market.purchase(42);
    }

    function test_MaxSupplyEnforced() public {
        vm.startPrank(owner);
        armory.registerItem(7, 1, "ipfs://rare");
        market.listItem(7, PRICE);
        vm.stopPrank();

        vm.prank(buyer);
        tally.approve(address(market), type(uint256).max);
        vm.prank(buyer);
        market.purchase(7);

        vm.prank(seller);
        tally.approve(address(market), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(StillHuntArmory.MaxSupplyReached.selector, 7));
        vm.prank(seller);
        market.purchase(7);
    }

    function test_WithdrawRevenue() public {
        vm.startPrank(buyer);
        tally.approve(address(market), PRICE);
        market.purchase(ITEM);
        vm.stopPrank();

        vm.prank(owner);
        market.withdrawRevenue(owner);
        assertEq(tally.balanceOf(owner), PRICE);
        assertEq(market.accumulatedRevenue(), 0);
    }

    function test_OnlyOwnerWithdraws() public {
        vm.expectRevert();
        vm.prank(buyer);
        market.withdrawRevenue(buyer);
    }

    // ── Resale ────────────────────────────────────────────────────────────────

    function _sellerOwnsAnItem() internal {
        vm.startPrank(seller);
        tally.approve(address(market), PRICE);
        market.purchase(ITEM);
        armory.setApprovalForAll(address(market), true);
        vm.stopPrank();
    }

    function test_ResaleTransfersItemAndSplitsFee() public {
        _sellerOwnsAnItem();
        uint256 sellerAfterBuy = tally.balanceOf(seller);

        vm.prank(seller);
        uint256 resaleId = market.listForResale(ITEM, 200e18);

        vm.startPrank(buyer);
        tally.approve(address(market), 200e18);
        market.buyResale(resaleId);
        vm.stopPrank();

        uint256 fee = (200e18 * 500) / 10000;
        assertEq(armory.balanceOf(buyer, ITEM), 1, "buyer holds the item");
        assertEq(armory.balanceOf(seller, ITEM), 0, "seller gave it up");
        assertEq(tally.balanceOf(seller), sellerAfterBuy + 200e18 - fee);
        assertEq(market.accumulatedRevenue(), PRICE + fee);
    }

    function test_CannotListItemYouDoNotOwn() public {
        vm.expectRevert(StillHuntMarketplace.NotItemOwner.selector);
        vm.prank(buyer);
        market.listForResale(ITEM, 200e18);
    }

    function test_ListingRequiresApproval() public {
        vm.startPrank(seller);
        tally.approve(address(market), PRICE);
        market.purchase(ITEM);
        vm.expectRevert(StillHuntMarketplace.MarketplaceNotApproved.selector);
        market.listForResale(ITEM, 200e18);
        vm.stopPrank();
    }

    function test_OnlySellerCancels() public {
        _sellerOwnsAnItem();
        vm.prank(seller);
        uint256 id = market.listForResale(ITEM, 200e18);

        vm.expectRevert(StillHuntMarketplace.NotSeller.selector);
        vm.prank(buyer);
        market.cancelResale(id);

        vm.prank(seller);
        market.cancelResale(id);
        assertEq(market.getActiveResaleCount(), 0);
    }

    function test_CannotBuyYourOwnListing() public {
        _sellerOwnsAnItem();
        vm.prank(seller);
        uint256 id = market.listForResale(ITEM, 200e18);

        vm.prank(seller);
        tally.approve(address(market), 200e18);
        vm.expectRevert(StillHuntMarketplace.CannotBuyOwnListing.selector);
        vm.prank(seller);
        market.buyResale(id);
    }

    /// A seller who transferred the item away after listing cannot be bought from.
    function test_ResaleFailsIfSellerNoLongerHoldsTheItem() public {
        _sellerOwnsAnItem();
        vm.prank(seller);
        uint256 id = market.listForResale(ITEM, 200e18);

        vm.prank(seller);
        armory.safeTransferFrom(seller, address(0xDEAD), ITEM, 1, "");

        vm.prank(buyer);
        tally.approve(address(market), 200e18);
        vm.expectRevert(StillHuntMarketplace.NotItemOwner.selector);
        vm.prank(buyer);
        market.buyResale(id);
    }

    function test_FeeCapEnforced() public {
        vm.expectRevert(StillHuntMarketplace.FeeTooHigh.selector);
        vm.prank(owner);
        market.setFeeBps(2001);
    }

    function test_ActiveResaleListIsMaintained() public {
        _sellerOwnsAnItem();
        vm.startPrank(seller);
        tally.approve(address(market), PRICE);
        market.purchase(ITEM); // a second copy
        uint256 a = market.listForResale(ITEM, 150e18);
        uint256 b = market.listForResale(ITEM, 250e18);
        vm.stopPrank();
        assertEq(market.getActiveResaleCount(), 2);

        vm.prank(seller);
        market.cancelResale(a);
        assertEq(market.getActiveResaleCount(), 1);

        (uint256[] memory ids, ) = market.getActiveResales();
        assertEq(ids.length, 1);
        assertEq(ids[0], b);
    }

    // ── The permit-ordering fix ───────────────────────────────────────────────

    function _permit(
        uint256 pk,
        address spender,
        uint256 value,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        address signer = vm.addr(pk);
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
        (v, r, s) = vm.sign(pk, digest);
    }

    function test_PurchaseWithPermitIsGaslessForTheBuyer() public {
        uint256 pk = 0xB0B5;
        address signer = vm.addr(pk);
        vm.prank(relay);
        tally.mint(signer, 500e18);

        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _permit(pk, address(market), PRICE, deadline);

        vm.prank(relay); // the relay submits and pays gas
        market.purchaseWithPermit(signer, ITEM, deadline, v, r, s);

        assertEq(armory.balanceOf(signer, ITEM), 1);
        assertEq(tally.balanceOf(signer), 400e18);
    }

    /// The bug this contract was written to avoid: reading the price and consuming
    /// the permit BEFORE checking the listing burns the buyer's nonce on a listing
    /// that cannot be bought. Validating first means the nonce survives.
    function test_BuyingACancelledResaleDoesNotBurnThePermit() public {
        uint256 pk = 0xB0B5;
        address signer = vm.addr(pk);
        vm.prank(relay);
        tally.mint(signer, 500e18);

        _sellerOwnsAnItem();
        vm.prank(seller);
        uint256 id = market.listForResale(ITEM, 200e18);
        vm.prank(seller);
        market.cancelResale(id);

        uint256 nonceBefore = tally.nonces(signer);
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _permit(pk, address(market), 200e18, deadline);

        vm.expectRevert(StillHuntMarketplace.ResaleNotActive.selector);
        vm.prank(signer);
        market.buyResaleWithPermit(id, deadline, v, r, s);

        assertEq(tally.nonces(signer), nonceBefore, "permit nonce must survive a rejected buy");
    }
}
