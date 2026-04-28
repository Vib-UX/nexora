// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IAccountFactory
/// @notice Deterministic deployer for NexoraAccount via CREATE2 + EIP-1167 proxy.
interface IAccountFactory {
    event AccountCreated(
        address indexed account,
        address indexed owner,
        bytes32 pqPubkeyHash,
        bytes32 salt
    );

    function init(
        address owner,
        address implementation,
        address verifierRegistry,
        address policyEngine
    ) external;

    function predict_address(address owner, bytes32 pqPubkeyHash, bytes32 userSalt)
        external view returns (address);

    function create_account(address owner, bytes32 pqPubkeyHash, bytes32 userSalt)
        external returns (address);

    function set_implementation(address newImpl) external;
    function implementation() external view returns (address);
    function verifier_registry() external view returns (address);
    function policy_engine() external view returns (address);
}
