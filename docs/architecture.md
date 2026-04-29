# Nexora — Architecture (MVP)

> Companion to the source. Read this first. Intentionally
> implementation-oriented; no marketing.

## 1. One-paragraph definition

Nexora is a custom Arbitrum Orbit L3 + a Stylus smart-account stack with a
**hybrid ECDSA + post-quantum** validator gated by an on-chain policy
engine. PQ verification is performed via a **stable interface address**
resolved through a `VerifierRegistry`, so the backend (mock Falcon today,
real Falcon-512 / Nitro precompile later) can be swapped without
redeploying any wallets.

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
│  │              │  │ scheme→addr │  │ (mock Falcon-512│  │
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
| `contracts-stylus/pq-verifier` | `IPQVerifier` impl, mock Falcon-512 |
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

Today (v1):
- registry[FALCON_MOCK=1] = pq-verifier-stylus

Tomorrow (v2):
- registry[FALCON_512=2] = real-falcon-stylus

Day 2 of production:
- registry[FALCON_512=2] = 0x...c0 (Nitro precompile)

No wallet redeploy. No SDK change beyond bumping the default scheme.

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
- Real Falcon-512 in pure WASM is heavy; mock-verifier is intentional in
  v1 to ship the integration story end-to-end.
- AnyTrust DAC means no L1 DA on parent — fine for hackathon, mark as
  pre-production for serious deploys.

## 8. Forward-compat hooks

- ERC-7579 module slots are present on the account (validators / executors
  / hooks arrays) — wired up empty.
- ERC-4337 v0.7 selector layout used for `execute_user_op` so a real
  EntryPoint bundler can drive these wallets later.
- ERC-1271 `is_valid_signature` accepts both 65-byte ECDSA and the
  Nexora hybrid envelope.
