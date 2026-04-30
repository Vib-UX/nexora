//! Minimal SHAKE-256 (Keccak[512]) for Falcon's hash-to-point.
//!
//! Hand-rolled to avoid pulling in `tiny-keccak`'s dependency tree and to keep
//! the WASM blob small. Public API is just `Shake256::init`, `update`, and
//! `squeeze` — enough for Falcon's hash-to-point usage.

use alloc::vec::Vec;

const ROUNDS: usize = 24;

/// 64-bit Keccak round constants.
const RC: [u64; ROUNDS] = [
    0x0000000000000001,
    0x0000000000008082,
    0x800000000000808A,
    0x8000000080008000,
    0x000000000000808B,
    0x0000000080000001,
    0x8000000080008081,
    0x8000000000008009,
    0x000000000000008A,
    0x0000000000000088,
    0x0000000080008009,
    0x000000008000000A,
    0x000000008000808B,
    0x800000000000008B,
    0x8000000000008089,
    0x8000000000008003,
    0x8000000000008002,
    0x8000000000000080,
    0x000000000000800A,
    0x800000008000000A,
    0x8000000080008081,
    0x8000000000008080,
    0x0000000080000001,
    0x8000000080008008,
];

const ROT: [[u32; 5]; 5] = [
    [0, 36, 3, 41, 18],
    [1, 44, 10, 45, 2],
    [62, 6, 43, 15, 61],
    [28, 55, 25, 21, 56],
    [27, 20, 39, 8, 14],
];

#[inline(always)]
fn rotl64(x: u64, n: u32) -> u64 {
    x.rotate_left(n & 63)
}

fn keccak_f(state: &mut [u64; 25]) {
    for round in 0..ROUNDS {
        // Theta
        let mut c = [0u64; 5];
        for x in 0..5 {
            c[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
        }
        let mut d = [0u64; 5];
        for x in 0..5 {
            d[x] = c[(x + 4) % 5] ^ rotl64(c[(x + 1) % 5], 1);
        }
        for x in 0..5 {
            for y in 0..5 {
                state[x + 5 * y] ^= d[x];
            }
        }

        // Rho + Pi
        let mut b = [0u64; 25];
        for x in 0..5 {
            for y in 0..5 {
                let new_x = y;
                let new_y = (2 * x + 3 * y) % 5;
                b[new_x + 5 * new_y] = rotl64(state[x + 5 * y], ROT[x][y]);
            }
        }

        // Chi
        for y in 0..5 {
            for x in 0..5 {
                state[x + 5 * y] = b[x + 5 * y] ^ ((!b[((x + 1) % 5) + 5 * y]) & b[((x + 2) % 5) + 5 * y]);
            }
        }

        // Iota
        state[0] ^= RC[round];
    }
}

/// SHAKE-256 (capacity 512 bits, rate 136 bytes).
pub struct Shake256 {
    state: [u64; 25],
    /// Buffered input bytes within the current rate block.
    buf_pos: usize,
    /// `true` once `pad_and_switch_to_squeeze` has run.
    squeezing: bool,
    /// Position in the rate block while squeezing.
    squeeze_pos: usize,
}

const RATE: usize = 136;

impl Shake256 {
    pub fn init() -> Self {
        Self {
            state: [0u64; 25],
            buf_pos: 0,
            squeezing: false,
            squeeze_pos: 0,
        }
    }

    pub fn update(&mut self, data: &[u8]) {
        debug_assert!(!self.squeezing);
        for &b in data {
            let lane = self.buf_pos >> 3;
            let shift = (self.buf_pos & 7) * 8;
            self.state[lane] ^= (b as u64) << shift;
            self.buf_pos += 1;
            if self.buf_pos == RATE {
                keccak_f(&mut self.state);
                self.buf_pos = 0;
            }
        }
    }

    fn pad_and_switch_to_squeeze(&mut self) {
        // Domain separator for SHAKE: 0x1F at first byte, 0x80 at the last byte
        // of the rate block.
        let lane = self.buf_pos >> 3;
        let shift = (self.buf_pos & 7) * 8;
        self.state[lane] ^= (0x1Fu64) << shift;
        let last = RATE - 1;
        let lane = last >> 3;
        let shift = (last & 7) * 8;
        self.state[lane] ^= (0x80u64) << shift;
        keccak_f(&mut self.state);
        self.squeezing = true;
        self.squeeze_pos = 0;
    }

    pub fn squeeze(&mut self, out: &mut [u8]) {
        if !self.squeezing {
            self.pad_and_switch_to_squeeze();
        }
        for byte in out.iter_mut() {
            if self.squeeze_pos == RATE {
                keccak_f(&mut self.state);
                self.squeeze_pos = 0;
            }
            let lane = self.squeeze_pos >> 3;
            let shift = (self.squeeze_pos & 7) * 8;
            *byte = ((self.state[lane] >> shift) & 0xFF) as u8;
            self.squeeze_pos += 1;
        }
    }

    pub fn squeeze_vec(&mut self, n: usize) -> Vec<u8> {
        let mut v = alloc::vec![0u8; n];
        self.squeeze(&mut v);
        v
    }
}
