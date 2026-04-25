//! EIP-712-style operation hashing for Nexora UserOps.
//!
//! ```text
//! domainSeparator = keccak256(abi.encode(
//!     EIP712_DOMAIN_TYPEHASH,
//!     keccak256("Nexora"),
//!     keccak256("1"),
//!     chainId,
//!     verifyingContract  // the wallet address
//! ))
//!
//! structHash = keccak256(abi.encode(
//!     USEROP_TYPEHASH,
//!     sender, nonce, target, value,
//!     keccak256(callData),
//!     callGasLimit, validUntil,
//!     policyTag, verifierScheme
//! ))
//!
//! opHash = keccak256(0x1901 || domainSeparator || structHash)
//! ```

use alloy_primitives::{keccak256, Address, B256, U256};
use alloy_sol_types::SolValue;
use sha3::{Digest, Keccak256};

use crate::types::UserOp;

/// `keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")`
pub const EIP712_DOMAIN_TYPEHASH: B256 = B256::new(hex_to_bytes(
    "0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f",
));

/// `keccak256("UserOp(address sender,uint256 nonce,address target,uint256 value,bytes callData,uint256 callGasLimit,uint256 validUntil,uint8 policyTag,uint16 verifierScheme)")`
///
/// NOTE: this constant is the literal keccak of the type-string above; if you
/// change the schema in `types.rs::UserOp`, regenerate it via:
///
///     cast keccak "UserOp(address sender,uint256 nonce,...,uint16 verifierScheme)"
pub const USEROP_TYPEHASH: B256 = B256::new(hex_to_bytes(
    "0xfcac9e606c63dcf7e88273f58fbb4aa18ae18ffa47be58eb69c1fccd93627a0d",
));

/// const-time hex-to-[u8;32] for typehash literals above.
const fn hex_to_bytes(s: &str) -> [u8; 32] {
    let bytes = s.as_bytes();
    // skip leading "0x"
    let start = if bytes.len() >= 2 && bytes[0] == b'0' && bytes[1] == b'x' {
        2
    } else {
        0
    };
    let mut out = [0u8; 32];
    let mut i = 0;
    while i < 32 {
        let hi = hex_nibble(bytes[start + 2 * i]);
        let lo = hex_nibble(bytes[start + 2 * i + 1]);
        out[i] = (hi << 4) | lo;
        i += 1;
    }
    out
}

const fn hex_nibble(c: u8) -> u8 {
    match c {
        b'0'..=b'9' => c - b'0',
        b'a'..=b'f' => 10 + c - b'a',
        b'A'..=b'F' => 10 + c - b'A',
        _ => 0,
    }
}

/// Compute the EIP-712 domain separator for a Nexora wallet.
pub fn domain_separator(chain_id: U256, verifying_contract: Address) -> B256 {
    let name_hash = keccak256(crate::types::NEXORA_DOMAIN_NAME.as_bytes());
    let ver_hash = keccak256(crate::types::NEXORA_DOMAIN_VERSION.as_bytes());

    let encoded = (
        EIP712_DOMAIN_TYPEHASH,
        name_hash,
        ver_hash,
        chain_id,
        verifying_contract,
    )
        .abi_encode();
    keccak256(&encoded)
}

/// Hash the UserOp struct (typeHash + fields, NOT including signatures).
pub fn struct_hash(op: &UserOp) -> B256 {
    let calldata_hash = keccak256(op.callData.as_ref());
    let mut hasher = Keccak256::new();
    hasher.update(USEROP_TYPEHASH.as_slice());
    hasher.update(B256::left_padding_from(op.sender.as_slice()).as_slice());
    hasher.update(op.nonce.to_be_bytes::<32>());
    hasher.update(B256::left_padding_from(op.target.as_slice()).as_slice());
    hasher.update(op.value.to_be_bytes::<32>());
    hasher.update(calldata_hash.as_slice());
    hasher.update(op.callGasLimit.to_be_bytes::<32>());
    hasher.update(op.validUntil.to_be_bytes::<32>());
    let mut tag = [0u8; 32];
    tag[31] = op.policyTag;
    hasher.update(tag);
    let mut scheme = [0u8; 32];
    scheme[30..32].copy_from_slice(&op.verifierScheme.to_be_bytes());
    hasher.update(scheme);
    B256::from_slice(&hasher.finalize())
}

/// Compute the final EIP-712 op hash. This is what signers sign.
pub fn compute_op_hash(op: &UserOp, chain_id: U256, account: Address) -> B256 {
    let ds = domain_separator(chain_id, account);
    let sh = struct_hash(op);
    let mut hasher = Keccak256::new();
    hasher.update([0x19, 0x01]);
    hasher.update(ds.as_slice());
    hasher.update(sh.as_slice());
    B256::from_slice(&hasher.finalize())
}
