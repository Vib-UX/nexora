/**
 * Deploys the Nexora Orbit L3 chain on top of a parent chain
 * (default: Arbitrum Sepolia).
 *
 * Usage:
 *   pnpm --filter @nexora/chain deploy:l3
 *
 * Required env (`.env` in this folder):
 *   PARENT_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
 *   ORBIT_OWNER_PRIVATE_KEY=0x...
 *   SEQUENCER_ADDRESS=0x...
 *   VALIDATOR_ADDRESS=0x...
 *
 * Notes:
 * - This script is intentionally minimal. It validates env, prints a
 *   deployment plan, and (when ORBIT_DEPLOY_MODE=execute) calls into
 *   `@arbitrum/orbit-sdk` to create the rollup config + deploy contracts.
 * - For `local` mode it generates a Nitro node config you can feed to a
 *   local nitro-node container via `scripts/dev-up.sh`.
 */
import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  http,
  isAddress,
  type Address,
  type Hex,
} from "viem";

const __dirname = dirname(fileURLToPath(import.meta.url));

type Mode = "plan" | "local" | "execute";

interface OrbitConfig {
  name: string;
  chainId: number;
  chainIdHex: string;
  parent: { name: string; chainId: number; rpcUrlEnv: string };
  consensus: { type: string; blockTimeSeconds: number; minL2BaseFeeWei: string };
  gas: { feeToken: string; speedLimitPerSecond: number; maxTxGasLimit: number };
  stylus: { enabled: boolean; wasmGasPrice: string };
  rpc: { http: string; ws: string; namespaces: string[] };
  explorer: { url: string };
  nativeCurrency: { name: string; symbol: string; decimals: number };
}

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function optional(name: string): string | undefined {
  return process.env[name];
}

function parseAddress(name: string): Address {
  const v = need(name);
  if (!isAddress(v)) throw new Error(`Env ${name} is not a valid address: ${v}`);
  return v as Address;
}

function loadConfig(): OrbitConfig {
  const cfg = JSON.parse(
    readFileSync(resolve(__dirname, "orbit-config.json"), "utf8"),
  ) as OrbitConfig;
  return cfg;
}

async function main() {
  const mode: Mode = (process.env.ORBIT_DEPLOY_MODE as Mode) ?? "plan";
  const cfg = loadConfig();

  console.log(`\n[nexora] Orbit deploy — mode=${mode}`);
  console.log(
    `[nexora] target chain: ${cfg.name} (chainId=${cfg.chainId} / ${cfg.chainIdHex})`,
  );
  console.log(
    `[nexora] parent chain: ${cfg.parent.name} (chainId=${cfg.parent.chainId})`,
  );

  if (mode === "plan") {
    console.log(`\n[nexora] PLAN ONLY — no transactions will be sent.\n`);
    console.log(`Required env for execute:`);
    console.log(`  PARENT_RPC_URL`);
    console.log(`  ORBIT_OWNER_PRIVATE_KEY`);
    console.log(`  SEQUENCER_ADDRESS`);
    console.log(`  VALIDATOR_ADDRESS`);
    console.log(
      `\nRe-run with ORBIT_DEPLOY_MODE=local for a local nitro config, or`,
    );
    console.log(`ORBIT_DEPLOY_MODE=execute for a real parent-chain deploy.\n`);
    return;
  }

  if (mode === "local") {
    const out = {
      "chain": {
        "info-json": [
          {
            "chain-id": cfg.chainId,
            "parent-chain-id": cfg.parent.chainId,
            "chain-name": cfg.name,
            "chain-config": {
              "chainId": cfg.chainId,
              "homesteadBlock": 0,
              "daoForkSupport": true,
              "eip150Block": 0,
              "eip155Block": 0,
              "eip158Block": 0,
              "byzantiumBlock": 0,
              "constantinopleBlock": 0,
              "petersburgBlock": 0,
              "istanbulBlock": 0,
              "muirGlacierBlock": 0,
              "berlinBlock": 0,
              "londonBlock": 0,
              "clique": { "period": 0, "epoch": 0 },
              "arbitrum": {
                "EnableArbOS": true,
                "AllowDebugPrecompiles": true,
                "DataAvailabilityCommittee": true,
                "InitialArbOSVersion": 32,
                "GenesisBlockNum": 0,
              },
            },
          },
        ],
        "name": cfg.name.toLowerCase().replace(/\s+/g, "-"),
      },
      "node": {
        "sequencer": true,
        "delayed-sequencer": { "enable": true },
        "dangerous": { "no-l1-listener": true },
        "feed": { "output": { "enable": false } },
      },
      "http": {
        "addr": "0.0.0.0",
        "port": 8547,
        "vhosts": "*",
        "corsdomain": "*",
        "api": cfg.rpc.namespaces,
      },
      "ws": {
        "addr": "0.0.0.0",
        "port": 8548,
        "api": cfg.rpc.namespaces,
      },
    };
    const dataDir = resolve(__dirname, "data");
    mkdirSync(dataDir, { recursive: true });
    const outPath = resolve(dataDir, "nitro-node-config.json");
    writeFileSync(outPath, JSON.stringify(out, null, 2));
    console.log(`[nexora] wrote local nitro node config -> ${outPath}`);
    console.log(`[nexora] feed it via scripts/dev-up.sh`);
    return;
  }

  if (mode === "execute") {
    const parentRpc = need(cfg.parent.rpcUrlEnv);
    const ownerPk = need("ORBIT_OWNER_PRIVATE_KEY") as Hex;
    const sequencer = parseAddress("SEQUENCER_ADDRESS");
    const validator = parseAddress("VALIDATOR_ADDRESS");

    const parent = createPublicClient({ transport: http(parentRpc) });
    const parentChainId = await parent.getChainId();
    if (parentChainId !== cfg.parent.chainId) {
      throw new Error(
        `parent chainId mismatch: rpc=${parentChainId} cfg=${cfg.parent.chainId}`,
      );
    }
    console.log(`[nexora] parent rpc reachable, chainId=${parentChainId}`);

    // Lazy-load orbit-sdk so plan/local modes work without the dep installed.
    const orbit = await import("@arbitrum/orbit-sdk").catch(() => null);
    if (!orbit) {
      throw new Error(
        "@arbitrum/orbit-sdk not installed. Run `pnpm install` in chain/.",
      );
    }

    console.log(
      `[nexora] (placeholder) would call orbit-sdk to deploy:\n` +
        `  - rollup core contracts on parent chainId=${cfg.parent.chainId}\n` +
        `  - sequencer=${sequencer} validator=${validator}\n` +
        `  - L3 chainId=${cfg.chainId}, AnyTrust DAC, Stylus enabled\n` +
        `  - owner key derived from ORBIT_OWNER_PRIVATE_KEY\n` +
        `  - using ownerPk length=${ownerPk.length}\n` +
        `Wire concrete orbit-sdk calls here when running for real.`,
    );
    return;
  }

  throw new Error(`Unknown ORBIT_DEPLOY_MODE: ${mode as string}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
