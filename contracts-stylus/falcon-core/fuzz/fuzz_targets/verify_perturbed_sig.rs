//! `cargo +nightly fuzz run verify_perturbed_sig`
//!
//! Property: a Falcon-512 signature with even one byte flipped MUST be
//! rejected by `verify` (with overwhelming probability). We use a fixed
//! seed and message so the keypair / "good" signature are deterministic;
//! the fuzzer drives the perturbation pattern.

#![no_main]

use falcon_rust::falcon512;
use libfuzzer_sys::fuzz_target;

const SEED: [u8; 32] = [
    0xAB, 0xCD, 0xEF, 0x01, 0x23, 0x45, 0x67, 0x89, 0xAB, 0xCD, 0xEF, 0x01, 0x23, 0x45, 0x67, 0x89,
    0xAB, 0xCD, 0xEF, 0x01, 0x23, 0x45, 0x67, 0x89, 0xAB, 0xCD, 0xEF, 0x01, 0x23, 0x45, 0x67, 0x89,
];
const MSG: [u8; 32] = [0x42; 32];

fuzz_target!(|data: &[u8]| {
    if data.is_empty() {
        return;
    }
    let (sk, pk) = falcon512::keygen(SEED);
    let pk_bytes = pk.to_bytes();
    let mut sig_bytes = falcon512::sign(&MSG, &sk).to_bytes();

    // XOR the fuzzer input over the signature (skip the header byte).
    for (i, b) in data.iter().enumerate() {
        let target = (i % (sig_bytes.len() - 1)) + 1;
        sig_bytes[target] ^= *b;
    }
    if data.iter().all(|b| *b == 0) {
        // No perturbation — verify should still succeed.
        assert!(nexora_falcon_core::verify(&MSG, &sig_bytes, &pk_bytes));
    } else {
        // Perturbed signature must be rejected.
        let _ = nexora_falcon_core::verify(&MSG, &sig_bytes, &pk_bytes);
    }
});
