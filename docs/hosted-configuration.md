---
description: >-
  Public Nexora devnet URLs, chain parameters, wallet chain-add snippet, and
  dashboard environment variables.
icon: globe
---

# Hosted configuration

This page lists the **hosted Nexora devnet** endpoints and the **dashboard**
environment variables used in production builds. For VPS bring-up (nginx,
TLS, Blockscout hostnames) see [deploy/vps/README.md](../deploy/vps/README.md)
and [Blockscout on the devnet](blockscout.md).

## Public endpoints

Chain behavior matches the Nitro dev profile used locally (`scripts/dev-up.sh`).
The live stack advertises **`chainId` 412346** (`0x64ABA`) via `eth_chainId`.

| Item | Value |
| --- | --- |
| Dashboard | https://www.nexorapq.in |
| JSON-RPC | `https://blockchain.nexorapq.in` |
| WebSocket | `wss://ws.blockchain.nexorapq.in` |
| Blockscout | https://explorer.nexorapq.in |
| Chain name | Nexora Devnet |
| Chain ID | `412346` (`0x64ABA`) |

Parent-chain rollout metadata also appears in [`chain/orbit-config.json`](../chain/orbit-config.json).

## Add the chain in the wallet

Pass something equivalent to:

```json
{
  "chainId": "0x64ABA",
  "chainName": "Nexora Devnet",
  "rpcUrls": ["https://blockchain.nexorapq.in"],
  "blockExplorerUrls": ["https://explorer.nexorapq.in"],
  "nativeCurrency": { "name": "Ether", "symbol": "ETH", "decimals": 18 }
}
```

 (`wallet_addEthereumChain` shape depends on the connector; field names vary slightly.)

## Dashboard build-time env (`dashboard/`)

Copy [`dashboard/.env.production.example`](../dashboard/.env.production.example) to `dashboard/.env.production` for hosted builds. Variables are inlined by Next.js at **`pnpm build`** time.

| Variable | Role |
| --- | --- |
| `NEXT_PUBLIC_NEXORA_RPC_URL` | HTTP JSON-RPC for the browser client |
| `NEXT_PUBLIC_NEXORA_WS_URL` | WebSocket RPC |
| `NEXT_PUBLIC_BLOCKSCOUT_URL` | Adds “Blockscout ↗” chips next to in-app trace links; does not remove the bespoke `/tx/[hash]` view unless you also set explorer replace |
| `NEXT_PUBLIC_EXPLORER_URL` | Optional. If set, replaces in-dashboard `/tx/[hash]` links with `${base}/tx/<hash>` |
| `NEXT_PUBLIC_DEPLOYMENTS` | JSON string of contract addresses (same shape as repo `deployments.json`). Local dev often uses `NEXT_PUBLIC_DEPLOYMENTS=$(cat ../deployments.json) pnpm dev` per [`dashboard/README.md`](../dashboard/README.md) |
| `NEXT_PUBLIC_FALCON512_BROWSER` | Set to `0` to opt **out** of browser wasm and push Falcon signing toward the daemon |
| `NEXT_PUBLIC_FALCON512_SIGNER_URL` | Daemon base URL for PQ signing when wasm is off or unavailable (default `http://127.0.0.1:9090`) |

Implementation references: [`dashboard/lib/nexoraEndpoints.ts`](../dashboard/lib/nexoraEndpoints.ts), [`dashboard/lib/explorer.ts`](../dashboard/lib/explorer.ts), [`dashboard/lib/falcon512Storage.ts`](../dashboard/lib/falcon512Storage.ts).

## Deployed contracts (hosted snapshot)

The root [README](../README.md) keeps a **Deployed Stylus contracts** table with
Blockscout links. Refresh addresses after `scripts/deploy-all.ts` from
`deployments.json` or explorer.

## Policy thresholds (deploy script)

Default demo thresholds are set in [`scripts/deploy-all.ts`](../scripts/deploy-all.ts)
via `NEXORA_POLICY_HIGH_ETH` and `NEXORA_POLICY_CRITICAL_ETH` so dashboard
presets (LOW / HIGH / CRITICAL) classify as intended on a lightly funded
account. Override when deploying your own chain.
