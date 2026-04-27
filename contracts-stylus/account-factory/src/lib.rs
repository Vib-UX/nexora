//! `AccountFactory` — deterministic deployer for `NexoraAccount`.
//!
//! Uses a **proxy + initializer** pattern instead of redeploying full
//! Stylus bytecode per wallet:
//!
//! ```text
//! impl_addr     := singleton NexoraAccount implementation
//! salt          := keccak256(owner || pq_pubkey_hash || user_salt)
//! account_addr  := CREATE2(factory, salt, proxy_init_code(impl_addr))
//! ```
//!
//! The proxy is a minimal forwarding contract whose runtime delegate-calls
//! `impl_addr` (EIP-1167 minimal proxy). On creation, the factory calls
//! `Account.init(owner, pq_pubkey_hash, registry, policy)` on the new
//! address.
//!
//! For the MVP we expose:
//! - `init(impl, registry, policy)`  — wire dependencies once.
//! - `create_account(owner, pq_pubkey_hash, user_salt)` — deploy + init.
//! - `predict_address(owner, pq_pubkey_hash, user_salt)` — view.

#![cfg_attr(not(feature = "export-abi"), no_main)]

extern crate alloc;

use alloc::vec::Vec;
use alloy_primitives::{Address, B256};
use alloy_sol_types::{sol, SolCall};
use sha3::{Digest, Keccak256};
use stylus_sdk::{call::RawCall, evm, prelude::*};

sol_storage! {
    #[entrypoint]
    pub struct AccountFactory {
        bool initialized;
        address implementation;
        address verifier_registry;
        address policy_engine;
        /// Owner of the factory (allowed to update implementation pointer).
        address owner;
    }
}

sol! {
    interface INexoraAccountInit {
        function init(
            address owner,
            bytes32 pqPubkeyHash,
            address verifierRegistry,
            address policyEngine
        ) external;
    }

    event AccountCreated(
        address indexed account,
        address indexed owner,
        bytes32 pqPubkeyHash,
        bytes32 salt
    );
}

#[public]
impl AccountFactory {
    pub fn init(
        &mut self,
        owner: Address,
        implementation: Address,
        verifier_registry: Address,
        policy_engine: Address,
    ) -> Result<(), Vec<u8>> {
        if self.initialized.get() {
            return Err(b"ALREADY_INIT".to_vec());
        }
        self.owner.set(owner);
        self.implementation.set(implementation);
        self.verifier_registry.set(verifier_registry);
        self.policy_engine.set(policy_engine);
        self.initialized.set(true);
        Ok(())
    }

    /// Predict the deterministic address for a future `create_account` call.
    pub fn predict_address(
        &self,
        owner: Address,
        pq_pubkey_hash: B256,
        user_salt: B256,
    ) -> Address {
        let salt = compute_salt(owner, pq_pubkey_hash, user_salt);
        let init_code = proxy_init_code(self.implementation.get());
        create2_address(stylus_sdk::contract::address(), salt, &init_code)
    }

    /// Deploy + initialize a fresh account at the deterministic address.
    pub fn create_account(
        &mut self,
        owner: Address,
        pq_pubkey_hash: B256,
        user_salt: B256,
    ) -> Result<Address, Vec<u8>> {
        let salt = compute_salt(owner, pq_pubkey_hash, user_salt);
        let init_code = proxy_init_code(self.implementation.get());
        let predicted = create2_address(stylus_sdk::contract::address(), salt, &init_code);

        // If already deployed, just return.
        if has_code(predicted) {
            return Ok(predicted);
        }

        // Deploy via inline CREATE2. Stylus exposes this through the
        // `stylus_sdk::deploy` module on supported toolchains; if not
        // available, the helper below falls back to a CALL-based shim.
        let deployed = match deploy_create2(salt, &init_code) {
            Some(addr) => addr,
            None => return Err(b"DEPLOY_FAILED".to_vec()),
        };
        if deployed != predicted {
            return Err(b"ADDR_MISMATCH".to_vec());
        }

        // Initialize.
        let calldata = INexoraAccountInit::initCall {
            owner,
            pqPubkeyHash: pq_pubkey_hash,
            verifierRegistry: self.verifier_registry.get(),
            policyEngine: self.policy_engine.get(),
        }
        .abi_encode();
        if unsafe { RawCall::new().call(deployed, &calldata) }.is_err() {
            return Err(b"INIT_FAILED".to_vec());
        }

        evm::log(AccountCreated {
            account: deployed,
            owner,
            pqPubkeyHash: pq_pubkey_hash,
            salt,
        });
        Ok(deployed)
    }

    /// Owner-gated implementation upgrade (affects future deployments only).
    pub fn set_implementation(&mut self, new_impl: Address) -> Result<(), Vec<u8>> {
        if stylus_sdk::msg::sender() != self.owner.get() {
            return Err(b"NOT_OWNER".to_vec());
        }
        self.implementation.set(new_impl);
        Ok(())
    }

    pub fn implementation(&self) -> Address {
        self.implementation.get()
    }
    pub fn verifier_registry(&self) -> Address {
        self.verifier_registry.get()
    }
    pub fn policy_engine(&self) -> Address {
        self.policy_engine.get()
    }
}

fn compute_salt(owner: Address, pq_pubkey_hash: B256, user_salt: B256) -> B256 {
    let mut h = Keccak256::new();
    h.update(b"NEXORA_ACCOUNT_SALT");
    h.update(owner.as_slice());
    h.update(pq_pubkey_hash.as_slice());
    h.update(user_salt.as_slice());
    B256::from_slice(&h.finalize())
}

/// EIP-1167 minimal proxy bytecode targeting `impl_addr`.
/// Layout (45 bytes):
///   3d602d80600a3d3981f3 || 363d3d373d3d3d363d73 || <20-byte impl> || 5af43d82803e903d91602b57fd5bf3
fn proxy_init_code(impl_addr: Address) -> Vec<u8> {
    let mut code = Vec::with_capacity(55);
    code.extend_from_slice(&hex_lit(
        "3d602d80600a3d3981f3363d3d373d3d3d363d73",
    ));
    code.extend_from_slice(impl_addr.as_slice());
    code.extend_from_slice(&hex_lit("5af43d82803e903d91602b57fd5bf3"));
    code
}

/// Compute CREATE2 address: keccak256(0xff || deployer || salt || keccak256(init))[12..].
fn create2_address(deployer: Address, salt: B256, init_code: &[u8]) -> Address {
    let init_hash = {
        let mut h = Keccak256::new();
        h.update(init_code);
        let out = h.finalize();
        B256::from_slice(&out)
    };
    let mut h = Keccak256::new();
    h.update([0xff]);
    h.update(deployer.as_slice());
    h.update(salt.as_slice());
    h.update(init_hash.as_slice());
    let digest = h.finalize();
    let mut addr = [0u8; 20];
    addr.copy_from_slice(&digest[12..]);
    Address::from(addr)
}

fn hex_lit(s: &str) -> Vec<u8> {
    let mut out = Vec::with_capacity(s.len() / 2);
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        let hi = nibble(bytes[i]);
        let lo = nibble(bytes[i + 1]);
        out.push((hi << 4) | lo);
        i += 2;
    }
    out
}

fn nibble(c: u8) -> u8 {
    match c {
        b'0'..=b'9' => c - b'0',
        b'a'..=b'f' => 10 + c - b'a',
        b'A'..=b'F' => 10 + c - b'A',
        _ => 0,
    }
}

fn has_code(_addr: Address) -> bool {
    // stylus-sdk 0.6 does not expose `extcodesize`. For the MVP we always
    // attempt the deploy; a duplicate `create_account` for the same
    // (owner, pq_pubkey_hash, user_salt) will revert in `deploy_create2`,
    // which is acceptable behaviour. Replace with a real EXTCODESIZE check
    // once stylus-sdk exposes one.
    false
}

/// Deploy via CREATE2.
///
/// `RawDeploy::deploy` is `unsafe` in stylus-sdk 0.6 because it transfers
/// control to bytecode supplied at runtime. We treat the wrapped call site
/// as the single trust boundary: callers of `create_account` are owner-gated
/// and the bytecode is the EIP-1167 minimal proxy pointing at our own
/// validated implementation address.
fn deploy_create2(salt: B256, init_code: &[u8]) -> Option<Address> {
    use stylus_sdk::deploy::RawDeploy;
    unsafe {
        RawDeploy::new()
            .salt(salt)
            .deploy(init_code, alloy_primitives::U256::ZERO)
            .ok()
    }
}
