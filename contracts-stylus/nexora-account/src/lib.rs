//! `NexoraAccount` — Stylus smart account with a hybrid ECDSA + PQ validator
//! and an on-chain policy gate.
//!
//! Public surface (mirrors `INexoraAccount.sol`):
//!
//! ```text
//! validate_user_op(op, opHash, providedPubkey) -> u64
//! execute_user_op(op, providedPubkey)
//! execute_intent(agentId, op, providedPubkey)
//! is_valid_signature(hash, sig) -> bytes4         // ERC-1271
//! propose_owner_rotation / commit_owner_rotation / cancel_owner_rotation
//! propose_pq_pubkey_rotation / commit_pq_pubkey_rotation
//! ```
//!
//! Storage layout, validation, execution, ERC-1271, and recovery logic are
//! split across submodules (each providing inherent helper methods on
//! `Account`). This file holds the **single** `#[public] impl` block —
//! stylus-sdk requires exactly one per type.

#![cfg_attr(not(feature = "export-abi"), no_main)]

extern crate alloc;

pub mod erc1271;
pub mod execution;
#[cfg(feature = "recovery")]
pub mod recovery;
pub mod storage;
pub mod validation;

use alloc::vec::Vec;
use alloy_primitives::{Address, B256};
use alloy_sol_types::SolValue;
use stylus_sdk::{abi::Bytes, prelude::*};

use storage::Account;

sol_storage! {
    #[entrypoint]
    pub struct NexoraAccount {
        #[borrow]
        Account inner;
    }
}

#[public]
#[inherit(Account)]
impl NexoraAccount {}

/// Magic value used by ERC-1271 to indicate a signature is valid.
pub const ERC1271_MAGIC: [u8; 4] = [0x16, 0x26, 0xba, 0x7e];

pub const VALIDATION_OK: u64 = 0;
pub const VALIDATION_FAIL: u64 = 1;

pub use nexora_shared::{compute_op_hash, PolicyTag, UserOp, VerifierScheme};

#[public]
impl Account {
    /// Top up the wallet's ETH balance. Stylus 0.6 doesn't support
    /// `receive()` / `fallback()` directly, so EOAs that want to fund the
    /// wallet send to this method (selector `0xb60d4288`). The wallet's
    /// own `executeUserOp` is also `#[payable]`, so funding-via-execute
    /// is also supported.
    #[payable]
    pub fn fund(&mut self) -> Result<(), Vec<u8>> {
        Ok(())
    }

    // ---- init / views (formerly storage.rs) ----------------------------

    pub fn init(
        &mut self,
        owner: Address,
        pq_pubkey_hash: B256,
        verifier_registry: Address,
        policy_engine: Address,
    ) -> Result<(), Vec<u8>> {
        Account::do_init(self, owner, pq_pubkey_hash, verifier_registry, policy_engine)
    }

    pub fn owner(&self) -> Address {
        self.owner.get()
    }

    pub fn pq_pubkey_hash(&self) -> B256 {
        self.pq_pubkey_hash.get()
    }

    pub fn verifier_registry(&self) -> Address {
        self.verifier_registry.get()
    }

    pub fn policy_engine(&self) -> Address {
        self.policy_engine.get()
    }

    pub fn get_nonce(&self, channel: alloy_primitives::U256) -> alloy_primitives::U256 {
        Account::do_get_nonce(self, channel)
    }

    // ---- execution (formerly execution.rs) -----------------------------
    //
    // `op_bytes` is `abi.encode(UserOp)` — we accept bytes at the ABI
    // boundary (cross-crate `sol!` types lack `AbiType` impls in stylus
    // 0.6) and decode internally.

    #[payable]
    pub fn execute_user_op(
        &mut self,
        op_bytes: Bytes,
        provided_pubkey: Bytes,
    ) -> Result<bool, Vec<u8>> {
        let op = UserOp::abi_decode(&op_bytes, true).map_err(|_| b"BAD_OP".to_vec())?;
        Account::do_execute_user_op(self, op, provided_pubkey.0)
    }

    #[payable]
    pub fn execute_intent(
        &mut self,
        agent_id: B256,
        op_bytes: Bytes,
        provided_pubkey: Bytes,
    ) -> Result<bool, Vec<u8>> {
        let op = UserOp::abi_decode(&op_bytes, true).map_err(|_| b"BAD_OP".to_vec())?;
        Account::do_execute_intent(self, agent_id, op, provided_pubkey.0)
    }

    pub fn validate_user_op(
        &self,
        op_bytes: Bytes,
        op_hash: B256,
        provided_pubkey: Bytes,
    ) -> u64 {
        let op = match UserOp::abi_decode(&op_bytes, true) {
            Ok(o) => o,
            Err(_) => return VALIDATION_FAIL,
        };
        Account::do_validate_user_op(self, op, op_hash, provided_pubkey.0)
    }

    /// View: return the EIP-712 op hash this wallet computes for `opBytes`.
    /// Useful for off-chain debugging and for clients that want to know
    /// the on-chain canonical hash before signing.
    pub fn op_hash_view(&self, op_bytes: Bytes) -> Result<B256, Vec<u8>> {
        let op = UserOp::abi_decode(&op_bytes, true).map_err(|_| b"BAD_OP".to_vec())?;
        let chain_id = alloy_primitives::U256::from(stylus_sdk::block::chainid());
        let self_addr = stylus_sdk::contract::address();
        Ok(compute_op_hash(&op, chain_id, self_addr))
    }

    // ---- ERC-1271 (formerly erc1271.rs) --------------------------------

    pub fn is_valid_signature(&self, hash: B256, sig: Bytes) -> [u8; 4] {
        Account::do_is_valid_signature(self, hash, sig.0)
    }

    // ---- Recovery (stubbed for MVP) ------------------------------------
    //
    // Timelocked owner / PQ-pubkey rotation logic lives in `recovery.rs`,
    // gated behind the `recovery` cargo feature. The production implementation
    // pushes the activated WASM over the Stylus 24KB-after-brotli limit, so
    // for MVP we keep the ABI surface but revert at call time. The
    // dispatch/storage layout is forward-compatible — flipping the feature
    // on (and trimming the verifier path) re-enables the full flow.

    pub fn propose_owner_rotation(
        &mut self,
        _new_owner: Address,
        _scheme: u16,
        _pq_sig: Bytes,
        _pq_pubkey: Bytes,
    ) -> Result<(), Vec<u8>> {
        #[cfg(feature = "recovery")]
        return Account::do_propose_owner_rotation(self, _new_owner, _scheme, _pq_sig.0, _pq_pubkey.0);
        #[cfg(not(feature = "recovery"))]
        Err(b"RECOVERY_DISABLED".to_vec())
    }

    pub fn commit_owner_rotation(&mut self) -> Result<(), Vec<u8>> {
        #[cfg(feature = "recovery")]
        return Account::do_commit_owner_rotation(self);
        #[cfg(not(feature = "recovery"))]
        Err(b"RECOVERY_DISABLED".to_vec())
    }

    pub fn cancel_owner_rotation(&mut self) -> Result<(), Vec<u8>> {
        #[cfg(feature = "recovery")]
        return Account::do_cancel_owner_rotation(self);
        #[cfg(not(feature = "recovery"))]
        Err(b"RECOVERY_DISABLED".to_vec())
    }

    pub fn propose_pq_pubkey_rotation(
        &mut self,
        _new_pubkey_hash: B256,
        _scheme: u16,
        _pq_sig_old: Bytes,
        _pq_pubkey_old: Bytes,
    ) -> Result<(), Vec<u8>> {
        #[cfg(feature = "recovery")]
        return Account::do_propose_pq_pubkey_rotation(
            self,
            _new_pubkey_hash,
            _scheme,
            _pq_sig_old.0,
            _pq_pubkey_old.0,
        );
        #[cfg(not(feature = "recovery"))]
        Err(b"RECOVERY_DISABLED".to_vec())
    }

    pub fn commit_pq_pubkey_rotation(&mut self) -> Result<(), Vec<u8>> {
        #[cfg(feature = "recovery")]
        return Account::do_commit_pq_pubkey_rotation(self);
        #[cfg(not(feature = "recovery"))]
        Err(b"RECOVERY_DISABLED".to_vec())
    }

    pub fn pending_owner(&self) -> Address {
        self.pending_owner.get()
    }

    pub fn pending_owner_unlock_at(&self) -> u64 {
        self.pending_owner_unlock_at.get().to::<u64>()
    }

    pub fn pending_pq_pubkey_hash(&self) -> B256 {
        self.pending_pq_pubkey_hash.get()
    }

    pub fn pending_pq_unlock_at(&self) -> u64 {
        self.pending_pq_unlock_at.get().to::<u64>()
    }
}
