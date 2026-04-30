//! Pure-Rust Falcon-512 verify implementation, no_std-friendly.
//!
//! This crate has no Stylus or alloy dependencies so it can be unit-tested
//! on the host (and reused outside Stylus) while still compiling for
//! `wasm32-unknown-unknown` inside the Stylus contract.

#![cfg_attr(not(test), no_std)]

extern crate alloc;

pub mod falcon;

pub use falcon::params::{NORM_BOUND_SQ, PUBKEY_BYTES, SIG_BYTES};
pub use falcon::verify::verify;
