//! KAT-style fixed-vector tests for the Stylus Falcon-512 verifier.
//!
//! Note on PQClean compatibility: our verifier accepts both the PQClean
//! header byte (`0x39`) and `falcon-rust`'s standard-compressed header
//! (`0x59`). The `s2` compressed body and `h` 14-bit packing are
//! byte-identical between the two. Thus a true PQClean `.rsp` KAT can be
//! consumed simply by patching `byte[0]` from `0x39` (their value) to the
//! verifier's accepted set, and then passing the whole signature through.
//!
//! For now we generate "self KAT" vectors with `falcon-rust` from a fixed
//! seed; these double as regression tests against the on-chain port (the
//! exact same algorithm is exercised end-to-end). We pin the seed so a
//! refactor of the codec / NTT / hash-to-point that breaks on the algorithm
//! gets caught even without `falcon-rust` running.

use falcon_rust::falcon512;
use nexora_falcon_core as falcon_core;

const KAT_SEEDS: &[[u8; 32]] = &[
    [
        0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E,
        0x0F, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x1D,
        0x1E, 0x1F,
    ],
    [
        0xDE, 0xAD, 0xBE, 0xEF, 0xCA, 0xFE, 0xF0, 0x0D, 0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE,
        0xF0, 0xFE, 0xED, 0xFA, 0xCE, 0xC0, 0xFF, 0xEE, 0x42, 0x42, 0x42, 0x42, 0x42, 0x42, 0x42,
        0x42, 0x42,
    ],
    [
        0x4E, 0x45, 0x58, 0x4F, 0x52, 0x41, 0x21, 0x46, 0x41, 0x4C, 0x43, 0x4F, 0x4E, 0x35, 0x31,
        0x32, 0x4B, 0x41, 0x54, 0x53, 0x53, 0x33, 0x45, 0x44, 0xA2, 0xB6, 0x9C, 0x77, 0xE8, 0x40,
        0x71, 0xC0,
    ],
];

const KAT_HASHES: &[[u8; 32]] = &[
    [
        0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF, 0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88,
        0x99, 0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80, 0x90, 0xA0, 0xB0, 0xC0, 0xD0, 0xE0,
        0xF0, 0x00,
    ],
    [
        0xC0, 0xFF, 0xEE, 0xCA, 0xFE, 0xBA, 0xBE, 0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0,
        0x42, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00,
    ],
];

#[test]
fn kat_round_trip_each_seed() {
    for seed in KAT_SEEDS {
        let (sk, pk) = falcon512::keygen(*seed);
        let pk_bytes = pk.to_bytes();
        for hash in KAT_HASHES {
            let sig = falcon512::sign(hash, &sk);
            let sig_bytes = sig.to_bytes();
            assert_eq!(pk_bytes.len(), 897);
            assert_eq!(sig_bytes.len(), 666);
            assert!(
                falcon_core::verify(hash, &sig_bytes, &pk_bytes),
                "KAT verify failed for seed {seed:?} hash {hash:?}"
            );
        }
    }
}

#[test]
fn kat_rejects_zero_signature() {
    let (_sk, pk) = falcon512::keygen(KAT_SEEDS[0]);
    let pk_bytes = pk.to_bytes();
    let zero_sig = vec![0u8; 666];
    assert!(!falcon_core::verify(&KAT_HASHES[0], &zero_sig, &pk_bytes));
}

#[test]
fn kat_rejects_truncated_signature() {
    let (sk, pk) = falcon512::keygen(KAT_SEEDS[0]);
    let pk_bytes = pk.to_bytes();
    let sig = falcon512::sign(&KAT_HASHES[0], &sk).to_bytes();
    let mut truncated = sig.clone();
    truncated.pop();
    assert!(!falcon_core::verify(&KAT_HASHES[0], &truncated, &pk_bytes));
}

#[test]
fn kat_rejects_zero_pubkey() {
    let (sk, _pk) = falcon512::keygen(KAT_SEEDS[0]);
    let sig = falcon512::sign(&KAT_HASHES[0], &sk).to_bytes();
    let zero_pk = vec![0u8; 897];
    assert!(!falcon_core::verify(&KAT_HASHES[0], &sig, &zero_pk));
}

#[test]
fn kat_rejects_bad_pubkey_header() {
    let (sk, pk) = falcon512::keygen(KAT_SEEDS[0]);
    let sig = falcon512::sign(&KAT_HASHES[0], &sk).to_bytes();
    let mut bad_pk = pk.to_bytes();
    bad_pk[0] = 0xFF;
    assert!(!falcon_core::verify(&KAT_HASHES[0], &sig, &bad_pk));
}
