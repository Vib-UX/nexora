//! Shared types and helpers for Nexora Stylus contracts.
//!
//! This crate is `no_std`-friendly and intentionally has no `stylus_sdk`
//! dependency: every Stylus contract crate in the workspace pulls these
//! types in to keep the wire format consistent.

#![cfg_attr(not(feature = "std"), no_std)]

extern crate alloc;

pub mod errors;
pub mod op_hash;
pub mod types;

pub use errors::NexoraError;
pub use op_hash::{compute_op_hash, EIP712_DOMAIN_TYPEHASH, USEROP_TYPEHASH};
pub use types::{
    EcdsaSig, PolicyTag, PqSig, SignatureEnvelope, UserOp, VerifierScheme, NEXORA_DOMAIN_NAME,
    NEXORA_DOMAIN_VERSION,
};
