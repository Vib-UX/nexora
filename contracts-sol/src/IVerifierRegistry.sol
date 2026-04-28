// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IVerifierRegistry
/// @notice scheme id -> verifier contract address. Owner-gated.
///         Wallets call `verifier(scheme)` to discover the current backend.
interface IVerifierRegistry {
    event VerifierUpdated(uint16 indexed scheme, address indexed implAddr);

    function verifier(uint16 scheme) external view returns (address);
    function set_verifier(uint16 scheme, address implAddr) external;
    function transfer_ownership(address newOwner) external;
    function owner() external view returns (address);
}
