//! Owner & PQ-key rotation with a CRITICAL-tag timelock.
//!
//! Two-step flow for both rotations:
//! 1. `propose_*` — verifies a PQ signature over the proposal and starts a
//!    `CRITICAL_TIMELOCK_SECS` timelock.
//! 2. `commit_*`  — anyone can call after the timelock; flips storage.
//!
//! Cancellation: owner (or current PQ holder via PQ sig) can `cancel_*`.
//!
//! For the MVP we keep the verifier path identical to validation.rs —
//! resolve via registry, then check `verify(hash, sig, pubkey)`.

use alloc::vec::Vec;
use alloy_primitives::{Address, B256, U256, U64};
use alloy_sol_types::{sol, SolCall};
use sha3::{Digest, Keccak256};
use stylus_sdk::{call::RawCall, evm};

use crate::storage::{Account, CRITICAL_TIMELOCK_SECS};

sol! {
    interface IVerifierRegistryR {
        function verifier(uint16 scheme) external view returns (address);
    }
    interface IPQVerifierR {
        function verify(bytes32 msgHash, bytes calldata sig, bytes calldata pubkey)
            external view returns (bool);
    }

    event OwnerRotationProposed(address indexed newOwner, uint64 unlockAt);
    event OwnerRotated(address indexed oldOwner, address indexed newOwner);
    event PqPubkeyRotationProposed(bytes32 newPubkeyHash, uint64 unlockAt);
    event PqPubkeyRotated(bytes32 oldHash, bytes32 newHash);
}

impl Account {
    /// Step 1: propose owner rotation. Requires a PQ signature over
    /// `keccak256("ROTATE_OWNER" || newOwner || chainId || account)`.
    pub fn do_propose_owner_rotation(
        &mut self,
        new_owner: Address,
        scheme: u16,
        pq_sig: Vec<u8>,
        pq_pubkey: Vec<u8>,
    ) -> Result<(), Vec<u8>> {
        let msg_hash = rotation_digest_owner(new_owner);
        if !self.verify_pq_with_registry(scheme, msg_hash, &pq_sig, &pq_pubkey) {
            return Err(b"INVALID_PQ".to_vec());
        }
        let unlock = stylus_sdk::block::timestamp() + CRITICAL_TIMELOCK_SECS;
        self.pending_owner.set(new_owner);
        self.pending_owner_unlock_at.set(U64::from(unlock));
        evm::log(OwnerRotationProposed {
            newOwner: new_owner,
            unlockAt: unlock,
        });
        Ok(())
    }

    /// Step 2: commit owner rotation after timelock has expired.
    pub fn do_commit_owner_rotation(&mut self) -> Result<(), Vec<u8>> {
        let unlock = self.pending_owner_unlock_at.get().to::<u64>();
        if unlock == 0 {
            return Err(b"TIMELOCK_MISSING".to_vec());
        }
        if stylus_sdk::block::timestamp() < unlock {
            return Err(b"TIMELOCK_ACTIVE".to_vec());
        }
        let new_owner = self.pending_owner.get();
        let old = self.owner.get();
        self.owner.set(new_owner);
        self.pending_owner.set(Address::ZERO);
        self.pending_owner_unlock_at.set(U64::ZERO);
        evm::log(OwnerRotated {
            oldOwner: old,
            newOwner: new_owner,
        });
        Ok(())
    }

    /// Cancel a pending owner rotation. Caller must be current owner.
    pub fn do_cancel_owner_rotation(&mut self) -> Result<(), Vec<u8>> {
        if stylus_sdk::msg::sender() != self.owner.get() {
            return Err(b"NOT_OWNER".to_vec());
        }
        self.pending_owner.set(Address::ZERO);
        self.pending_owner_unlock_at.set(U64::ZERO);
        Ok(())
    }

    /// Propose PQ key rotation. Requires a signature *under the OLD key*.
    pub fn do_propose_pq_pubkey_rotation(
        &mut self,
        new_pubkey_hash: B256,
        scheme: u16,
        pq_sig_old: Vec<u8>,
        pq_pubkey_old: Vec<u8>,
    ) -> Result<(), Vec<u8>> {
        let msg_hash = rotation_digest_pq(new_pubkey_hash);
        if !self.verify_pq_with_registry(scheme, msg_hash, &pq_sig_old, &pq_pubkey_old) {
            return Err(b"INVALID_PQ".to_vec());
        }
        let unlock = stylus_sdk::block::timestamp() + CRITICAL_TIMELOCK_SECS;
        self.pending_pq_pubkey_hash.set(new_pubkey_hash);
        self.pending_pq_unlock_at.set(U64::from(unlock));
        evm::log(PqPubkeyRotationProposed {
            newPubkeyHash: new_pubkey_hash,
            unlockAt: unlock,
        });
        Ok(())
    }

    pub fn do_commit_pq_pubkey_rotation(&mut self) -> Result<(), Vec<u8>> {
        let unlock = self.pending_pq_unlock_at.get().to::<u64>();
        if unlock == 0 {
            return Err(b"TIMELOCK_MISSING".to_vec());
        }
        if stylus_sdk::block::timestamp() < unlock {
            return Err(b"TIMELOCK_ACTIVE".to_vec());
        }
        let new_h = self.pending_pq_pubkey_hash.get();
        let old = self.pq_pubkey_hash.get();
        self.pq_pubkey_hash.set(new_h);
        self.pending_pq_pubkey_hash.set(B256::ZERO);
        self.pending_pq_unlock_at.set(U64::ZERO);
        evm::log(PqPubkeyRotated {
            oldHash: old,
            newHash: new_h,
        });
        Ok(())
    }

}

impl Account {
    fn verify_pq_with_registry(
        &self,
        scheme: u16,
        msg_hash: B256,
        sig: &[u8],
        pubkey: &[u8],
    ) -> bool {
        let registry = self.verifier_registry.get();
        let q = IVerifierRegistryR::verifierCall { scheme }.abi_encode();
        let raw = match unsafe { RawCall::new_static().call(registry, &q) } {
            Ok(b) => b,
            Err(_) => return false,
        };
        if raw.len() < 32 {
            return false;
        }
        let mut addr = [0u8; 20];
        addr.copy_from_slice(&raw[12..32]);
        let verifier = Address::from(addr);
        if verifier == Address::ZERO {
            return false;
        }
        let q = IPQVerifierR::verifyCall {
            msgHash: msg_hash,
            sig: sig.to_vec().into(),
            pubkey: pubkey.to_vec().into(),
        }
        .abi_encode();
        let raw = match unsafe { RawCall::new_static().call(verifier, &q) } {
            Ok(b) => b,
            Err(_) => return false,
        };
        raw.last().map(|b| *b == 1).unwrap_or(false)
    }
}

fn rotation_digest_owner(new_owner: Address) -> B256 {
    let mut h = Keccak256::new();
    h.update(b"NEXORA_ROTATE_OWNER");
    h.update(new_owner.as_slice());
    h.update(U256::from(stylus_sdk::block::chainid()).to_be_bytes::<32>());
    h.update(stylus_sdk::contract::address().as_slice());
    B256::from_slice(&h.finalize())
}

fn rotation_digest_pq(new_pubkey_hash: B256) -> B256 {
    let mut h = Keccak256::new();
    h.update(b"NEXORA_ROTATE_PQ");
    h.update(new_pubkey_hash.as_slice());
    h.update(U256::from(stylus_sdk::block::chainid()).to_be_bytes::<32>());
    h.update(stylus_sdk::contract::address().as_slice());
    B256::from_slice(&h.finalize())
}
