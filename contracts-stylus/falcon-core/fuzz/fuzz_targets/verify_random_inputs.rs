//! `cargo +nightly fuzz run verify_random_inputs`
//!
//! Property: `verify` MUST NOT panic for arbitrary `(msg_hash, sig, pubkey)`
//! triples. Verify-must-return-false-or-true is the only acceptable outcome
//! when fed garbage.

#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if data.len() < 32 {
        return;
    }
    let (msg_hash, rest) = data.split_at(32);
    let split = rest.len() / 2;
    let (sig, pubkey) = rest.split_at(split.max(1));
    let _ = nexora_falcon_core::verify(msg_hash, sig, pubkey);
});
