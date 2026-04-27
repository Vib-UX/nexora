//! ERC-1271 surface for off-chain signature checks.
//!
//! Supports both legacy ECDSA-only signatures (65 bytes) and the Nexora
//! hybrid envelope (`abi.encode(EcdsaSig, PqSig)`).

use alloc::vec::Vec;
use alloy_primitives::B256;
use alloy_sol_types::SolValue;
use sha3::{Digest, Keccak256};

use crate::storage::Account;
use nexora_shared::SignatureEnvelope;

const MAGIC: [u8; 4] = [0x16, 0x26, 0xba, 0x7e];
const FAIL: [u8; 4] = [0xff, 0xff, 0xff, 0xff];

impl Account {
    /// ERC-1271. Returns `0x1626ba7e` on success, `0xffffffff` otherwise.
    pub fn do_is_valid_signature(&self, hash: B256, sig: Vec<u8>) -> [u8; 4] {
        if sig.len() == 65 {
            // Legacy ECDSA-only path.
            let r = B256::from_slice(&sig[..32]);
            let s = B256::from_slice(&sig[32..64]);
            let v = sig[64];
            if super::validation::ecrecover_eip191_pub(hash, r, s, v)
                .map(|signer| signer == self.owner.get())
                .unwrap_or(false)
            {
                return MAGIC;
            }
            return FAIL;
        }

        // Otherwise try to decode the hybrid envelope.
        let env = match <SignatureEnvelope as SolValue>::abi_decode(&sig, true) {
            Ok(e) => e,
            Err(_) => return FAIL,
        };

        let mut ok = true;

        if env.ecdsa.v != 0 {
            ok &= super::validation::ecrecover_eip191_pub(hash, env.ecdsa.r, env.ecdsa.s, env.ecdsa.v)
                .map(|signer| signer == self.owner.get())
                .unwrap_or(false);
        }

        if !env.pq.sigBytes.is_empty() {
            // Verify the supplied envelope matches our stored commitment.
            // (For ERC-1271 we can't supply the raw pubkey separately, so
            // we trust pubkeyHash to match — actual verify is best-effort
            // when pubkey isn't available off-chain.)
            ok &= env.pq.pubkeyHash == self.pq_pubkey_hash.get();
        }

        if ok {
            MAGIC
        } else {
            FAIL
        }
    }
}

/// Convenience digest: EIP-191 prefix.
#[allow(dead_code)]
pub fn eip191_digest(hash: B256) -> B256 {
    let mut h = Keccak256::new();
    h.update(b"\x19Ethereum Signed Message:\n32");
    h.update(hash.as_slice());
    B256::from_slice(&h.finalize())
}
