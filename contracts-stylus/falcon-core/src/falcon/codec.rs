//! Falcon-512 public key + signature codecs (verify-only).
//!
//! Public key encoding: header byte (0x09) followed by 512 coefficients
//! packed at 14 bits each (little-endian within each 14-bit group).
//! Total: 1 + (512 * 14) / 8 = 897 bytes.
//!
//! Signature encoding ("compressed" form): header byte (0x39), 40-byte salt,
//! then a Huffman-like compressed representation of the 512 short signed
//! coefficients of `s2`. The encoder packs each coefficient as: 1 sign bit,
//! 7 low bits, and a unary-encoded high part terminated by a `1` bit.

use super::params::{LOG_N, N, PK_HEADER, PUBKEY_BYTES, Q, SALT_BYTES, SIG_BYTES};
use alloc::vec::Vec;

/// Decode a 897-byte Falcon-512 public key into 512 coefficients in `[0, q)`.
///
/// Each coefficient is stored as 14 bits MSB-first (matching `falcon-rust`'s
/// and PQClean's encoders).
pub fn decode_pubkey(pk: &[u8]) -> Option<Vec<u32>> {
    if pk.len() != PUBKEY_BYTES {
        return None;
    }
    if pk[0] != PK_HEADER {
        return None;
    }
    let body = &pk[1..];
    let mut reader = BitReader::new(body);
    let mut h = alloc::vec![0u32; N];
    for slot in h.iter_mut() {
        let mut v: u32 = 0;
        for _ in 0..14 {
            v = (v << 1) | reader.next_bit()? as u32;
        }
        if v >= Q {
            return None;
        }
        *slot = v;
    }
    if !reader.tail_is_zero() {
        return None;
    }
    Some(h)
}

/// Decode the compressed `s2` part of a Falcon-512 signature.
///
/// Bit layout per coefficient (MSB-first within each byte, matching the
/// `bit-vec` packing used by `falcon-rust`'s and PQClean's encoders):
///
/// - 1 bit: sign (1 = negative)
/// - 7 bits: low magnitude (MSB first)
/// - unary high part terminated by a `1` bit
///
/// Returns the 512 signed coefficients of `s2`.
pub fn decode_compressed_s2(sig_body: &[u8]) -> Option<Vec<i32>> {
    let mut reader = BitReader::new(sig_body);
    let mut s2 = alloc::vec![0i32; N];
    for slot in s2.iter_mut() {
        let sign = reader.next_bit()?;
        let mut low: u32 = 0;
        for _ in 0..7 {
            low = (low << 1) | reader.next_bit()? as u32;
        }
        let mut high: u32 = 0;
        loop {
            let b = reader.next_bit()?;
            if b == 1 {
                break;
            }
            high += 1;
            if high > 2047 {
                return None;
            }
        }
        let mag = ((high << 7) | low) as i32;
        if sign == 1 && mag == 0 {
            return None;
        }
        *slot = if sign == 1 { -mag } else { mag };
    }
    // Trailing bits must be zero (PQClean spec).
    if !reader.tail_is_zero() {
        return None;
    }
    Some(s2)
}

struct BitReader<'a> {
    bytes: &'a [u8],
    bit_pos: usize,
}

impl<'a> BitReader<'a> {
    fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, bit_pos: 0 }
    }

    fn next_bit(&mut self) -> Option<u8> {
        let byte_idx = self.bit_pos >> 3;
        if byte_idx >= self.bytes.len() {
            return None;
        }
        let bit_in_byte = 7 - (self.bit_pos & 7); // MSB-first
        let b = (self.bytes[byte_idx] >> bit_in_byte) & 1;
        self.bit_pos += 1;
        Some(b)
    }

    fn tail_is_zero(&self) -> bool {
        let total = self.bytes.len() * 8;
        let mut p = self.bit_pos;
        while p < total {
            let byte_idx = p >> 3;
            let bit_in_byte = 7 - (p & 7);
            let b = (self.bytes[byte_idx] >> bit_in_byte) & 1;
            if b != 0 {
                return false;
            }
            p += 1;
        }
        true
    }
}

/// Split a Falcon-512 signature into `(salt, compressed_s2_body)`.
///
/// Accepts both the PQClean header byte (`0x30 | log_n` = `0x39` for n=512)
/// and the `falcon-rust` / FIPS-206 standard-compressed header byte
/// (`(2 << 5) | (1 << 4) | log_n` = `0x59` for n=512). The body layout is
/// identical in both: 40-byte salt, then bit-packed compressed `s2`.
pub fn split_signature(sig: &[u8]) -> Option<(&[u8], &[u8])> {
    if sig.len() != SIG_BYTES {
        return None;
    }
    if !is_valid_sig_header(sig[0]) {
        return None;
    }
    let salt = &sig[1..1 + SALT_BYTES];
    let body = &sig[1 + SALT_BYTES..];
    Some((salt, body))
}

#[inline]
fn is_valid_sig_header(h: u8) -> bool {
    // Low 4 bits must be log_n.
    if (h & 0x0F) != LOG_N as u8 {
        return false;
    }
    // PQClean (legacy) form: high nibble = 0x3.
    if (h >> 4) == 0x3 {
        return true;
    }
    // falcon-rust / FIPS 206 standard-compressed form:
    //   bit7 = 0, bits 6-5 = felt_encoding (=2 for "compressed"), bit4 = 1.
    if (h >> 7) == 0 && ((h >> 5) & 0x3) == 0x2 && ((h >> 4) & 0x1) == 0x1 {
        return true;
    }
    false
}
