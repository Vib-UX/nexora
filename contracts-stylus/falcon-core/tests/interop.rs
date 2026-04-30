//! End-to-end interop test: produce a Falcon-512 signature with `falcon-rust`
//! and feed it through our pure-Stylus verifier to make sure the on-chain
//! algorithm accepts real Falcon outputs.

use falcon_rust::falcon512;
use nexora_falcon_core as falcon_core;
use nexora_falcon_core::falcon;
use rand::{rngs::OsRng, RngCore};

fn fresh_msg_hash() -> [u8; 32] {
    let mut msg = [0u8; 32];
    OsRng.fill_bytes(&mut msg);
    msg
}

#[test]
fn signs_and_verifies_via_stylus_port() {
    let mut seed = [0u8; 32];
    OsRng.fill_bytes(&mut seed);
    let (sk, pk) = falcon512::keygen(seed);
    let pk_bytes = pk.to_bytes();

    let msg_hash = fresh_msg_hash();
    let sig = falcon512::sign(&msg_hash, &sk);
    let sig_bytes = sig.to_bytes();

    assert_eq!(pk_bytes.len(), falcon::params::PUBKEY_BYTES);
    assert_eq!(sig_bytes.len(), falcon::params::SIG_BYTES);
    let _ = &sig;

    // Sanity: falcon-rust accepts its own signatures.
    assert!(falcon512::verify(&msg_hash, &sig, &pk));

    // Real test: our pure-Stylus port accepts the same signature.
    let ok = falcon_core::verify(&msg_hash, &sig_bytes, &pk_bytes);
    assert!(ok, "Stylus Falcon verify rejected a valid falcon-rust signature");
}

#[test]
fn rejects_tampered_signature() {
    let mut seed = [0u8; 32];
    OsRng.fill_bytes(&mut seed);
    let (sk, pk) = falcon512::keygen(seed);
    let pk_bytes = pk.to_bytes();

    let msg_hash = fresh_msg_hash();
    let sig = falcon512::sign(&msg_hash, &sk);
    let mut sig_bytes = sig.to_bytes();

    // Flip a payload byte (avoid the header).
    sig_bytes[100] ^= 0x80;
    let ok = falcon_core::verify(&msg_hash, &sig_bytes, &pk_bytes);
    assert!(!ok, "verify accepted a tampered signature");
}

#[test]
fn rejects_wrong_message() {
    let mut seed = [0u8; 32];
    OsRng.fill_bytes(&mut seed);
    let (sk, pk) = falcon512::keygen(seed);
    let pk_bytes = pk.to_bytes();

    let msg_hash = fresh_msg_hash();
    let other_hash = fresh_msg_hash();
    let sig = falcon512::sign(&msg_hash, &sk);
    let sig_bytes = sig.to_bytes();

    let ok = falcon_core::verify(&other_hash, &sig_bytes, &pk_bytes);
    assert!(!ok, "verify accepted a signature over a different message");
}
