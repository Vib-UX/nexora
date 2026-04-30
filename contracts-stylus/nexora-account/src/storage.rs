//! Storage layout + initialization for `NexoraAccount`.

use alloc::vec::Vec;
use alloy_primitives::{Address, B256, U256, U64};
use stylus_sdk::prelude::*;

sol_storage! {
    pub struct Account {
        /// `true` after `init` has been called by the factory.
        bool initialized;

        /// Primary ECDSA owner. Used for LOW + HIGH paths.
        address owner;

        /// keccak256(pq_pubkey). Stored commitment, the full pubkey lives
        /// off-chain and is supplied with each PQ signature.
        bytes32 pq_pubkey_hash;

        /// Where to look up `IPQVerifier` for a given scheme id.
        address verifier_registry;

        /// Policy engine that classifies ops.
        address policy_engine;

        /// 2D nonce table: channel -> sequential.
        /// Channel 0 = ECDSA-only ops, channel 1 = PQ-required ops.
        mapping(uint192 => uint64) nonces;

        /// Pending owner rotation, gated by timelock.
        address pending_owner;
        uint64  pending_owner_unlock_at;

        /// Pending PQ key rotation.
        bytes32 pending_pq_pubkey_hash;
        uint64  pending_pq_unlock_at;

        /// Forward-compat: ERC-7579 module slots (reserved, not wired).
        address[] validators;
        address[] executors;
        address[] hooks;
    }
}

/// Hard-coded timelock used for CRITICAL operations (owner rotation,
/// PQ pubkey rotation) — 60 seconds for the demo.
pub const CRITICAL_TIMELOCK_SECS: u64 = 60;

impl Account {
    /// One-shot initializer called by the factory directly after deploy.
    pub fn do_init(
        &mut self,
        owner: Address,
        pq_pubkey_hash: B256,
        verifier_registry: Address,
        policy_engine: Address,
    ) -> Result<(), Vec<u8>> {
        if self.initialized.get() {
            return Err(b"ALREADY_INIT".to_vec());
        }
        self.owner.set(owner);
        self.pq_pubkey_hash.set(pq_pubkey_hash);
        self.verifier_registry.set(verifier_registry);
        self.policy_engine.set(policy_engine);
        self.initialized.set(true);
        Ok(())
    }

    /// Read the current sequential nonce on a given channel.
    pub fn do_get_nonce(&self, channel: U256) -> U256 {
        let key = u192_from_u256(channel);
        let v = self.nonces.get(key);
        U256::from(v.to::<u64>())
    }
}

impl Account {
    /// Internal: enforce strict-increment on `(channel, expected)` then bump.
    /// Returns `Ok` if the supplied nonce matches the next expected value.
    pub fn consume_nonce(&mut self, channel: u8, expected: U256) -> Result<(), &'static str> {
        let key = U256::from(channel);
        let key192 = u192_from_u256(key);
        let current = self.nonces.get(key192).to::<u64>();
        let want = current as u128 + 1;
        if expected != U256::from(want) {
            return Err("NONCE_USED");
        }
        self.nonces.setter(key192).set(U64::from(want as u64));
        Ok(())
    }

    /// Internal helper for tests.
    pub fn set_pq_pubkey_hash_unchecked(&mut self, h: B256) {
        self.pq_pubkey_hash.set(h);
    }
}

/// Truncate a U256 channel value into the contract's uint192 key space.
fn u192_from_u256(c: U256) -> alloy_primitives::Uint<192, 3> {
    // Take the low 192 bits.
    let bytes = c.to_be_bytes::<32>();
    let mut buf = [0u8; 24];
    buf.copy_from_slice(&bytes[8..]);
    alloy_primitives::Uint::<192, 3>::from_be_bytes(buf)
}
