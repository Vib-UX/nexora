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

## Hosted Nexora Devnet (public)

The production-facing dashboard and RPCs use TLS hostnames (not localhost). Chain parameters match the Nitro dev profile (`chainId` **412346** / `0x64ABA`, same as local `scripts/dev-up.sh`). Orbit rollout metadata in [`chain/orbit-config.json`](chain/orbit-config.json) documents a registered **20056** (`0x4E58`) target for parent-chain deploys; the live host below currently advertises **412346** via `eth_chainId`.

| Item | Value |
| --- | --- |
| Dashboard | [https://www.nexorapq.in](https://www.nexorapq.in) |
| JSON-RPC | `https://blockchain.nexorapq.in` |
| WebSocket | `wss://ws.blockchain.nexorapq.in` |
| Blockscout | [https://explorer.nexorapq.in](https://explorer.nexorapq.in) |
| Chain name | Nexora Devnet |
| Chain ID | `412346` (`0x64ABA`) |
| `wallet_addEthereumChain` | `chainId`: `0x64ABA`, `rpcUrls`: [`https://blockchain.nexorapq.in`], `blockExplorerUrls`: [`https://explorer.nexorapq.in`] |

### Example transaction (Falcon-512 PQ verifier in trace)

The dashboard `/tx/[hash]` view decodes `debug_traceTransaction` and highlights the on-chain `verify(msgHash, sig, pubkey)` call into the Falcon-512 Stylus verifier.

- **PQ-aware trace (primary):** [https://www.nexorapq.in/tx/0xaf7ce812ee448e085692fce8e10c9abd09c46617a9c3179ceb147d0cd60a16d0](https://www.nexorapq.in/tx/0xaf7ce812ee448e085692fce8e10c9abd09c46617a9c3179ceb147d0cd60a16d0)
- **Same tx on Blockscout:** [https://explorer.nexorapq.in/tx/0xaf7ce812ee448e085692fce8e10c9abd09c46617a9c3179ceb147d0cd60a16d0](https://explorer.nexorapq.in/tx/0xaf7ce812ee448e085692fce8e10c9abd09c46617a9c3179ceb147d0cd60a16d0)

### Deployed Stylus contracts (hosted devnet)

Addresses below match the call tree for the sample tx above (Blockscout `/address/...`).

| Contract | Address |
| --- | --- |
| `AccountFactory` | [0x3DF948c956e14175f43670407d5796b95Bb219D8](https://explorer.nexorapq.in/address/0x3DF948c956e14175f43670407d5796b95Bb219D8) |
| `NexoraAccount` (implementation) | [0x4A2bA922052bA54e29c5417bC979Daaf7D5Fe4f4](https://explorer.nexorapq.in/address/0x4A2bA922052bA54e29c5417bC979Daaf7D5Fe4f4) |
| `VerifierRegistry` | [0xe1080224b632a93951a7cfa33eeea9fd81558b5e](https://explorer.nexorapq.in/address/0xe1080224b632a93951a7cfa33eeea9fd81558b5e) |
| `PolicyEngine` | [0x525c2aba45f66987217323e8a05ea400c65d06dc](https://explorer.nexorapq.in/address/0x525c2aba45f66987217323e8a05ea400c65d06dc) |
| `pq-verifier-falcon512` | [0x1294b86822ff4976bfe136cb06cf43ec7fcf2574](https://explorer.nexorapq.in/address/0x1294b86822ff4976bfe136cb06cf43ec7fcf2574) |
| Example smart account (proxy, same tx `to`) | [0xc6c61ba7602a75006d219b07f044afb467a7eddb](https://explorer.nexorapq.in/address/0xc6c61ba7602a75006d219b07f044afb467a7eddb) |

After a fresh deploy, update this table from `deployments.json` / Blockscout.

### Production dashboard env

Build the dashboard for the hosted stack by copying [`dashboard/.env.production.example`](dashboard/.env.production.example) to `dashboard/.env.production` and setting at least:

```bash
NEXT_PUBLIC_NEXORA_RPC_URL=https://blockchain.nexorapq.in
NEXT_PUBLIC_NEXORA_WS_URL=wss://ws.blockchain.nexorapq.in
NEXT_PUBLIC_BLOCKSCOUT_URL=https://explorer.nexorapq.in
```

Optional: set `NEXT_PUBLIC_EXPLORER_URL` to send every in-dashboard “trace ↗” link off-site (see example in the env file). Leave it unset to keep the bespoke PQ verifier trace page as the default target.

### Screenshots

<!-- Add hosted dashboard / trace / Blockscout screenshots here. -->

## Prerequisites

- Node.js >= 20
- pnpm >= 9
- Rust (stable) + `wasm32-unknown-unknown` target
- `cargo stylus` (`cargo install --force cargo-stylus`)
- Foundry (`anvil`, `cast`) for local sanity checks

## Quickstart (local devnet)

```bash
pnpm install
./scripts/dev-up.sh                       # boots Nitro RPC
pnpm --filter wallet-sdk build
DEPLOYER_PRIVATE_KEY=0x... pnpm deploy    # deploys Stylus contracts, writes deployments.json
pnpm dashboard:dev                        # http://localhost:3000
```

Endpoints exposed by the **local** devnet:

| URL                                       | Purpose                                                          |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `http://localhost:3000`                   | Dashboard (key gen, deploy, fund, send, verifier trace panel).   |
| `http://localhost:3000/tx/<hash>`         | In-dashboard tx explorer (receipt + decoded call tree).          |
| `http://localhost:8547`                   | Nitro JSON-RPC (chainId `412346`, Geth `debug_traceTransaction`).|
| `http://localhost:4001`                   | Blockscout v9 (optional, `--profile explorer`; see [docs/blockscout.md](docs/blockscout.md)). |

The dashboard ships its own `/tx/[hash]` route built on
`debug_traceTransaction` (Geth `callTracer`) — no separate Erigon /
Otterscan / Blockscout container is required for the demo. Two env
knobs steer outbound links independently:

- `NEXT_PUBLIC_EXPLORER_URL=https://your-explorer/` *replaces* the
  in-dashboard `/tx/[hash]` route entirely; every "trace ↗" link goes
  off-site.
- `NEXT_PUBLIC_BLOCKSCOUT_URL=https://explorer.nexorapq.in` is
  *additive*: the bespoke verifier-aware page stays primary, every tx
  hash in the UI grows a sibling "Blockscout ↗" chip, and the
  `/tx/[hash]` page gains an "Open in Blockscout ↗" pill plus
  Blockscout deep-links on `From` / `To` / `Block` rows.

The dashboard is the primary demo surface: connect MetaMask, generate a
Falcon-512 keypair in your browser, deploy your smart account, fund it,
and exercise LOW / HIGH / CRITICAL policy bands. After every send the
**Verifier trace** panel calls `debug_traceTransaction` on the Nitro RPC
and surfaces the Falcon-512 `verify(msgHash, sig 666 B, pubkey 897 B)`
call directly from the call tree — including gas used and the boolean
return value. The Falcon-512 wasm bundle ships under
`dashboard/public/wasm/falcon512/`; rebuild only when
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
