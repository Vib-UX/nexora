// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IPQVerifier
/// @notice Canonical post-quantum signature verifier interface.
///         Implementations: scheme 1 reference verifier (Stylus), Falcon-512 (v2),
///         and a future Nitro precompile bound to the same registry slot.
interface IPQVerifier {
    /// @notice Returns the VerifierScheme id (e.g. 1 = FALCON_MOCK, 2 = FALCON_512).
    function scheme() external view returns (uint16);

    /// @notice Expected pubkey length in bytes for this scheme.
    function pubkey_length() external view returns (uint16);

    /// @notice Expected signature length in bytes for this scheme.
    function sig_length() external view returns (uint16);

    /// @notice Verify a PQ signature.
    /// @param msgHash 32-byte digest produced by `compute_op_hash`.
    /// @param sig    Signature bytes (length = sig_length).
    /// @param pubkey Public key bytes (length = pubkey_length).
    function verify(bytes32 msgHash, bytes calldata sig, bytes calldata pubkey)
        external
        view
        returns (bool);

    /// @notice Canonical commitment used by wallets: keccak256(pubkey).
    function pubkey_commitment(bytes calldata pubkey)
        external
        pure
        returns (bytes32);
}
