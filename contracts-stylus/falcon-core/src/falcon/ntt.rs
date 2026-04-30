//! NTT mod q=12289 over Z_q[x]/(x^N+1), matching the convention used by
//! `falcon-rust` (Algorithm 1 from <https://eprint.iacr.org/2016/504.pdf>):
//! merged-radix-2 cyclotomic FFT with bit-reversed twiddles.
//!
//! `psi` here is a primitive `2N`-th root of unity. For Falcon-512 we use
//! `psi = primitive_root_of_unity(1024) = 1331^4 mod 12289 = 10302`, which
//! matches `falcon-rust::field::Felt::primitive_root_of_unity(1024)`.

use super::params::{N, Q};
use alloc::vec::Vec;

/// Primitive 4096-th root of unity mod q.
const ROOT_4096: u32 = 1331;

#[inline(always)]
fn add_mod_q(a: u32, b: u32) -> u32 {
    let s = a + b;
    if s >= Q { s - Q } else { s }
}

#[inline(always)]
fn sub_mod_q(a: u32, b: u32) -> u32 {
    if a >= b { a - b } else { a + Q - b }
}

#[inline(always)]
fn mul_mod_q(a: u32, b: u32) -> u32 {
    ((a as u64 * b as u64) % Q as u64) as u32
}

fn pow_mod_q(mut base: u32, mut exp: u32) -> u32 {
    let mut r: u32 = 1;
    base %= Q;
    while exp > 0 {
        if exp & 1 == 1 {
            r = mul_mod_q(r, base);
        }
        base = mul_mod_q(base, base);
        exp >>= 1;
    }
    r
}

#[inline(always)]
fn inv_mod_q(a: u32) -> u32 {
    pow_mod_q(a, Q - 2)
}

/// Compute the primitive `n`-th root of unity (n = 2^log2n, log2n ≤ 12).
fn primitive_root_of_unity(log2n: u32) -> u32 {
    let mut a = ROOT_4096;
    for _ in 0..(12 - log2n) {
        a = mul_mod_q(a, a);
    }
    a
}

fn bitrev_index(mut x: usize, bits: u32) -> usize {
    let mut r = 0usize;
    for _ in 0..bits {
        r = (r << 1) | (x & 1);
        x >>= 1;
    }
    r
}

/// First `n` powers of `psi` (primitive 2n-th root of unity), bit-reversed.
fn bitreversed_powers(psi: u32, n: usize) -> Vec<u32> {
    let log_n = n.trailing_zeros();
    let mut arr = alloc::vec![1u32; n];
    let mut alpha: u32 = 1;
    for a in arr.iter_mut() {
        *a = alpha;
        alpha = mul_mod_q(alpha, psi);
    }
    // Bit-reverse in place.
    for i in 0..n {
        let j = bitrev_index(i, log_n);
        if i < j {
            arr.swap(i, j);
        }
    }
    arr
}

/// Forward FFT over Z_q[x]/(x^N+1) using bit-reversed twiddles.
/// Algorithm 1 from <https://eprint.iacr.org/2016/504.pdf>.
pub fn ntt(a: &mut [u32]) {
    debug_assert_eq!(a.len(), N);
    // psi = primitive 2N-th root of unity (1024-th for n=512).
    let psi = primitive_root_of_unity(N.trailing_zeros() + 1);
    let psi_rev = bitreversed_powers(psi, N);

    let n = N;
    let mut t = n;
    let mut m = 1usize;
    while m < n {
        t >>= 1;
        for i in 0..m {
            let j1 = 2 * i * t;
            let j2 = j1 + t - 1;
            let s = psi_rev[m + i];
            for j in j1..=j2 {
                let u = a[j];
                let v = mul_mod_q(a[j + t], s);
                a[j] = add_mod_q(u, v);
                a[j + t] = sub_mod_q(u, v);
            }
        }
        m <<= 1;
    }
}

/// Inverse FFT over Z_q[x]/(x^N+1).
/// Algorithm 2 from <https://eprint.iacr.org/2016/504.pdf>.
pub fn intt(a: &mut [u32]) {
    debug_assert_eq!(a.len(), N);
    let psi = primitive_root_of_unity(N.trailing_zeros() + 1);
    let psi_inv_rev = bitreversed_powers(inv_mod_q(psi), N);
    let n_inv = inv_mod_q(N as u32);

    let n = N;
    let mut t = 1usize;
    let mut m = n;
    while m > 1 {
        let h = m / 2;
        let mut j1 = 0usize;
        for i in 0..h {
            let j2 = j1 + t - 1;
            let s = psi_inv_rev[h + i];
            for j in j1..=j2 {
                let u = a[j];
                let v = a[j + t];
                a[j] = add_mod_q(u, v);
                a[j + t] = mul_mod_q(sub_mod_q(u, v), s);
            }
            j1 += 2 * t;
        }
        t <<= 1;
        m >>= 1;
    }
    for ai in a.iter_mut() {
        *ai = mul_mod_q(*ai, n_inv);
    }
}

/// Pointwise multiplication mod q.
pub fn ntt_pointwise_mul(a: &[u32], b: &[u32]) -> alloc::vec::Vec<u32> {
    debug_assert_eq!(a.len(), N);
    debug_assert_eq!(b.len(), N);
    let mut c = alloc::vec![0u32; N];
    for i in 0..N {
        c[i] = mul_mod_q(a[i], b[i]);
    }
    c
}

/// Reduce a residue `x` in `[0, q)` to its centred representative in
/// `(-q/2, q/2]`.
#[inline(always)]
pub fn signed_repr(x: u32) -> i32 {
    let half = Q / 2;
    if x > half {
        x as i32 - Q as i32
    } else {
        x as i32
    }
}
