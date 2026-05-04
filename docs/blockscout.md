# Blockscout explorer

Nexora ships an optional Blockscout v9 instance alongside the Nitro
node, served at `explorer.nexorapq.in` on the hosted devnet. It runs
**additively** to the dashboard's bespoke `/tx/[hash]` page (which
decodes the on-chain Falcon-512 verifier call inline from
`debug_traceTransaction`); both views are first-class and the dashboard
links between them.

## What this gives you

| Surface | Source |
|---|---|
| Bespoke verifier-aware tx view (PQ sig size, msg hash, gas, verify -> bool, call tree, named contracts) | `[dashboard/app/tx/[hash]/page.tsx](../dashboard/app/tx/[hash]/page.tsx)` (primary) |
| Block / address / contract browsing, ERC-20/721/1155 token pages, internal txs, search, REST + WebSocket APIs | Blockscout (`explorer.nexorapq.in`) |
| Stylus + Solidity contract source verification UI | Blockscout `smart-contract-verifier` microservice |

The dashboard's existing `trace ↗` links keep their current behaviour;
when `NEXT_PUBLIC_BLOCKSCOUT_URL` is set, components additionally
render a "Blockscout ↗" chip next to each tx hash, and the
`/tx/[hash]` header gains an "Open in Blockscout ↗" pill.

## Local bring-up

```bash
docker compose -f chain/docker-compose.yml up -d                    # Nitro on 127.0.0.1:8547-8548
docker compose -f chain/docker-compose.yml --profile explorer up -d # + Blockscout on 127.0.0.1:4001
docker logs -f nexora-blockscout-backend                            # ~60s for first migrate
open http://localhost:4001
```

For the local dashboard to surface Blockscout chips, point it at the
local proxy:

```bash
NEXT_PUBLIC_BLOCKSCOUT_URL=http://localhost:4001 \
  pnpm --filter @nexora/dashboard dev
```

(Local-only frontend bundle: the backend frontend container is built
to expect `BLOCKSCOUT_PUBLIC_HOST=explorer.nexorapq.in` by default. To
override locally, copy `[chain/.env.example](../chain/.env.example)`
to `chain/.env` and set `BLOCKSCOUT_PUBLIC_HOST=localhost:4001`,
`BLOCKSCOUT_PUBLIC_PROTOCOL=http`, `BLOCKSCOUT_PUBLIC_WS_PROTOCOL=ws`,
then re-`docker compose --profile explorer up -d --force-recreate
blockscout-frontend`.)

## VPS bring-up (`explorer.nexorapq.in`)

Prerequisite: nginx + certbot already configured for
`blockchain.nexorapq.in` (see `[deploy/vps/README.md](../deploy/vps/README.md)`).

1. Add the `explorer.nexorapq.in` A record (see
   `[deploy/vps/DNS.md](../deploy/vps/DNS.md)`).
2. Re-run `bash deploy/vps/apply-nginx.sh` so the new
   `[explorer.nexorapq.in.servers.conf](../deploy/vps/nginx/explorer.nexorapq.in.servers.conf)`
   snippet is installed and included.
3. Bring up the explorer profile:
   ```bash
   cp chain/.env.example chain/.env   # optional; tune values if needed
   docker compose -f chain/docker-compose.yml --profile explorer up -d
   ```
4. Issue / extend TLS:
   ```bash
   sudo certbot --nginx -d blockchain.nexorapq.in \
                        -d ws.blockchain.nexorapq.in \
                        -d explorer.nexorapq.in
   ```
5. Smoke-test:
   ```bash
   curl -fsS https://explorer.nexorapq.in/api/v2/stats
   curl -fsS https://explorer.nexorapq.in | head
   ```

## Wiring the dashboard

Add to the dashboard's build env (`[dashboard/.env.production](../dashboard/.env.production)`
or Vercel project env):

```
NEXT_PUBLIC_BLOCKSCOUT_URL=https://explorer.nexorapq.in
```

Helpers in `[dashboard/lib/explorer.ts](../dashboard/lib/explorer.ts)`:

- `getBlockscoutBase()`, `hasBlockscout()`
- `blockscoutTxUrl(hash)`, `blockscoutAddressUrl(addr)`, `blockscoutBlockUrl(n)`

The wallet's `blockExplorerUrls` (advertised via
`wallet_addEthereumChain`, used by MetaMask's "view tx" button) also
prefers `NEXT_PUBLIC_BLOCKSCOUT_URL` over the older
`NEXT_PUBLIC_EXPLORER_URL` knob — see
`[dashboard/lib/nexoraEndpoints.ts](../dashboard/lib/nexoraEndpoints.ts)`
and `[wallet-sdk/src/chain.ts](../wallet-sdk/src/chain.ts)`.

## Service inventory

`[chain/docker-compose.yml](../chain/docker-compose.yml)` (under
`profiles: ["explorer"]`):

| Service | Image | Purpose |
|---|---|---|
| `blockscout-db` | `postgres:17-alpine` | Indexer storage |
| `blockscout-redis` | `redis:7-alpine` | Cache / pubsub |
| `blockscout-backend` | `ghcr.io/blockscout/blockscout:9.0.2` | Elixir API + indexer |
| `blockscout-frontend` | `ghcr.io/blockscout/frontend:latest` | Next.js UI |
| `blockscout-sig-provider` | `ghcr.io/blockscout/sig-provider:latest` | 4-byte signature lookup |
| `blockscout-smart-contract-verifier` | `ghcr.io/blockscout/smart-contract-verifier:latest` | Solidity / Vyper / Stylus verification |
| `blockscout-visualizer` | `ghcr.io/blockscout/visualizer:latest` | Sol2UML diagrams |
| `blockscout-stats-db` | `postgres:17-alpine` | Stats microservice DB |
| `blockscout-stats` | `ghcr.io/blockscout/stats:latest` | Charts / metrics |
| `blockscout-proxy` | `nginx:1.27-alpine` | Internal /api -> backend, / -> frontend (port `127.0.0.1:4001`) |

All published ports bind to **loopback only**; the host nginx in
`[deploy/vps/nginx/](../deploy/vps/nginx/)` is the sole public ingress.

## Resource sizing

On a single Nitro `--dev` chain (near-empty state):

- Idle RAM: ~900 MB - 1.2 GB across all explorer containers.
- Disk: well under 1 GB for the indexer DB after a full demo session.
- First boot: backend takes ~60 s for `Explorer.ReleaseTasks.create_and_migrate()`
  to provision the schema; `docker logs -f nexora-blockscout-backend`
  shows progress.

## Lean-stack opt-out

If the VPS is RAM-constrained, the lightest functional cut keeps
`blockscout-db`, `blockscout-redis`, `blockscout-backend`,
`blockscout-frontend`, and `blockscout-proxy`:

```bash
docker compose -f chain/docker-compose.yml --profile explorer up -d \
  blockscout-db blockscout-redis blockscout-backend \
  blockscout-frontend blockscout-proxy
```

Effects: contract source verification UI breaks (no
`smart-contract-verifier`), the function-signature decoder falls back
to raw selectors (no `sig-provider`), and the stats / Sol2UML tabs
hide themselves gracefully. Address / tx / block / event browsing all
still work.

## Stylus contract verification (follow-up)

The Stylus + Solidity contracts deployed by
`[scripts/deploy-all.ts](../scripts/deploy-all.ts)` can be uploaded to
the running `smart-contract-verifier` service for source verification.
The Blockscout UI surfaces a "Verify & publish" form on every contract
page; for Stylus, supply the same `Cargo.toml` / `Cargo.lock` /
`rust-toolchain.toml` from `contracts-stylus/` that the demo deployed
from. Out of scope for this PR; tracked alongside the existing
`[falcon-precompile-roadmap.md](./falcon-precompile-roadmap.md)`.

## Why not Otterscan?

Stock Otterscan requires the Erigon-only `erigon_*` and `ots_*` RPC
namespaces, which Nitro does not expose. Blockscout uses the
Geth-compatible API (`eth_*`, `debug_traceTransaction` with
`callTracer`) that Nitro already implements, plus
`CHAIN_TYPE=arbitrum` to unlock Arbitrum-specific UI surfaces.
