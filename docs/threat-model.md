# Nexora — Threat model (sketch)

| # | Threat | Mitigation (v1) | Notes |
|---|---|---|---|
| 1 | ECDSA private key leak | HIGH/CRITICAL ops require PQ co-signature; CRITICAL ops require PQ-only + 60s timelock | Recovery via PQ key (or guardians, future) |
| 2 | PQ private key leak | ECDSA still required for HIGH ops; CRITICAL still requires PQ but is gated by timelock for owner cancellation | Single-key compromise is not catastrophic |
| 3 | Both keys leaked | Worst case — owner can cancel before timelock if attacker initiates rotation | Add guardian set in v2 |
| 4 | Replayed UserOp on another chain | `chainId` mixed into EIP-712 domain | Standard mitigation |
| 5 | Replayed UserOp same chain | 2D nonces strict-incrementing per channel | Channels prevent head-of-line blocking between PQ and ECDSA traffic |
| 6 | Verifier upgrade malice | Registry owner is multi-sig (production); v1 = deployer | Document trust assumption |
| 7 | Reference verifier (`FALCON_MOCK`) in prod | `IPQVerifier.scheme()` returns `FALCON_MOCK=1`; wallets gate by scheme id at policy time | Refuse to validate HIGH/CRITICAL with `scheme=1` in production deploys |
| 8 | Stylus contract reverts in `validate_user_op` | Bundlers will see revert; tx not included | Same as ERC-4337 sim |
| 9 | Sequencer censorship | Force-include via parent chain (Orbit standard) | Manual recovery escape hatch |
| 10 | DAC compromise (AnyTrust) | Move to Rollup mode for production; AnyTrust is a documented trade-off | Documented |

## Funding the smart account vs ECDSA loss

ETH held **by the Nexora smart account** still exits through `execute_user_op`.
If the on-chain [PolicyEngine](architecture.md) classifies an operation as **LOW**, validation is **ECDSA-only** (owner key). An attacker who stole only the ECDSA key can move funds **within whatever LOW allows** (small transfers and non-escalated targets under your deployed thresholds). PQ co-sign matters for **HIGH**; **CRITICAL** adds PQ-focused rules including timelock where implemented.

So “we funded the smart account and Falcon is the co-signer” is **not** a blanket guarantee: PQ backs only the bands where policy says so. Keeping substantial savings on the **plain EOA** does not add PQ protection to those coins until they sit behind rules you trust. For mitigations see rows 1–2 in the table above.

## Out of scope (v1)

- Side-channel attacks on the in-browser reference signer (not intended as a hardened signing surface)
- Bridge security on the parent chain
- MEV / proposer extraction at the sequencer

## Production checklist

- Use `FALCON_512` (scheme 2) with an audited Falcon-512 verifier for HIGH/CRITICAL; consider additional schemes (e.g. Dilithium) per benchmarks
- Move registry ownership to a multi-sig
- Add guardian-based recovery (3-of-5 ECDSA over a recovery digest)
- Switch L3 from AnyTrust to Rollup
- Audit `nexora-account` validation paths (especially nonce burn ordering)
