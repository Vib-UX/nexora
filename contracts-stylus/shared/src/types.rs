//! Wire-format types shared across all Nexora Stylus contracts.

use alloc::vec::Vec;
use alloy_primitives::{Address, U256};
use alloy_sol_types::sol;

pub const NEXORA_DOMAIN_NAME: &str = "Nexora";
pub const NEXORA_DOMAIN_VERSION: &str = "1";

/// Policy classification for an operation.
///
/// Encoded as a single byte on the wire so it round-trips trivially through
/// Solidity `uint8`.
#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PolicyTag {
    Low = 0,
    High = 1,
    Critical = 2,
}

impl PolicyTag {
    pub fn from_u8(v: u8) -> Option<Self> {
        match v {
            0 => Some(Self::Low),
            1 => Some(Self::High),
            2 => Some(Self::Critical),
            _ => None,
        }
    }

    pub fn requires_ecdsa(self) -> bool {
        matches!(self, Self::Low | Self::High)
    }

    pub fn requires_pq(self) -> bool {
        matches!(self, Self::High | Self::Critical)
    }
}

/// Identifier for a signature scheme. Aligns with what the
/// `VerifierRegistry` resolves and what `IPQVerifier::scheme()` returns.
#[repr(u16)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum VerifierScheme {
    EcdsaK1 = 0,
    FalconMock = 1,
    Falcon512 = 2,
    Dilithium3 = 3,
    SphincsPlus = 4,
}

impl VerifierScheme {
    pub fn from_u16(v: u16) -> Option<Self> {
        match v {
            0 => Some(Self::EcdsaK1),
            1 => Some(Self::FalconMock),
            2 => Some(Self::Falcon512),
            3 => Some(Self::Dilithium3),
            4 => Some(Self::SphincsPlus),
            _ => None,
        }
    }
}

// Solidity-compatible struct definitions. We keep these in `sol!` macros
// so any contract crate can import them with consistent ABI encoding.
sol! {
    /// Canonical user operation.
    ///
    /// Mirrors the `INexoraAccount.UserOp` struct in `contracts-sol/`.
    /// `signatures` is `abi.encode(EcdsaSig, PqSig)` — see
    /// [`SignatureEnvelope`].
    #[derive(Debug)]
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
        bytes   signatures;
    }

    /// ECDSA component of the signature envelope. `v == 0` means absent.
    #[derive(Debug)]
    struct EcdsaSig {
        bytes32 r;
        bytes32 s;
        uint8   v;
    }

    /// Post-quantum component of the signature envelope.
    /// `sigBytes.length == 0` means absent.
    #[derive(Debug)]
    struct PqSig {
        uint16  scheme;
        bytes32 pubkeyHash;
        bytes   sigBytes;
    }

    /// abi.encode(EcdsaSig, PqSig) is what UserOp.signatures must decode to.
    #[derive(Debug)]
    struct SignatureEnvelope {
        EcdsaSig ecdsa;
        PqSig    pq;
    }
}

/// Convenience: build a UserOp from typed fields.
#[allow(clippy::too_many_arguments)]
pub fn build_user_op(
    sender: Address,
    nonce: U256,
    target: Address,
    value: U256,
    call_data: Vec<u8>,
    call_gas_limit: U256,
    valid_until: U256,
    policy_tag: PolicyTag,
    scheme: VerifierScheme,
    signatures: Vec<u8>,
) -> UserOp {
    UserOp {
        sender,
        nonce,
        target,
        value,
        callData: call_data.into(),
        callGasLimit: call_gas_limit,
        validUntil: valid_until,
        policyTag: policy_tag as u8,
        verifierScheme: scheme as u16,
        signatures: signatures.into(),
    }
}
