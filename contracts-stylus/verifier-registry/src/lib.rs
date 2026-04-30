//! `VerifierRegistry` — the indirection that lets us swap PQ verifier
//! implementations (reference verifier → Falcon-512 → Nitro precompile) without
//! redeploying any wallets.
//!
//! Wallets call `registry.verifier(scheme)` to discover the address of
//! the current `IPQVerifier` for a given scheme id, then `staticcall`
//! that contract.

#![cfg_attr(not(feature = "export-abi"), no_main)]

extern crate alloc;

use alloc::vec::Vec;
use alloy_primitives::{Address, U16};
use alloy_sol_types::sol;
use stylus_sdk::{evm, prelude::*};

sol! {
    event VerifierUpdated(uint16 indexed scheme, address indexed impl_addr);
}

sol_storage! {
    #[entrypoint]
    pub struct VerifierRegistry {
        address owner;
        bool initialized;
        /// scheme id -> verifier contract address
        mapping(uint16 => address) verifiers;
    }
}

#[public]
impl VerifierRegistry {
    /// One-shot init: set owner. Owner can change verifier mappings.
    pub fn init(&mut self, owner: Address) -> Result<(), Vec<u8>> {
        if self.initialized.get() {
            return Err(b"ALREADY_INIT".to_vec());
        }
        self.owner.set(owner);
        self.initialized.set(true);
        Ok(())
    }

    /// Resolve scheme -> verifier address. Returns the zero address if
    /// no verifier is registered.
    pub fn verifier(&self, scheme: u16) -> Address {
        self.verifiers.get(U16::from(scheme))
    }

    /// Owner-gated registration. Setting `impl_addr` to the zero address
    /// removes the mapping.
    pub fn set_verifier(
        &mut self,
        scheme: u16,
        impl_addr: Address,
    ) -> Result<(), Vec<u8>> {
        self.assert_owner()?;
        self.verifiers
            .setter(U16::from(scheme))
            .set(impl_addr);
        evm::log(VerifierUpdated {
            scheme,
            impl_addr,
        });
        Ok(())
    }

    /// Read the owner.
    pub fn owner(&self) -> Address {
        self.owner.get()
    }

    /// Transfer ownership.
    pub fn transfer_ownership(&mut self, new_owner: Address) -> Result<(), Vec<u8>> {
        self.assert_owner()?;
        self.owner.set(new_owner);
        Ok(())
    }
}

impl VerifierRegistry {
    fn assert_owner(&self) -> Result<(), Vec<u8>> {
        if stylus_sdk::msg::sender() != self.owner.get() {
            return Err(b"NOT_OWNER".to_vec());
        }
        Ok(())
    }
}
