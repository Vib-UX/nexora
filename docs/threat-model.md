# Nexora — Threat model (sketch)

| # | Threat | Mitigation (v1) | Notes |
|---|---|---|---|
| 1 | ECDSA private key leak | HIGH/CRITICAL ops require PQ co-signature; CRITICAL ops require PQ-only + 60s timelock | Recovery via PQ key (or guardians, future) |
| 2 | PQ private key leak | ECDSA still required for HIGH ops; CRITICAL still requires PQ but is gated by timelock for owner cancellation | Single-key compromise is not catastrophic |
| 3 | Both keys leaked | Worst case — owner can cancel before timelock if attacker initiates rotation | Add guardian set in v2 |
| 4 | Replayed UserOp on another chain | `chainId` mixed into EIP-712 domain | Standard mitigation |
| 5 | Replayed UserOp same chain | 2D nonces strict-incrementing per channel | Channels prevent head-of-line blocking between PQ and ECDSA traffic |
| 6 | Verifier upgrade malice | Registry owner is multi-sig (production); v1 = deployer | Document trust assumption |
| 7 | Mock Falcon used in prod | `IPQVerifier.scheme()` returns `FALCON_MOCK=1`; wallets gate by scheme id at policy time | Refuse to validate HIGH/CRITICAL with `scheme=1` in production deploys |
| 8 | Stylus contract reverts in `validate_user_op` | Bundlers will see revert; tx not included | Same as ERC-4337 sim |
| 9 | Sequencer censorship | Force-include via parent chain (Orbit standard) | Manual recovery escape hatch |
| 10 | DAC compromise (AnyTrust) | Move to Rollup mode for production; AnyTrust is hackathon trade-off | Documented |

## Out of scope (v1)

- Side-channel attacks on the in-browser Falcon-mock signer (the mock is not constant-time anyway)
- Bridge security on the parent chain
- MEV / proposer extraction at the sequencer

## Production checklist (post-MVP)

- Replace mock Falcon with audited real Falcon-512 (or Dilithium-3, depending on benchmarks)
- Move registry ownership to a multi-sig
- Add guardian-based recovery (3-of-5 ECDSA over a recovery digest)
- Switch L3 from AnyTrust to Rollup
- Audit `nexora-account` validation paths (especially nonce burn ordering)
