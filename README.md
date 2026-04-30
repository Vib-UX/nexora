# Nexora

> Post-quantum smart-wallet stack on a custom **Arbitrum Orbit** chain, written in **Rust/Stylus**.

Nexora is a vertically integrated stack that:

1. Launches a custom Arbitrum Orbit L3 chain.
2. Exposes a programmable post-quantum (PQ) verifier path via a stable `IPQVerifier` registry (Stylus today, optional Nitro precompile later — swap via registry without redeploying wallets).
3. Ships a Stylus smart-account (`NexoraAccount`) with an **ECDSA + PQ hybrid validator** gated by an on-chain `PolicyEngine` (LOW / HIGH / CRITICAL).
4. Provides a TS `wallet-sdk`, a single-op sponsoring `relayer`, and a Next.js `dashboard`.
5. Supports automated agents submitting risk-classified intents end-to-end.

See [`docs/architecture.md`](docs/architecture.md) for the full design and [`docs/demo-script.md`](docs/demo-script.md) for the judge-facing walkthrough.

## Repo layout

```
nexora/
├── chain/                 # Orbit deploy config + scripts
├── contracts-stylus/      # Rust workspace (Stylus contracts)
├── contracts-sol/         # Solidity interface definitions
├── wallet-sdk/            # TS SDK (UserOp, signers, client)
├── relayer/               # Node POST /op sponsor service
├── dashboard/             # Next.js dashboard
├── agent/                 # Demo AI agent
├── scripts/               # dev-up.sh, deploy-all.ts
└── docs/
```

## Prerequisites

- Node.js >= 20
- pnpm >= 9
- Rust (stable) + `wasm32-unknown-unknown` target
- `cargo stylus` (`cargo install --force cargo-stylus`)
- Foundry (`anvil`, `cast`) for local sanity checks

## Quickstart (local devnet)

```bash
pnpm install
./scripts/dev-up.sh                 # boot local Orbit-style devnet
pnpm --filter wallet-sdk build
pnpm tsx scripts/deploy-all.ts      # deploys Stylus contracts, writes deployments.json
pnpm --filter dashboard dev         # http://localhost:3000
pnpm --filter relayer dev           # http://localhost:8787
pnpm --filter agent demo            # runs the agent intent walkthrough
```

## Status

PQ verification is pluggable: scheme `1` (`FALCON_MOCK`) is a lightweight deterministic verifier for integration testing; scheme `2` (`FALCON_512`) is full Falcon-512 verification in Stylus. The `VerifierRegistry` maps scheme ids to contract addresses so implementations can be upgraded in one transaction. See `contracts-stylus/pq-verifier` and `contracts-stylus/pq-verifier-falcon512`.

## License

MIT
