//! Nexora Falcon-512 host-side signer.
//!
//! - `falcon-signer keygen --out keys.json`
//! - `falcon-signer sign --sk keys.json --hash 0x...`        (stdout: 666-byte hex sig)
//! - `falcon-signer pubkey --sk keys.json`                   (stdout: 897-byte hex pk)
//! - `falcon-signer serve --sk keys.json --bind 127.0.0.1:9090`
//!     POST /sign  { "hash": "0x..." }   -> { "sig": "0x...", "pubkey": "0x..." }
//!     GET  /pubkey                      -> { "pubkey": "0x...", "commitment": "0x..." }
//!     GET  /health                      -> { "ok": true }
//!
//! Note: the Falcon keypair is stored *unencrypted* in the keys.json file.
//! This is fine for local dev; for any production use, encrypt with a passphrase.

use clap::{Parser, Subcommand};
use falcon_rust::falcon512;
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha3::{Digest, Keccak256};
use std::fs;
use std::io::Read;
use std::net::SocketAddr;
use std::sync::Arc;

#[derive(Parser)]
#[command(version, about = "Nexora Falcon-512 signer")]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Generate a fresh Falcon-512 keypair.
    Keygen {
        #[arg(long, default_value = "keys.json")]
        out: String,
    },
    /// Sign a 32-byte hex hash.
    Sign {
        #[arg(long)]
        sk: String,
        #[arg(long)]
        hash: String,
    },
    /// Print the public key + keccak256 commitment.
    Pubkey {
        #[arg(long)]
        sk: String,
    },
    /// Run the HTTP signer.
    Serve {
        #[arg(long)]
        sk: String,
        #[arg(long, default_value = "127.0.0.1:9090")]
        bind: String,
    },
}

#[derive(Serialize, Deserialize)]
struct StoredKeys {
    /// 897 bytes, hex-encoded with `0x` prefix.
    public_key: String,
    /// Falcon-512 secret key, hex-encoded with `0x` prefix.
    secret_key: String,
}

fn parse_hex(s: &str) -> anyhow::Result<Vec<u8>> {
    let s = s.strip_prefix("0x").unwrap_or(s);
    Ok(hex::decode(s)?)
}

fn hex_with_prefix(b: &[u8]) -> String {
    let mut s = String::with_capacity(2 + b.len() * 2);
    s.push_str("0x");
    s.push_str(&hex::encode(b));
    s
}

fn keccak(data: &[u8]) -> [u8; 32] {
    let mut h = Keccak256::new();
    h.update(data);
    let out = h.finalize();
    let mut r = [0u8; 32];
    r.copy_from_slice(&out);
    r
}

fn load_keys(
    path: &str,
) -> anyhow::Result<(falcon512::PublicKey, falcon512::SecretKey, Vec<u8>)> {
    let raw = fs::read_to_string(path)?;
    let stored: StoredKeys = serde_json::from_str(&raw)?;
    let pk_bytes = parse_hex(&stored.public_key)?;
    let sk_bytes = parse_hex(&stored.secret_key)?;
    let pk = falcon512::PublicKey::from_bytes(&pk_bytes)
        .map_err(|e| anyhow::anyhow!("invalid pubkey: {e:?}"))?;
    let sk = falcon512::SecretKey::from_bytes(&sk_bytes)
        .map_err(|e| anyhow::anyhow!("invalid secret key: {e:?}"))?;
    Ok((pk, sk, pk_bytes))
}

fn cmd_keygen(out: &str) -> anyhow::Result<()> {
    let mut seed = [0u8; 32];
    OsRng.fill_bytes(&mut seed);
    let (sk, pk) = falcon512::keygen(seed);
    let pk_bytes = pk.to_bytes();
    let sk_bytes = sk.to_bytes();
    let stored = StoredKeys {
        public_key: hex_with_prefix(&pk_bytes),
        secret_key: hex_with_prefix(&sk_bytes),
    };
    fs::write(out, serde_json::to_string_pretty(&stored)?)?;
    let commitment = keccak(&pk_bytes);
    eprintln!("[falcon-signer] wrote {out}");
    eprintln!("  pubkey      = {} ({} bytes)", &stored.public_key[..18], pk_bytes.len());
    eprintln!("  commitment  = {}", hex_with_prefix(&commitment));
    Ok(())
}

fn cmd_sign(sk_path: &str, hash_hex: &str) -> anyhow::Result<()> {
    let (_pk, sk, _pk_bytes) = load_keys(sk_path)?;
    let msg = parse_hex(hash_hex)?;
    if msg.len() != 32 {
        return Err(anyhow::anyhow!("expected 32-byte hash, got {} bytes", msg.len()));
    }
    let sig = falcon512::sign(&msg, &sk);
    let sig_bytes = sig.to_bytes();
    println!("{}", hex_with_prefix(&sig_bytes));
    Ok(())
}

fn cmd_pubkey(sk_path: &str) -> anyhow::Result<()> {
    let (_pk, _sk, pk_bytes) = load_keys(sk_path)?;
    let commitment = keccak(&pk_bytes);
    let out = serde_json::json!({
        "pubkey": hex_with_prefix(&pk_bytes),
        "commitment": hex_with_prefix(&commitment),
        "scheme": 2,
    });
    println!("{}", serde_json::to_string_pretty(&out)?);
    Ok(())
}

#[derive(Deserialize)]
struct SignReq {
    hash: String,
}

#[derive(Serialize)]
struct SignResp {
    sig: String,
    pubkey: String,
    commitment: String,
}

fn cmd_serve(sk_path: &str, bind: &str) -> anyhow::Result<()> {
    let (_pk, sk, pk_bytes) = load_keys(sk_path)?;
    let pk_hex = hex_with_prefix(&pk_bytes);
    let commitment_hex = hex_with_prefix(&keccak(&pk_bytes));
    let sk = Arc::new(sk);

    let addr: SocketAddr = bind.parse()?;
    let server = tiny_http::Server::http(addr)
        .map_err(|e| anyhow::anyhow!("bind failed: {e}"))?;
    eprintln!("[falcon-signer] serving on http://{addr}");
    eprintln!("  pubkey commitment = {commitment_hex}");

    for mut req in server.incoming_requests() {
        let url = req.url().to_string();
        let method = req.method().clone();
        let resp = match (method.as_str(), url.as_str()) {
            ("GET", "/health") => Some(serde_json::json!({ "ok": true })),
            ("GET", "/pubkey") => Some(serde_json::json!({
                "pubkey": pk_hex,
                "commitment": commitment_hex,
                "scheme": 2,
            })),
            ("POST", "/sign") => {
                let mut body = String::new();
                if req.as_reader().read_to_string(&mut body).is_err() {
                    None
                } else {
                    match serde_json::from_str::<SignReq>(&body) {
                        Ok(r) => match parse_hex(&r.hash) {
                            Ok(bytes) if bytes.len() == 32 => {
                                let sig = falcon512::sign(&bytes, &sk);
                                Some(serde_json::to_value(SignResp {
                                    sig: hex_with_prefix(&sig.to_bytes()),
                                    pubkey: pk_hex.clone(),
                                    commitment: commitment_hex.clone(),
                                })?)
                            }
                            Ok(_) => Some(serde_json::json!({ "error": "hash must be 32 bytes" })),
                            Err(e) => Some(serde_json::json!({ "error": format!("bad hex: {e}") })),
                        },
                        Err(e) => Some(serde_json::json!({ "error": format!("bad json: {e}") })),
                    }
                }
            }
            _ => Some(serde_json::json!({ "error": "not found" })),
        };

        let body = serde_json::to_string(&resp.unwrap_or(serde_json::json!({}))).unwrap();
        let header = tiny_http::Header::from_bytes(
            "content-type".as_bytes(),
            "application/json".as_bytes(),
        )
        .unwrap();
        let response = tiny_http::Response::from_string(body).with_header(header);
        let _ = req.respond(response);
    }
    Ok(())
}

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    match cli.cmd {
        Cmd::Keygen { out } => cmd_keygen(&out),
        Cmd::Sign { sk, hash } => cmd_sign(&sk, &hash),
        Cmd::Pubkey { sk } => cmd_pubkey(&sk),
        Cmd::Serve { sk, bind } => cmd_serve(&sk, &bind),
    }
}
