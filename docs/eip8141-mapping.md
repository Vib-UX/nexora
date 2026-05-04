# Nexora ↔ EIP-8141 alignment

**In this doc:** Vitalik-style framing for EIP-8141 (`SENDER` / `VERIFY` / `EXEC`), a concrete table mapping Nexora’s `UserOp` and registry model onto those frames, and migration notes—without changing Nexora’s on-chain semantics today.

> Companion to `docs/architecture.md`. Maps Nexora's existing UserOp +
> envelope flow onto EIP-8141 frames so a future "default code" emission of
> the Nexora account is a mechanical re-shaping, not a redesign.

## The Vitalik framing in one paragraph

EIP-8141 introduces three frame types per transaction: `SENDER`, `VERIFY`,
and `EXEC`. A `VERIFY` frame is **side-effect-free** — it can only look at
its own calldata and return a value, and *nothing else can read its
calldata*. The point of this isolation is that any `VERIFY` frame and its
calldata can be replaced with a STARK that asserts the frame would have
returned `true`, even after the fact, even at the mempool layer. That's
how lattice signatures (3 KB+ payloads) and ZK proofs (256 KB+) get out of
the on-chain compute path: they live entirely inside `VERIFY` frames whose
contents are eventually proven, never executed at validate-time on every
node.

## Nexora today, in EIP-8141 terms

| Nexora today                                              | EIP-8141                                                 |
|------------------------------------------------------------|-----------------------------------------------------------|
| `UserOp.signatures` (`abi.encode(EcdsaSig, PqSig)`)        | `frame.data` of the `VERIFY` frame                        |
| ECDSA branch in `validate_user_op`                         | `signature_type = 0x0` default code (ecrecover-equivalent)|
| `verifier.verify(...)` Falcon branch                       | new `signature_type = 0xF1` for **FALCON-512** (Nexora-defined) |
| `executeUserOp` body                                       | `SENDER` frame following the `VERIFY` frame               |
| `compute_op_hash` in `contracts-stylus/shared/src/op_hash.rs` | `TXPARAM(0x08)` — canonical signing hash                |
| `policy_tag` (LOW / HIGH / CRITICAL)                       | (off-chain hint; 8141 has no analog — it's a Nexora layer) |
| `VerifierRegistry.setVerifier(scheme, addr)`               | (chain config knob — 8141 leaves choice of `signature_type` codes to the chain) |
| `validUntil`                                               | `TXPARAM(...)` — TTL field, optional in 8141              |

**No part of our model conflicts with 8141.** The mapping is clean enough
that we can flip Nexora into 8141 mode by:

1. Defining a single `signature_type = 0xF1` ABI: `(opHashLike, sig, pubkey)`
   → `bool`. We already have that exact shape on
   `IPQVerifier.verify(bytes32, bytes, bytes)`.
2. Re-emitting `NexoraAccount` as **default code** with one `VERIFY` frame
   (calls `ecrecover`-equivalent for ECDSA *or* the Falcon-512 verifier)
   followed by the existing `SENDER`/`EXEC` body.

## What "VERIFY frame" actually means for our codebase

Concretely, on the day 8141 is enabled on Orbit:

```
NexoraAccount default code  ::=

  // Frame 1: VERIFY
  VERIFY({
    type:   0xF1,                                  // FALCON-512 (Nexora-defined)
    data:   abi.encode(opHash, sig, pubkey),
    expect: returndata == abi.encode(bool(true)),
  })

  // Frame 2: SENDER
  SENDER({
    target:    op.target,
    value:     op.value,
    data:      op.callData,
    gasLimit:  op.callGasLimit,
  })
```

The chain's protocol-layer prover then has the option, every 500 ms or so,
to bundle all `VERIFY` frames in the mempool into a single STARK proof and
submit *that* on-chain instead of executing each frame individually. Per
Vitalik:

> "every 500ms, each node could pass along the new valid transactions that
> it has seen, along with a proof verifying that they are all valid
> (including having validation frames that match their stated effects)."

For us, this means **today's heavy Falcon verify on-chain compute moves to
the mempool prover** — without any wallet redeploy, without an SDK change,
and without a new EIP per signature scheme.

## Migration order

1. **Now (shipped):** keep `executeUserOp(opBytes, providedPubkey)` as the
   wallet entrypoint. Validation is split into ECDSA + PQ branches.
2. **When 8141 lands on Orbit:** add a `default_code()` view on
   `NexoraAccount` that returns the canonical (`VERIFY` + `SENDER`)
   frame layout for the current op. Wallet stays callable through the old
   entrypoint *and* via 8141 frames.
3. **When the mempool aggregator is ready:** the Stylus
   `pq-verifier-falcon512` contract becomes "soft-spendable" — it still
   exists, but most blocks consume the proof bundle rather than executing
   individual verifies. We don't need to redeploy or even re-register
   anything.

## Why we want this layering, not a hard fork

Two practical reasons:

- **Backwards compat.** Until aggregation is rolled out, Nexora wallets
  must still work via `executeUserOp` on the existing Orbit Stylus
  runtime. The `VERIFY`-frame path is **additive**.
- **Multiple PQ schemes.** A `signature_type` byte (Nexora-defined `0xF1`
  for Falcon-512) is cheaper than running a new EIP for every PQ scheme.
  When (not if) we add Dilithium-3 or SPHINCS+, that's a new
  `signature_type` and a new `IPQVerifier` impl — same wallet, same
  registry, same SDK.

## Out of scope here

- The exact **opcodes** EIP-8141 introduces (`VERIFY`, `SENDER`,
  `TXPARAM`, etc.) — those are upstream EVM concerns. We just need to
  emit our existing payloads in their byte layout.
- **Recursive proof aggregation across blocks** — also upstream;
  orthogonal to wallet shape.
- **Lean Ethereum hash function selection** (Poseidon2 / BLAKE3 /
  Poseidon1) — orthogonal to the wallet's hash-to-point.
