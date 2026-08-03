// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";

/// @title StillHuntDuels — staked one-on-one matches, settled on-chain
/// @notice Two hunters stake equal TALLY. The winner takes the pot minus a house cut.
///
/// THIS CONTRACT IS THE ECONOMY. TALLY cannot be sold, so it acquires weight only by
/// circulating, and this is the surface where circulation is a CONTEST rather than a
/// purchase. Nothing here mints: every token paid out was staked by a player. There is
/// no reward pool to keep funded, no faucet to meter, and no reason to farm wallets —
/// fifty accounts staking against each other is fifty accounts moving their own money
/// around while the house takes a cut of each round.
///
/// @dev THE TRUST BOUNDARY, STATED PLAINLY
///      The match itself runs on our servers, so a `resolver` address declares the
///      winner. That resolver is trusted to be HONEST ABOUT WHO WON, and nothing more.
///      What it explicitly cannot do:
///
///        • take the stakes — `settle` only ever pays one of the two participants
///        • change a stake after the fact — the amount is fixed at `open`
///        • strand funds by going silent — see `expire` below
///
///      That last one is the important one. A duel that only the backend can close is a
///      duel whose funds are hostage to our uptime. After `EXPIRY_SECONDS` either
///      player can call `expire` and both stakes are refunded in full, with no house
///      cut taken, no resolver involvement, and no owner action required. A dead
///      backend costs players a delay, never their stake.
contract StillHuntDuels is OwnableUpgradeable, ReentrancyGuard, UUPSUpgradeable {
    using SafeERC20 for IERC20;

    /// @notice TALLY.
    IERC20 public currency;

    /// @notice The address allowed to declare winners. Our match server.
    address public resolver;

    /// @notice House cut on a settled duel, in basis points. 500 = 5%.
    uint256 public feeBps;

    /// @notice Accumulated house cut, withdrawable by the owner.
    uint256 public accumulatedFees;

    /// @notice How long after acceptance a duel may sit unsettled before either player
    ///         can force a refund. Long enough that a slow settlement never trips it,
    ///         short enough that a player is never waiting on us for a day.
    uint256 public constant EXPIRY_SECONDS = 2 hours;

    enum Status {
        None,     // never existed
        Open,     // staked by the challenger, waiting for an opponent
        Active,   // both staked, match in progress
        Settled,  // a winner was paid
        Refunded  // cancelled or expired; every stake returned
    }

    struct Duel {
        address challenger;
        address opponent;
        uint256 stake;      // PER PLAYER, not the pot
        uint64 acceptedAt;  // 0 until accepted; the expiry clock starts here
        Status status;
    }

    mapping(uint256 => Duel) public duels;
    uint256 public nextDuelId;

    event DuelOpened(uint256 indexed duelId, address indexed challenger, uint256 stake);
    event DuelAccepted(uint256 indexed duelId, address indexed opponent, uint256 pot);
    event DuelSettled(uint256 indexed duelId, address indexed winner, uint256 payout, uint256 fee);
    event DuelRefunded(uint256 indexed duelId, string reason);
    event ResolverSet(address indexed resolver);
    event FeeBpsSet(uint256 bps);
    event FeesWithdrawn(address indexed to, uint256 amount);

    error ZeroAddress();
    error InvalidStake();
    error OnlyResolver();
    error NotOpen();
    error NotActive();
    error NotChallenger();
    error NotAParticipant();
    error CannotDuelYourself();
    error WinnerNotInDuel();
    error NotYetExpired();
    error FeeTooHigh();
    error NothingToWithdraw();

    modifier onlyResolver() {
        if (msg.sender != resolver) revert OnlyResolver();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _currency, address _resolver, address _owner) public initializer {
        if (_currency == address(0) || _resolver == address(0)) revert ZeroAddress();
        __Ownable_init(_owner);
        currency = IERC20(_currency);
        resolver = _resolver;
        feeBps = 500; // 5%
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ── Admin ─────────────────────────────────────────────────────────────────

    function setResolver(address _resolver) external onlyOwner {
        if (_resolver == address(0)) revert ZeroAddress();
        resolver = _resolver;
        emit ResolverSet(_resolver);
    }

    function setFeeBps(uint256 _bps) external onlyOwner {
        if (_bps > 2000) revert FeeTooHigh();
        feeBps = _bps;
        emit FeeBpsSet(_bps);
    }

    function withdrawFees(address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 amount = accumulatedFees;
        if (amount == 0) revert NothingToWithdraw();
        // Zeroed BEFORE the transfer, and drawn from a counter rather than the
        // contract balance: the balance also holds live stakes, and paying out
        // against it would let a withdrawal spend money that belongs to a duel
        // still in progress.
        accumulatedFees = 0;
        IERC20(address(currency)).safeTransfer(to, amount);
        emit FeesWithdrawn(to, amount);
    }

    // ── Player actions ────────────────────────────────────────────────────────

    /// @notice Post a challenge, escrowing your stake.
    function open(uint256 stake) external nonReentrant returns (uint256 duelId) {
        return _open(msg.sender, stake);
    }

    /// @notice Post a challenge gaslessly, authorising the stake with a permit.
    function openWithPermit(
        uint256 stake,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant returns (uint256 duelId) {
        if (stake == 0) revert InvalidStake();
        IERC20Permit(address(currency)).permit(msg.sender, address(this), stake, deadline, v, r, s);
        return _open(msg.sender, stake);
    }

    function _open(address challenger, uint256 stake) private returns (uint256 duelId) {
        if (stake == 0) revert InvalidStake();
        IERC20(address(currency)).safeTransferFrom(challenger, address(this), stake);

        duelId = nextDuelId++;
        duels[duelId] = Duel({
            challenger: challenger,
            opponent: address(0),
            stake: stake,
            acceptedAt: 0,
            status: Status.Open
        });
        emit DuelOpened(duelId, challenger, stake);
    }

    /// @notice Take a challenge, matching the stake.
    function accept(uint256 duelId) external nonReentrant {
        _accept(duelId, msg.sender);
    }

    /// @notice Take a challenge gaslessly.
    function acceptWithPermit(
        uint256 duelId,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        Duel storage d = duels[duelId];
        if (d.status != Status.Open) revert NotOpen();
        IERC20Permit(address(currency)).permit(msg.sender, address(this), d.stake, deadline, v, r, s);
        _accept(duelId, msg.sender);
    }

    function _accept(uint256 duelId, address opponent) private {
        Duel storage d = duels[duelId];
        if (d.status != Status.Open) revert NotOpen();
        if (opponent == d.challenger) revert CannotDuelYourself();

        d.opponent = opponent;
        d.acceptedAt = uint64(block.timestamp);
        d.status = Status.Active;

        IERC20(address(currency)).safeTransferFrom(opponent, address(this), d.stake);
        emit DuelAccepted(duelId, opponent, d.stake * 2);
    }

    /// @notice Withdraw a challenge nobody has taken yet. Full refund, no fee.
    function cancel(uint256 duelId) external nonReentrant {
        Duel storage d = duels[duelId];
        if (d.status != Status.Open) revert NotOpen();
        if (msg.sender != d.challenger) revert NotChallenger();

        d.status = Status.Refunded;
        IERC20(address(currency)).safeTransfer(d.challenger, d.stake);
        emit DuelRefunded(duelId, "cancelled");
    }

    /// @notice Declare the winner and pay out. Resolver only.
    /// @dev `winner` must be one of the two participants. That check is what keeps a
    ///      compromised resolver from redirecting the pot to itself — the worst it can
    ///      do is pay the wrong player, which is visible on-chain and disputable.
    function settle(uint256 duelId, address winner) external onlyResolver nonReentrant {
        Duel storage d = duels[duelId];
        if (d.status != Status.Active) revert NotActive();
        if (winner != d.challenger && winner != d.opponent) revert WinnerNotInDuel();

        d.status = Status.Settled;

        uint256 pot = d.stake * 2;
        uint256 fee = (pot * feeBps) / 10000;
        uint256 payout = pot - fee;
        accumulatedFees += fee;

        IERC20(address(currency)).safeTransfer(winner, payout);
        emit DuelSettled(duelId, winner, payout, fee);
    }

    /// @notice Reclaim both stakes from a duel that was never settled.
    ///
    /// Callable by EITHER participant, by anyone's transaction, once EXPIRY_SECONDS
    /// have passed since acceptance. No resolver, no owner, no house cut — this path
    /// exists so that our servers going down is an inconvenience rather than a
    /// confiscation, and it must therefore work when everything of ours is broken.
    function expire(uint256 duelId) external nonReentrant {
        Duel storage d = duels[duelId];
        if (d.status != Status.Active) revert NotActive();
        if (msg.sender != d.challenger && msg.sender != d.opponent) revert NotAParticipant();
        if (block.timestamp < uint256(d.acceptedAt) + EXPIRY_SECONDS) revert NotYetExpired();

        d.status = Status.Refunded;

        uint256 stake = d.stake;
        IERC20(address(currency)).safeTransfer(d.challenger, stake);
        IERC20(address(currency)).safeTransfer(d.opponent, stake);
        emit DuelRefunded(duelId, "expired");
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    /// @notice When this duel becomes refundable. 0 while it is not Active.
    function expiresAt(uint256 duelId) external view returns (uint256) {
        Duel storage d = duels[duelId];
        if (d.status != Status.Active) return 0;
        return uint256(d.acceptedAt) + EXPIRY_SECONDS;
    }
}
