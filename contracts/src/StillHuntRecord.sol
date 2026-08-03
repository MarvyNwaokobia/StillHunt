// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title StillHuntRecord — the permanent log of what happened
/// @notice Every contract completed, every rank crossed, every hunter who signed on.
///         Events only: this contract stores nothing and reads nothing back. That is
///         the point — it is cheap to write, impossible to rewrite, and anyone can
///         reconstruct a player's whole history from logs without asking us for it.
///
/// @dev WHY EVENTS AND NOT STORAGE
///      Storage would let the game READ this back, which sounds useful and is a trap:
///      the moment gameplay depends on an on-chain read, every match is gated on an
///      RPC round trip, and an RPC blip becomes a gameplay outage. The database is the
///      operational record. This is the auditable one. Keeping those separate is what
///      lets the chain be honest without being load-bearing.
///
///      It also means a lost database is recoverable. Player progression can be rebuilt
///      from these logs, which is the reason losses are recorded here as well as wins —
///      a record with only the good outcomes in it is not a record.
contract StillHuntRecord is OwnableUpgradeable, UUPSUpgradeable {
    /// @notice The only address allowed to write. Our match server.
    address public recorder;

    event HunterEnlisted(
        address indexed player,
        string discipline,
        string callsign,
        uint256 timestamp
    );

    event ContractResolved(
        bytes32 indexed contractId,
        address indexed winner,
        address indexed loser,
        uint32 xpWinner,
        uint32 xpLoser,
        bool solo,
        uint256 timestamp
    );

    event RankAchieved(address indexed player, string rank, uint256 timestamp);

    error OnlyRecorder();
    error ZeroAddress();

    modifier onlyRecorder() {
        if (msg.sender != recorder) revert OnlyRecorder();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _recorder, address _owner) public initializer {
        if (_recorder == address(0)) revert ZeroAddress();
        __Ownable_init(_owner);
        recorder = _recorder;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    /// @notice A new hunter signed on and chose their discipline.
    function enlistHunter(
        address player,
        string calldata discipline,
        string calldata callsign
    ) external onlyRecorder {
        emit HunterEnlisted(player, discipline, callsign, block.timestamp);
    }

    /// @notice A contract was completed — or failed.
    /// @param contractId UUID of the match, 16 bytes zero-padded to 32.
    /// @param winner     Winning wallet. address(0) when the hunter died.
    /// @param loser      Losing wallet. address(0) when the opposition was AI.
    /// @param xpWinner   XP awarded to the winner. uint32, not uint8: a boss contract
    ///                   pays more than 255 and the narrower type silently wrapped.
    /// @param solo       True for a solo contract, false for hunter-versus-hunter.
    function recordContract(
        bytes32 contractId,
        address winner,
        address loser,
        uint32 xpWinner,
        uint32 xpLoser,
        bool solo
    ) external onlyRecorder {
        emit ContractResolved(contractId, winner, loser, xpWinner, xpLoser, solo, block.timestamp);
    }

    /// @notice A hunter crossed a rank threshold.
    function recordRank(address player, string calldata rank) external onlyRecorder {
        emit RankAchieved(player, rank, block.timestamp);
    }

    function setRecorder(address _recorder) external onlyOwner {
        if (_recorder == address(0)) revert ZeroAddress();
        recorder = _recorder;
        emit RecorderSet(_recorder);
    }

    event RecorderSet(address indexed recorder);
}
