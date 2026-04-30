//! Scheme-1 (FALCON_MOCK) reference verifier — implements the canonical
//! `IPQVerifier` interface so every other Nexora contract can call into it
//! without caring whether the backend is this reference path, full
//! Falcon-512, or a future Nitro precompile behind the registry.
//!
//! ## Reference semantics
//!
//! This verifier provides a **structurally correct** signature flow with the
//! same API as full Falcon-512:
//!
//! ```text
//! verify(msgHash, sig, pubkey) := keccak256(pubkey || msgHash) == sig[..32]
//!                              && sig.length      == FALCON512_SIG_BYTES
//!                              && pubkey.length   == FALCON512_PK_BYTES
//! ```
//!
//! The scheme-1 signer in `wallet-sdk` produces signatures using exactly this
//! rule. Swapping in full Falcon-512 only requires pointing the registry at
//! a different `IPQVerifier` — the calling contracts do not move.

#![cfg_attr(not(feature = "export-abi"), no_main)]

extern crate alloc;

use alloc::vec::Vec;
use alloy_primitives::{keccak256, Address, B256, U16};
use stylus_sdk::{abi::Bytes, prelude::*};

/// Canonical Falcon-512 sizes (on-wire layout).
/// Pubkey and signature must match these lengths so the on-the-wire shape
/// matches full Falcon-512 verification.
pub const FALCON512_PUBKEY_BYTES: usize = 897;
pub const FALCON512_SIG_BYTES: usize = 666;

/// FALCON_512 identifier in the Nexora `VerifierScheme` enum.
pub const SCHEME_FALCON512: u16 = 2;

/// Identifier reported for the FALCON_MOCK implementation.
pub const SCHEME_FALCON_MOCK: u16 = 1;

sol_storage! {
    #[entrypoint]
    pub struct PqVerifier {
        /// Owner — allowed to flip `strict_lengths` for fuzzing.
        address owner;
        /// Whether the verifier enforces real Falcon-512 byte lengths.
        bool strict_lengths;
        /// `true` once `init` has been called.
        bool initialized;
        /// Identifier returned by `scheme()`.
        uint16 reported_scheme;
    }
}

#[public]
impl PqVerifier {
    /// One-shot initializer (set owner + strict-mode).
    pub fn init(&mut self, owner: Address, strict: bool) -> Result<(), Vec<u8>> {
        if self.initialized.get() {
            return Err(b"ALREADY_INIT".to_vec());
        }
        self.owner.set(owner);
        self.strict_lengths.set(strict);
        self.reported_scheme.set(U16::from(SCHEME_FALCON_MOCK));
        self.initialized.set(true);
        Ok(())
    }

    /// Returns the `VerifierScheme` id implemented by this contract.
    pub fn scheme(&self) -> u16 {
        self.reported_scheme.get().to::<u16>()
    }

    /// Set which scheme id this contract reports. Owner-only. Useful for
    /// the demo "swap verifier" step.
    pub fn set_reported_scheme(&mut self, new_scheme: u16) -> Result<(), Vec<u8>> {
        self.assert_owner()?;
        self.reported_scheme.set(U16::from(new_scheme));
        Ok(())
    }

    /// Expected pubkey length in bytes (Falcon-512 fixed).
    pub fn pubkey_length(&self) -> u16 {
        FALCON512_PUBKEY_BYTES as u16
    }

    /// Expected signature length in bytes (Falcon-512 fixed).
    pub fn sig_length(&self) -> u16 {
        FALCON512_SIG_BYTES as u16
    }

    /// Reference verify — deterministic, structurally aligned with Falcon-512 sizes.
    ///
    /// Returns `true` iff the first 32 bytes of `sig` equal
    /// `keccak256(pubkey || msg_hash)` and the lengths are valid.
    pub fn verify(&self, msg_hash: B256, sig: Bytes, pubkey: Bytes) -> bool {
        if self.strict_lengths.get() {
            if pubkey.len() != FALCON512_PUBKEY_BYTES {
                return false;
            }
            if sig.len() != FALCON512_SIG_BYTES {
                return false;
            }
        } else if pubkey.is_empty() || sig.len() < 32 {
            return false;
        }

        let mut buf = Vec::with_capacity(pubkey.len() + 32);
        buf.extend_from_slice(&pubkey);
        buf.extend_from_slice(msg_hash.as_slice());
        let expected = keccak256(&buf);

        sig[..32] == expected[..]
    }

    /// Convenience: derive the canonical commitment for a pubkey
    /// (= `keccak256(pubkey)`). Wallets store this commitment.
    pub fn pubkey_commitment(&self, pubkey: Bytes) -> B256 {
        keccak256(&pubkey)
    }
}

impl PqVerifier {
    fn assert_owner(&self) -> Result<(), Vec<u8>> {
        if stylus_sdk::msg::sender() != self.owner.get() {
            return Err(b"NOT_OWNER".to_vec());
        }
        Ok(())
    }
}
