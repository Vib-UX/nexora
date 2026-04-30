//! End-to-end Falcon-512 verify.
//!
//! Steps (reference: Falcon spec §3.8):
//!   1. Parse signature header + salt + compressed s2.
//!   2. Parse public key (header + 14-bit-packed coefficients of `h`).
//!   3. `c = HashToPoint(salt || msg, q, N)`.
//!   4. Compute `s1 = c - s2 * h (mod q, x^N+1)` via NTT.
//!   5. Recover `s1` in centered form (`[-q/2, q/2)`).
//!   6. Check `||(s1, s2)||^2 <= NORM_BOUND_SQ`.

use super::codec::{decode_compressed_s2, decode_pubkey, split_signature};
use super::hash_to_point::hash_to_point;
use super::ntt::{intt, ntt, ntt_pointwise_mul, signed_repr};
use super::params::{N, NORM_BOUND_SQ};

pub fn verify(msg_hash: &[u8], sig: &[u8], pubkey: &[u8]) -> bool {
    let (salt, s2_body) = match split_signature(sig) {
        Some(v) => v,
        None => return false,
    };

    let mut h = match decode_pubkey(pubkey) {
        Some(v) => v,
        None => return false,
    };

    let s2_signed = match decode_compressed_s2(s2_body) {
        Some(v) => v,
        None => return false,
    };

    // Step 3: hash-to-point.
    let mut c = hash_to_point(salt, msg_hash);

    // Step 4: s1 = c - s2 * h (mod q, x^N+1).
    // Convert s2 to mod-q, run NTTs, multiply, take iNTT, subtract from c.
    let mut s2_q = alloc::vec![0u32; N];
    for i in 0..N {
        // Map signed coefficient to [0, q).
        let v = s2_signed[i];
        s2_q[i] = if v >= 0 {
            (v as u32) % super::params::Q
        } else {
            super::params::Q - ((-v) as u32) % super::params::Q
        };
    }

    ntt(&mut h);
    ntt(&mut s2_q);
    let mut prod = ntt_pointwise_mul(&s2_q, &h);
    intt(&mut prod);

    // c - prod  (mod q)
    for i in 0..N {
        let pi = prod[i];
        c[i] = if c[i] >= pi {
            c[i] - pi
        } else {
            c[i] + super::params::Q - pi
        };
    }

    // Step 5/6: norm check on (centered s1, s2). The Falcon spec uses a
    // strict less-than comparison.
    let mut norm: u64 = 0;
    for i in 0..N {
        let s1_signed = signed_repr(c[i]) as i64;
        let s2_i = s2_signed[i] as i64;
        norm = norm.saturating_add((s1_signed * s1_signed) as u64);
        norm = norm.saturating_add((s2_i * s2_i) as u64);
        if norm >= NORM_BOUND_SQ {
            return false;
        }
    }

    norm < NORM_BOUND_SQ
}
