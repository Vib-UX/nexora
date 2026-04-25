//! Canonical error variants raised by Nexora contracts.
//!
//! These are encoded as Solidity custom errors via `SolError`-style selectors
//! by individual contract crates; here we keep a Rust-level enum for tests and
//! shared logic.

use alloc::string::String;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NexoraError {
    InvalidSignature,
    InvalidEcdsaSignature,
    InvalidPqSignature,
    PqRequired,
    EcdsaRequired,
    SchemeMismatch,
    PubkeyMismatch,
    NonceUsed,
    Expired,
    PolicyDenied,
    NotOwner,
    UnknownScheme,
    UnknownVerifier,
    AlreadyInitialized,
    NotInitialized,
    ExecutionReverted(String),
    TimelockActive,
    TimelockMissing,
}

impl NexoraError {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::InvalidSignature => "INVALID_SIGNATURE",
            Self::InvalidEcdsaSignature => "INVALID_ECDSA",
            Self::InvalidPqSignature => "INVALID_PQ",
            Self::PqRequired => "PQ_REQUIRED",
            Self::EcdsaRequired => "ECDSA_REQUIRED",
            Self::SchemeMismatch => "SCHEME_MISMATCH",
            Self::PubkeyMismatch => "PUBKEY_MISMATCH",
            Self::NonceUsed => "NONCE_USED",
            Self::Expired => "EXPIRED",
            Self::PolicyDenied => "POLICY_DENIED",
            Self::NotOwner => "NOT_OWNER",
            Self::UnknownScheme => "UNKNOWN_SCHEME",
            Self::UnknownVerifier => "UNKNOWN_VERIFIER",
            Self::AlreadyInitialized => "ALREADY_INIT",
            Self::NotInitialized => "NOT_INIT",
            Self::ExecutionReverted(_) => "EXEC_REVERT",
            Self::TimelockActive => "TIMELOCK_ACTIVE",
            Self::TimelockMissing => "TIMELOCK_MISSING",
        }
    }
}
