//! Hybrid signature validation for `NexoraAccount`.
//!
//! Flow inside `validateUserOp`:
//!
//! 1. Ask the `PolicyEngine` for the op's tag (LOW / HIGH / CRITICAL).
//! 2. Decode the signature envelope `(EcdsaSig, PqSig)` from `op.signatures`.
//! 3. Enforce the tag → required validators rule:
//!    - LOW       : ECDSA only
//!    - HIGH      : ECDSA + PQ
//!    - CRITICAL  : PQ only (owner rotation / pq rotation; goes through
//!                  the dedicated timelocked entrypoints, not generic exec)
//! 4. ECDSA: `ecrecover(opHash, sig)` must equal `self.owner`.
//! 5. PQ: resolve verifier via `VerifierRegistry`, then call
//!    `verify(opHash, sig, pubkey)`.

use alloy_primitives::{Address, B256, U256};
use alloy_sol_types::{sol, SolCall, SolType};
use sha3::{Digest, Keccak256};
use stylus_sdk::call::RawCall;

use crate::storage::Account;
use nexora_shared::{EcdsaSig, PolicyTag, PqSig};

sol! {
    interface IPolicyEngine {
        function classify(
            address account,
            address target,
            uint256 value,
            bytes calldata data
        ) external view returns (uint8);
    }

    interface IVerifierRegistry {
        function verifier(uint16 scheme) external view returns (address);
    }

    interface IPQVerifier {
        function verify(bytes32 msgHash, bytes calldata sig, bytes calldata pubkey)
            external view returns (bool);
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum ValidationOutcome {
    Ok,
    InvalidEcdsa,
    InvalidPq,
    PolicyDenied,
    PqRequired,
    EcdsaRequired,
    SchemeMismatch,
    PubkeyMismatch,
    NonceUsed,
    Expired,
}

impl ValidationOutcome {
    pub fn is_ok(&self) -> bool {
        matches!(self, ValidationOutcome::Ok)
    }
}

impl Account {
    /// Validate a UserOp against the policy + signature rules.
    /// Does NOT mutate (no nonce burn here) — execution path consumes nonce.
    pub fn validate_op(
        &self,
        op_hash: B256,
        target: Address,
        value: U256,
        call_data: &[u8],
        signatures: &[u8],
        valid_until: U256,
        scheme: u16,
        provided_pubkey: &[u8],
    ) -> ValidationOutcome {
        // 1. Time bound.
        let now = U256::from(stylus_sdk::block::timestamp());
        if !valid_until.is_zero() && now > valid_until {
            return ValidationOutcome::Expired;
        }

        // 2. Classify via PolicyEngine.
        let tag = match self.classify_via_policy(target, value, call_data) {
            Some(t) => t,
            None => return ValidationOutcome::PolicyDenied,
        };

        // 3. Decode signature envelope. The TS SDK encodes via
        //    `encodeAbiParameters([ecdsaType, pqType], [ecdsa, pq])` —
        //    i.e. as a *params tuple* with no offset prefix. We therefore
        //    decode with `abi_decode_params` rather than `abi_decode`,
        //    which would expect the wrapped (struct) form.
        let env = match <(EcdsaSig, PqSig) as SolType>::abi_decode_params(signatures, true) {
            Ok(e) => e,
            Err(_) => return ValidationOutcome::InvalidEcdsa,
        };
        let env = nexora_shared::SignatureEnvelope { ecdsa: env.0, pq: env.1 };

        // 4. Apply tag rules.
        let need_ecdsa = tag.requires_ecdsa();
        let need_pq = tag.requires_pq();

        if need_ecdsa {
            if env.ecdsa.v == 0 {
                return ValidationOutcome::EcdsaRequired;
            }
            if !self.check_ecdsa(op_hash, &env.ecdsa) {
                return ValidationOutcome::InvalidEcdsa;
            }
        }

        if need_pq {
            if env.pq.sigBytes.is_empty() {
                return ValidationOutcome::PqRequired;
            }
            if env.pq.scheme != scheme {
                return ValidationOutcome::SchemeMismatch;
            }
            if env.pq.pubkeyHash != self.pq_pubkey_hash.get() {
                return ValidationOutcome::PubkeyMismatch;
            }
            if !self.check_pq(op_hash, env.pq.scheme, &env.pq.sigBytes, provided_pubkey) {
                return ValidationOutcome::InvalidPq;
            }
        }

        ValidationOutcome::Ok
    }

    fn classify_via_policy(
        &self,
        target: Address,
        value: U256,
        call_data: &[u8],
    ) -> Option<PolicyTag> {
        let policy = self.policy_engine.get();
        let calldata = IPolicyEngine::classifyCall {
            account: stylus_sdk::contract::address(),
            target,
            value,
            data: call_data.to_vec().into(),
        }
        .abi_encode();
        let raw = unsafe { RawCall::new_static().call(policy, &calldata) }.ok()?;
        let tag = *raw.last()?;
        PolicyTag::from_u8(tag)
    }

    fn check_ecdsa(&self, op_hash: B256, sig: &nexora_shared::types::EcdsaSig) -> bool {
        let signer = match ecrecover_eip191(op_hash, sig.r, sig.s, sig.v) {
            Some(a) => a,
            None => return false,
        };
        signer == self.owner.get()
    }

    fn check_pq(
        &self,
        op_hash: B256,
        scheme: u16,
        sig_bytes: &[u8],
        pubkey: &[u8],
    ) -> bool {
        // Re-derive commitment and ensure it matches stored hash.
        let mut h = Keccak256::new();
        h.update(pubkey);
        let derived = B256::from_slice(&h.finalize());
        if derived != self.pq_pubkey_hash.get() {
            return false;
        }

        // Resolve verifier via registry.
        let registry = self.verifier_registry.get();
        let q = IVerifierRegistry::verifierCall { scheme }.abi_encode();
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

        // Call verifier.verify(msgHash, sig, pubkey).
        let q = IPQVerifier::verifyCall {
            msgHash: op_hash,
            sig: sig_bytes.to_vec().into(),
            pubkey: pubkey.to_vec().into(),
        }
        .abi_encode();
        let raw = match unsafe { RawCall::new_static().call(verifier, &q) } {
            Ok(b) => b,
            Err(_) => return false,
        };
        // bool return — 32 bytes, last byte is 0/1
        raw.last().map(|b| *b == 1).unwrap_or(false)
    }
}

/// EIP-191 prefix + ecrecover. Public so the ERC-1271 module can reuse it.
pub fn ecrecover_eip191_pub(msg_hash: B256, r: B256, s: B256, v: u8) -> Option<Address> {
    ecrecover_eip191(msg_hash, r, s, v)
}

/// EIP-191 prefix + ecrecover.
fn ecrecover_eip191(msg_hash: B256, r: B256, s: B256, v: u8) -> Option<Address> {
    let mut prefixed = Keccak256::new();
    prefixed.update(b"\x19Ethereum Signed Message:\n32");
    prefixed.update(msg_hash.as_slice());
    let digest = B256::from_slice(&prefixed.finalize());

    let mut sig = [0u8; 65];
    sig[..32].copy_from_slice(r.as_slice());
    sig[32..64].copy_from_slice(s.as_slice());
    sig[64] = v;

    // Stylus exposes `precompiles::ecrecover` via a CALL to 0x01.
    // We construct the call manually for clarity.
    let mut input = [0u8; 128];
    input[..32].copy_from_slice(digest.as_slice());
    input[63] = v;
    input[64..96].copy_from_slice(r.as_slice());
    input[96..128].copy_from_slice(s.as_slice());

    let raw = unsafe {
        RawCall::new_static()
            .call(Address::from([0u8; 20]).with_last_byte(0x01), &input)
    }
    .ok()?;
    if raw.len() != 32 {
        return None;
    }
    let mut addr = [0u8; 20];
    addr.copy_from_slice(&raw[12..32]);
    let recovered = Address::from(addr);
    if recovered == Address::ZERO {
        return None;
    }
    Some(recovered)
}

trait AddressExt {
    fn with_last_byte(self, byte: u8) -> Address;
}
impl AddressExt for Address {
    fn with_last_byte(self, byte: u8) -> Address {
        let mut bytes = self.0 .0;
        bytes[19] = byte;
        Address::from(bytes)
    }
}
