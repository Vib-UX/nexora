# Nexora — Architecture

> For motivation and reader-facing context first, see [Overview](overview.md).
> Companion to the source. Read this first. Intentionally
> implementation-oriented; no marketing.

## 1. One-paragraph definition

Nexora is a custom Arbitrum Orbit L3 + a Stylus smart-account stack with a
**hybrid ECDSA + post-quantum** validator gated by an on-chain policy
engine. PQ verification is performed via a **stable interface address**
resolved through a `VerifierRegistry`, so the backend (scheme 1 reference
verifier, scheme 2 Falcon-512, or a future Nitro precompile) can be swapped
without redeploying any wallets.

## 2. Layers

```
┌──────────────────────────────────────────────────────────┐
│ dashboard / agent (Next.js, Node)                        │
│   wagmi + @nexora/wallet-sdk                             │
└────────────┬─────────────────────────────────────────────┘
             │ JSON-RPC (eth_*)
             ▼
┌──────────────────────────────────────────────────────────┐
│ relayer (optional)  — single-bundler, POST /op           │
└────────────┬─────────────────────────────────────────────┘
             │ executeUserOp / execute_intent
             ▼
┌──────────────────────────────────────────────────────────┐
│ NexoraAccount (Stylus)  — hybrid validator + execution   │
│  ┌──────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │ PolicyEngine │  │ VerifierReg │→ │ IPQVerifier     │  │
│  │              │  │ scheme→addr │  │ (Falcon-512 /   │  │
│  └──────────────┘  └─────────────┘  └─────────────────┘  │
└──────────────────────────────────────────────────────────┘
             ▲
             │ AnyTrust posts to parent
             ▼
┌──────────────────────────────────────────────────────────┐
│ Arbitrum Sepolia (parent) — settlement                   │
└──────────────────────────────────────────────────────────┘
```

## 3. Module map

| Path | Role |
|---|---|
| `chain/` | Orbit chain config + deploy modes (plan/local/execute) |
| `contracts-stylus/shared` | Shared types + EIP-712 op-hash, no SDK deps |
| `contracts-stylus/pq-verifier` | `IPQVerifier` impl, scheme 1 (FALCON_MOCK) |
| `contracts-stylus/verifier-registry` | `scheme -> address` indirection |
| `contracts-stylus/policy-engine` | LOW/HIGH/CRITICAL rule table |
| `contracts-stylus/nexora-account` | The smart wallet (hybrid validator) |
| `contracts-stylus/account-factory` | EIP-1167 + CREATE2 deterministic deploy |
| `contracts-sol/` | Canonical Solidity interfaces (no impls) |
| `wallet-sdk/` | TS SDK: opHash, signers, NexoraClient |
| `relayer/` | POST /op single-op sponsoring relayer |
| `dashboard/` | Next.js + wagmi UI |
| `agent/` | Demo intent provider |
| `scripts/` | dev-up.sh, deploy-all.ts |

## 4. Validation flow

```
1. SDK builds UserOp (chainId-bound, EIP-712 typed)
2. SDK calls PolicyEngine.classify off-chain → tag (LOW/HIGH/CRITICAL)
3. SDK collects signatures:
       LOW       → ECDSA only
       HIGH      → ECDSA + PQ(scheme=FALCON_MOCK)
       CRITICAL  → PQ only via dedicated rotate_* entrypoints
4. SDK abi.encodes (EcdsaSig, PqSig) into op.signatures
5. SDK calls NexoraAccount.execute_user_op(op, providedPubkey)
6. On-chain validator:
       a. Re-classifies via PolicyEngine
       b. ECDSA path: ecrecover(EIP-191 prefix + opHash) == owner
       c. PQ path:    keccak(pubkey) == stored hash
                       registry.verifier(scheme) -> verifier
                       verifier.verify(opHash, sig, pubkey) == true
       d. Burn nonce on (channel, expected) – channel 0=ECDSA, 1=PQ
       e. forwardCall(target, value, callData)
       f. emit UserOpExecuted / IntentExecuted
```

## 5. Verifier abstraction (the swappable bit)

Wallets never embed a verifier address. They always indirect through:

```
verifier_registry.verifier(scheme) -> address
```

Currently registered (Phase 2 — what `scripts/deploy-all.ts` now wires up):

| scheme | id | impl                                      | encoding accepted |
|--------|----|-------------------------------------------|-------------------|
| FALCON_MOCK | 1 | `contracts-stylus/pq-verifier`         | `keccak256(pubkey || msgHash)` (deterministic reference verifier) |
| FALCON_512  | 2 | `contracts-stylus/pq-verifier-falcon512` (real) | PQClean header `0x39` *and* `falcon-rust`/FIPS-206 standard-compressed `0x59` |

Future swaps require **one transaction** (`registry.setVerifier(scheme, addr)`):

| swap | what changes                                                    |
|------|------------------------------------------------------------------|
| Same on-chain semantics, different impl | `registry[FALCON_512] = newStylusContract` |
| Onboard a Nitro precompile              | `registry[FALCON_512] = stylusShim`, where the shim does `RawCall(0x...c0, abi.encode(hash, sig, pubkey))` |
| Add a new PQ algorithm (Dilithium, etc.) | new scheme id, new verifier; old wallets keep working |

No wallet redeploy. No SDK change beyond bumping the default scheme.

## 5a. PQ verifier — measurements

Stylus activation (compressed WASM size + activation fee), measured via
`cargo stylus check` on the local Nitro devnet:

| crate | scheme | algorithm | wasm (compressed) | activation fee |
|-------|--------|-----------|-------------------|----------------|
| `pq-verifier`            | 1 | keccak reference | ~7  KB | trivial |
| `pq-verifier-falcon512`  | 2 | **real Falcon-512 verify** | ~12.9 KB | ≈ 0.0001 ETH |

`pq-verifier-falcon512` is a **verify-only** port of Falcon-512 covering
SHAKE-256, hash-to-point, NTT mod q=12289, public-key + compressed-signature
decode, and the `||(s1, s2)||² < bound` norm check. The implementation
matches `falcon-rust`'s NTT convention (Algorithm 1 from
[eprint 2016/504](https://eprint.iacr.org/2016/504.pdf)) with bit-reversed
twiddles, so signatures produced by the host-side `falcon-rust` signer are
accepted bit-exact.

### Test surface

| harness | location | what it pins |
|---------|----------|---------------|
| Interop  | `contracts-stylus/falcon-core/tests/interop.rs` | `falcon-rust` signs → our verify accepts; tampered/wrong-message rejected |
| KAT      | `contracts-stylus/falcon-core/tests/kat.rs`     | Fixed-seed `(seed, hash) → sig` vectors; zero-sig, truncated-sig, bad-pk-header all rejected |
| Fuzz     | `contracts-stylus/falcon-core/fuzz/`            | libFuzzer targets covering arbitrary inputs and signature perturbations |

A future PR will switch the KAT harness over to the official PQClean
Falcon-512 `.rsp` test vectors (their sig header is `0x39`; ours accepts
both `0x39` and `0x59`, so the only adapter needed is reading the file).

### Signing path

| backend | where it runs | how |
|---------|---------------|-----|
| `signer/falcon-signer` (default) | host process | `pqcrypto-falcon`-style API via the `falcon-rust` crate (FIPS-206 compatible standard-compressed encoding); `--serve` exposes `POST /sign` for the dashboard / agent / relayer |
| `signer/falcon-signer-wasm` (opt-in) | browser | `wasm-bindgen` build of the same crate, lazy-loaded by the dashboard when `NEXT_PUBLIC_FALCON512_BROWSER=1`. See `wallet-sdk/wasm/README.md` |

Default local setup uses scheme 1 for zero extra dependencies. Setting
`FALCON_SCHEME=2` on the agent or selecting Falcon-512 in the dashboard
switches the SDK to scheme 2 and routes through the running signer daemon.

## 5b. PQ verifier — roadmap

We expose a Stylus contract today because that's the one place we
fully control on Orbit. The path forward is:

1. **Now (P1–P3, shipped):** real Falcon-512 verify in Stylus, registered
   at scheme 2; scheme 1 remains the lightweight reference path for local workflows.
2. **Next (P4, planned):** custom Nitro precompile at `0x...c0` exposing
   `falcon512_verify(hash, sig, pubkey) -> bool`, implemented in Go inside
   the Nitro fork using vector NTT + SHAKE intrinsics. The Stylus contract
   shrinks to a 100-line shim (`RawCall(0xc0, ...)`); the registry update
   is a single tx, and existing wallets see no change.
3. **Long term (matches Vitalik's lattice-precompile +
   recursive-aggregation roadmap):** drop the precompile entirely once
   protocol-level recursive proof aggregation lands — verification becomes
   "free" for the ground-truth proof and individual sigs never hit
   on-chain compute. See `docs/eip8141-mapping.md`.

## 6. Replay protection

- `chainId` is mixed into the EIP-712 domain → no cross-chain replay.
- 2D nonces: `mapping(uint192 channel => uint64 seq)`.
  - channel `0` → ECDSA-only ops
  - channel `1` → PQ-required ops
  - additional channels reserved for higher-throughput parallelism.
- Each op declares `op.nonce = currentSeq[channel] + 1`.

## 7. Risky assumptions

- Stylus SDK API is moving fast — pin to a known good version (`stylus-sdk = 0.6.0` here).
- `cargo stylus deploy` output parsing in `scripts/deploy-all.ts` may need
  tweaks across versions (regex match on the success line).
- Falcon-512 in pure WASM has a measurable activation size budget; scheme 1
  keeps local iteration fast while scheme 2 carries production-grade verify.
- AnyTrust DAC means no L1 DA on parent — document as pre-production for
  deployments that require full rollup data availability.

## 8. Forward-compat hooks

- ERC-7579 module slots are present on the account (validators / executors
  / hooks arrays) — wired up empty.
- ERC-4337 v0.7 selector layout used for `execute_user_op` so a real
  EntryPoint bundler can drive these wallets later.
- ERC-1271 `is_valid_signature` accepts both 65-byte ECDSA and the
  Nexora hybrid envelope.
