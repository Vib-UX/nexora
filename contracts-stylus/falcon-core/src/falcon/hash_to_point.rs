//! Hash-to-Point: `(salt || msg) -> Polynomial in Z_q[x]/(x^N+1)`.
//!
//! Matches the algorithm used by `falcon-rust` (and PQClean's reference):
//!
//! ```text
//! K = floor(2^16 / q)            // = 5 for q=12289
//! shake = SHAKE256(salt || msg)
//! coeffs = []
//! while len(coeffs) < N:
//!     two-byte t = (shake[i] << 8) | shake[i+1]
//!     if t < K * q:
//!         push(t mod q)
//! ```

use super::params::{N, Q};
use super::shake::Shake256;
use alloc::vec::Vec;

const K: u32 = (1u32 << 16) / Q; // 5

pub fn hash_to_point(salt: &[u8], msg_hash: &[u8]) -> Vec<u32> {
    let mut shake = Shake256::init();
    shake.update(salt);
    shake.update(msg_hash);

    let bound = K * Q; // 61_445
    let mut c = alloc::vec![0u32; N];
    let mut filled = 0usize;
    while filled < N {
        let mut buf = [0u8; 2];
        shake.squeeze(&mut buf);
        let t = ((buf[0] as u32) << 8) | (buf[1] as u32);
        if t < bound {
            c[filled] = t % Q;
            filled += 1;
        }
    }
    c
}
