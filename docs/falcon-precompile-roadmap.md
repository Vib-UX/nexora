# Roadmap: Falcon-512 verify as a Nitro precompile

> Companion to `docs/architecture.md`. Sketch only; no implementation yet.

## Why move off Stylus?

| concern | Stylus today | Nitro precompile |
|---------|--------------|-------------------|
| activation cost | one-time, ~0.0001 ETH | none |
| per-call gas | EVM/WASM-dispatched NTT (~1.5–3 M gas est.) | 50–200k gas with SIMD-NTT |
| WASM size cap | 24 KB compressed (currently 12.9 KB; tight) | n/a |
| upgrade path | redeploy Stylus contract → 1-tx registry swap | Nitro fork bump → registry swap |

The **gas line is the thing that matters**. Even with the WASM port
optimised, each Falcon verify in Stylus runs the full SHAKE-256 + NTT
inside the WASM hostcall fence. A vectorised Go implementation living at
`vm/precompile.go` can amortise that into a few hundred μs per verify and
charge sub-200k gas, which is what makes lattice signatures actually
practical for HIGH/CRITICAL ops at scale.

## Precompile address

Reserve a slot in the Nexora-fork Nitro precompile namespace:

```
addr = 0x000000000000000000000000000000000000c1f5
ABI  = falcon512_verify(bytes32 msgHash, bytes sig, bytes pubkey) -> bool
```

The choice of `c1f5` (= "FALCON-FIPS5") is just a hex-pun — what matters is
that we DO NOT collide with any existing Arbitrum precompile (those live in
`0x6c..0x6f`, `0xc8..` for ArbOS-specific ones). Using `0xc1f5` keeps us
clear of Ethereum mainnet (`0x01..0x0a`) and Arbitrum (`0x6c..`).

## Go implementation sketch

In a Nexora-fork of Nitro:

```go
// arbos/precompiles/Falcon512.go
package precompiles

import (
    "github.com/cloudflare/circl/sign/falcon"  // or vendored PQClean
)

type Falcon512 struct {
    Address addr // 0x...c1f5
}

func (p Falcon512) GasToCharge(input []byte) uint64 {
    // Constant — sig + pubkey are fixed length, so verification cost
    // is statically bounded.
    return 80_000   // tunable, see "gas pricing" below
}

func (p Falcon512) Call(
    input []byte,
    precompileAddress addr,
    actingAsAddress addr,
    caller addr,
    value *big.Int,
    readOnly bool,
    evm *vm.EVM,
) ([]byte, uint64, error) {
    // 1. Decode (msgHash, sig, pubkey) from EVM-ABI input.
    // 2. Call falcon.Verify(msgHash, sig, pubkey)  → bool
    // 3. abi-encode the bool as 32-byte word.
    // 4. Return remaining gas, no error.
}
```

### Backend choice

| candidate | pros | cons |
|-----------|------|------|
| Vendored **PQClean** Falcon-512 reference (C, via cgo) | Bit-exact spec compliance | cgo build complexity in Nitro |
| **Cloudflare CIRCL**'s `circl/sign/falcon` (pure Go) | No cgo; stays in the standard Go build | Less mature on hardened side-channels |
| Vendored **PQClean AVX2** + Go assembly shim | Fastest | Must maintain hand-tuned asm |

Recommendation for the first precompile rollout: **CIRCL** if it ships
Falcon-512 (verify-only is OK), else vendor PQClean reference behind a
thin Go wrapper.

## Stylus shim — drop-in IPQVerifier

The point of the registry is that wallets do not change when the backend
moves. The Stylus contract registered at `scheme = FALCON_512` becomes a
**100-line shim**:

```rust
// contracts-stylus/pq-verifier-falcon512-shim/src/lib.rs (future PR)

const PRECOMPILE: Address = address!("0x000000000000000000000000000000000000c1f5");

#[public]
impl PqVerifierFalcon512Shim {
    pub fn scheme(&self) -> u16 { 2 }
    pub fn pubkey_length(&self) -> u16 { 897 }
    pub fn sig_length(&self) -> u16 { 666 }

    pub fn verify(&self, msg_hash: B256, sig: Bytes, pubkey: Bytes) -> bool {
        // ABI-encode (bytes32, bytes, bytes) and forward to the precompile.
        let payload = abi_encode_args(msg_hash, &sig, &pubkey);
        match RawCall::new_static().call(PRECOMPILE, &payload) {
            Ok(out) => out.len() >= 32 && out[31] == 1,
            Err(_) => false,
        }
    }

    pub fn pubkey_commitment(&self, pubkey: Bytes) -> B256 {
        keccak256(&pubkey)
    }
}
```

WASM size for this shim: **<2 KB** (no NTT, no SHAKE). Activation fee is
trivially small.

## Migration sequence (zero-downtime)

```
T0:   ship Nitro fork carrying the precompile (no on-chain change)
T0+δ: deploy `pq-verifier-falcon512-shim` and verify it returns true
       for a known-good (sig, pubkey, hash) triple
T1:   registry.setVerifier(2, shim_address)
       — wallets still call verifier(2).verify(...) — no redeploy
T2:   remove the old Stylus port from `STYLUS_CRATES` in deploy-all.ts
```

If the precompile turns out to disagree with the Stylus port on any input
(e.g. due to a subtle compressed-encoding edge case), the migration is
revertible by `registry.setVerifier(2, oldStylusAddress)` in one tx.

## Gas pricing — calibration

We need to set `GasToCharge` such that `Falcon512.verify` is *cheaper than
the equivalent computation would be inside Stylus*. Two anchors:

- **Floor**: real Falcon-512 verify in pure Go on a current AWS Graviton
  measures ~140 μs. At Arbitrum's Nitro gas-per-second target this is
  somewhere in the 30–80k gas range.
- **Ceiling**: ECDSA `precompile_ecrecover` in Arbitrum charges 3000 gas
  for ~50 μs of work; that ratio gives ~9000 gas/μs for an upper bound.
  Falcon at ~140 μs would land near 1.3 M gas at that ratio — clearly
  unacceptable. The lattice-precompile gas table in EIP-8141's discussion
  thread suggests **~80–120k gas** as the right point.

Plan: ship at 80_000 gas, instrument, and adjust before any mainnet
deploy. Keep the number behind a config flag so chain operators can bump
it without forking again.

## Out of scope (for the precompile PR)

- Recursive proof aggregation (long-term Ethereum item; protocol-layer).
- Hardware (intrinsics) acceleration of the NTT in the Stylus port.
- Replacing the wallet's hash-to-point with a host precompile (would
  need a parallel `falcon512_h2p` precompile).
