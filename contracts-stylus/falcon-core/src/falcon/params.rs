//! Falcon-512 fixed parameters.

/// Falcon modulus.
pub const Q: u32 = 12_289;

/// Polynomial degree for Falcon-512.
pub const N: usize = 512;

/// `log2(N)`.
pub const LOG_N: u32 = 9;

/// Encoded public key size in bytes (1 header byte + 14 bits per coefficient).
pub const PUBKEY_BYTES: usize = 897;

/// Encoded signature size in bytes (1 header byte + 40 bytes salt + 625 bytes
/// compressed s2). The standard "compressed" Falcon-512 signature is 666 bytes.
pub const SIG_BYTES: usize = 666;

/// Length of the salt embedded in a Falcon signature.
pub const SALT_BYTES: usize = 40;

/// Header byte for a Falcon-512 signature: `0x30 | log_n` = `0x30 | 9` = 0x39.
pub const SIG_HEADER: u8 = 0x30 | (LOG_N as u8);

/// Header byte for a Falcon-512 public key: `0x00 | log_n` = `0x00 | 9` = 0x09.
pub const PK_HEADER: u8 = 0x00 | (LOG_N as u8);

/// Squared norm bound for a valid Falcon-512 signature.
/// (See Falcon spec, Table 3.3 — `sigma * sqrt(2*N)` rounded; the standardised
/// value for n=512 is 34_034_726.)
pub const NORM_BOUND_SQ: u64 = 34_034_726;
