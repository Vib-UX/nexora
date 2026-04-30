//! Browser-side Falcon-512 signer for the Nexora dashboard.
//!
//! Build with:
//!   wasm-pack build --release --target web --out-dir ../../wallet-sdk/wasm
//!
//! Exposes:
//!   - `keygen(seed_hex) -> { publicKey, secretKey }` (deterministic from seed)
//!   - `sign(secret_key_hex, hash_hex) -> sig_hex`
//!
//! The dashboard only enables this path when
//! `NEXT_PUBLIC_FALCON512_BROWSER=1`. Default UX uses the local
//! `falcon-signer` daemon over HTTP (see `signer/falcon-signer`).

use falcon_rust::falcon512;
use sha3::{Digest, Keccak256};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Falcon512Result {
    public_key: String,
    secret_key: String,
    commitment: String,
}

#[wasm_bindgen]
impl Falcon512Result {
    #[wasm_bindgen(getter, js_name = publicKey)]
    pub fn public_key(&self) -> String { self.public_key.clone() }
    #[wasm_bindgen(getter, js_name = secretKey)]
    pub fn secret_key(&self) -> String { self.secret_key.clone() }
    #[wasm_bindgen(getter)]
    pub fn commitment(&self) -> String { self.commitment.clone() }
}

fn hex_with_prefix(b: &[u8]) -> String {
    let mut s = String::with_capacity(2 + b.len() * 2);
    s.push_str("0x");
    s.push_str(&hex::encode(b));
    s
}

fn parse_hex(s: &str) -> Result<Vec<u8>, JsValue> {
    let s = s.strip_prefix("0x").unwrap_or(s);
    hex::decode(s).map_err(|e| JsValue::from_str(&format!("bad hex: {e}")))
}

fn keccak(data: &[u8]) -> [u8; 32] {
    let mut h = Keccak256::new();
    h.update(data);
    let out = h.finalize();
    let mut r = [0u8; 32];
    r.copy_from_slice(&out);
    r
}

/// Deterministic keygen from a 32-byte seed.
#[wasm_bindgen]
pub fn keygen(seed_hex: &str) -> Result<Falcon512Result, JsValue> {
    let s = parse_hex(seed_hex)?;
    if s.len() != 32 {
        return Err(JsValue::from_str("seed must be 32 bytes"));
    }
    let mut seed = [0u8; 32];
    seed.copy_from_slice(&s);
    let (sk, pk) = falcon512::keygen(seed);
    let pk_bytes = pk.to_bytes();
    let sk_bytes = sk.to_bytes();
    let commitment = keccak(&pk_bytes);
    Ok(Falcon512Result {
        public_key: hex_with_prefix(&pk_bytes),
        secret_key: hex_with_prefix(&sk_bytes),
        commitment: hex_with_prefix(&commitment),
    })
}

/// Sign a 32-byte hex hash with a Falcon-512 secret key. Returns the 666-byte
/// hex signature.
#[wasm_bindgen]
pub fn sign(secret_key_hex: &str, hash_hex: &str) -> Result<String, JsValue> {
    let sk_bytes = parse_hex(secret_key_hex)?;
    let msg = parse_hex(hash_hex)?;
    if msg.len() != 32 {
        return Err(JsValue::from_str("hash must be 32 bytes"));
    }
    let sk = falcon512::SecretKey::from_bytes(&sk_bytes)
        .map_err(|e| JsValue::from_str(&format!("invalid secret: {e:?}")))?;
    let sig = falcon512::sign(&msg, &sk);
    Ok(hex_with_prefix(&sig.to_bytes()))
}
