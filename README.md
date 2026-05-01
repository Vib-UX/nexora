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
./scripts/dev-up.sh                       # boot local Orbit-style devnet
pnpm --filter wallet-sdk build
DEPLOYER_PRIVATE_KEY=0x... pnpm deploy    # deploys Stylus contracts, writes deployments.json
pnpm dashboard:dev                        # http://localhost:3000
```

The dashboard is the primary demo surface: connect MetaMask, generate a
Falcon-512 keypair in your browser, deploy your smart account, fund it,
and exercise LOW / HIGH / CRITICAL policy bands. The Falcon-512 wasm
bundle ships under `dashboard/public/wasm/falcon512/`; rebuild only when
`signer/falcon-signer-wasm` changes:

```bash
pnpm wasm:build      # requires `cargo install wasm-pack`
```

See [`docs/demo-script.md`](docs/demo-script.md) for the full
walkthrough and [`docs/dashboard-flow.md`](docs/dashboard-flow.md) for a
card-by-card description of the on-chain effect.

### Optional services

```bash
pnpm relayer:dev                          # http://localhost:8787, sponsor-relayed UserOps
pnpm agent:demo                           # runs the agent intent walkthrough
```

For offline / non-wasm browsers, the local Falcon-512 signer daemon
serves keys + signing over HTTP:

```bash
cd signer/falcon-signer
cargo run --release -- keygen --out keys.json
cargo run --release -- serve --keys keys.json --addr 127.0.0.1:9090
```

## Status

PQ verification is pluggable. Scheme `2` (`FALCON_512`) is full
Falcon-512 verification in Stylus and is the default in the dashboard
and the SDK; scheme `1` (`FALCON_MOCK`) is a lightweight deterministic
verifier kept for integration testing. The `VerifierRegistry` maps
scheme ids to contract addresses so implementations can be upgraded in
one transaction. See `contracts-stylus/pq-verifier-falcon512` (real
verifier), `contracts-stylus/falcon-core` (verify-only Rust port +
KAT/fuzz harness), and the precompile roadmap in
[`docs/falcon-precompile-roadmap.md`](docs/falcon-precompile-roadmap.md).

## License

MIT
