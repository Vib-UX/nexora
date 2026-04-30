//! Real Falcon-512 verifier — pure-Stylus, verify-only port of the NIST
//! Falcon submission. Implements the same `IPQVerifier` shape as the
//! scheme-1 contract so the registry can swap them without touching the wallet.
//!
//! ## Why pure-Stylus
//!
//! The chain layer (Orbit + Stylus) is the only place where we control the
//! gas/precompile surface, so we ship a real verifier on-chain today and
//! upgrade to a Nitro precompile later (see `docs/architecture.md` →
//! "PQ verifier roadmap"). The IPQVerifier seam keeps that swap to a single
//! `setVerifier(scheme, addr)` transaction on `VerifierRegistry`.

#![cfg_attr(not(feature = "export-abi"), no_main)]

extern crate alloc;

use alloc::vec::Vec;
use alloy_primitives::{keccak256, Address, B256, U16};
use stylus_sdk::{abi::Bytes, prelude::*};

use nexora_falcon_core as falcon_core;

/// Falcon-512 fixed sizes (real algorithm).
pub use falcon_core::{PUBKEY_BYTES, SIG_BYTES};

/// VerifierScheme id (matches `nexora_shared::types::VerifierScheme::Falcon512`).
pub const SCHEME_FALCON512: u16 = 2;

sol_storage! {
    #[entrypoint]
    pub struct PqVerifierFalcon512 {
        /// Owner — allowed to update `reported_scheme`.
        address owner;
        /// `true` once `init` has been called.
        bool initialized;
        /// Identifier returned by `scheme()`. Defaults to `SCHEME_FALCON512`.
        uint16 reported_scheme;
    }
}

#[public]
impl PqVerifierFalcon512 {
    /// One-shot initializer. `owner` controls the (rarely used)
    /// `set_reported_scheme` admin function.
    pub fn init(&mut self, owner: Address) -> Result<(), Vec<u8>> {
        if self.initialized.get() {
            return Err(b"ALREADY_INIT".to_vec());
        }
        self.owner.set(owner);
        self.reported_scheme.set(U16::from(SCHEME_FALCON512));
        self.initialized.set(true);
        Ok(())
    }

    /// Returns the `VerifierScheme` id implemented by this contract.
    pub fn scheme(&self) -> u16 {
        self.reported_scheme.get().to::<u16>()
    }

    /// Owner-only: change the reported scheme id (used during the demo
    /// "swap verifier" step or for shimming a future precompile under the
    /// same address).
    pub fn set_reported_scheme(&mut self, new_scheme: u16) -> Result<(), Vec<u8>> {
        self.assert_owner()?;
        self.reported_scheme.set(U16::from(new_scheme));
        Ok(())
    }

    /// Expected pubkey length in bytes.
    pub fn pubkey_length(&self) -> u16 {
        PUBKEY_BYTES as u16
    }

    /// Expected signature length in bytes.
    pub fn sig_length(&self) -> u16 {
        SIG_BYTES as u16
    }

    /// Verify a Falcon-512 signature over `msg_hash`.
    pub fn verify(&self, msg_hash: B256, sig: Bytes, pubkey: Bytes) -> bool {
        falcon_core::verify(msg_hash.as_slice(), &sig, &pubkey)
    }

    /// Canonical pubkey commitment used by the wallet: `keccak256(pubkey)`.
    pub fn pubkey_commitment(&self, pubkey: Bytes) -> B256 {
        keccak256(&pubkey)
    }
}

impl PqVerifierFalcon512 {
    fn assert_owner(&self) -> Result<(), Vec<u8>> {
        if stylus_sdk::msg::sender() != self.owner.get() {
            return Err(b"NOT_OWNER".to_vec());
        }
        Ok(())
    }
}
