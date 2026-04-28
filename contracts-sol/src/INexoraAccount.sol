// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title INexoraAccount
/// @notice Public surface of the Nexora smart account (Stylus).
interface INexoraAccount {
    /// @notice Canonical UserOp struct.
    struct UserOp {
        address sender;
        uint256 nonce;
        address target;
        uint256 value;
        bytes   callData;
        uint256 callGasLimit;
        uint256 validUntil;
        uint8   policyTag;
        uint16  verifierScheme;
        bytes   signatures;     // abi.encode(EcdsaSig, PqSig)
    }

    struct EcdsaSig { bytes32 r; bytes32 s; uint8 v; }
    struct PqSig    { uint16 scheme; bytes32 pubkeyHash; bytes sigBytes; }

    event UserOpExecuted(
        address indexed sender,
        bytes32 indexed opHash,
        uint8 policyTag,
        uint16 verifierScheme,
        bool success
    );
    event IntentExecuted(
        bytes32 indexed agentId,
        uint8 policyTag,
        bytes32 opHash,
        address validator
    );
    event OwnerRotationProposed(address indexed newOwner, uint64 unlockAt);
    event OwnerRotated(address indexed oldOwner, address indexed newOwner);
    event PqPubkeyRotationProposed(bytes32 newPubkeyHash, uint64 unlockAt);
    event PqPubkeyRotated(bytes32 oldHash, bytes32 newHash);

    function init(
        address owner,
        bytes32 pqPubkeyHash,
        address verifierRegistry,
        address policyEngine
    ) external;

    function owner() external view returns (address);
    function pq_pubkey_hash() external view returns (bytes32);
    function verifier_registry() external view returns (address);
    function policy_engine() external view returns (address);
    function get_nonce(uint256 channel) external view returns (uint256);

    function validate_user_op(UserOp calldata op, bytes32 opHash, bytes calldata providedPubkey)
        external view returns (uint64);
    function execute_user_op(UserOp calldata op, bytes calldata providedPubkey)
        external returns (bool success);
    function execute_intent(bytes32 agentId, UserOp calldata op, bytes calldata providedPubkey)
        external returns (bool success);

    /// ERC-1271
    function is_valid_signature(bytes32 hash, bytes calldata sig)
        external view returns (bytes4);

    /// CRITICAL — owner rotation (timelocked)
    function propose_owner_rotation(address newOwner, uint16 scheme, bytes calldata pqSig, bytes calldata pqPubkey) external;
    function commit_owner_rotation() external;
    function cancel_owner_rotation() external;

    /// CRITICAL — PQ pubkey rotation (timelocked)
    function propose_pq_pubkey_rotation(bytes32 newPubkeyHash, uint16 scheme, bytes calldata pqSigOld, bytes calldata pqPubkeyOld) external;
    function commit_pq_pubkey_rotation() external;

    function pending_owner() external view returns (address);
    function pending_owner_unlock_at() external view returns (uint64);
    function pending_pq_pubkey_hash() external view returns (bytes32);
    function pending_pq_unlock_at() external view returns (uint64);
}
