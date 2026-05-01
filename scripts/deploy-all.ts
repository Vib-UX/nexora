/**
 * Deploys all Nexora Stylus contracts to the local devnet, wires them
 * together, and writes deployments.json at repo root.
 *
 * Order:
 *   1. pq-verifier         (scheme 1, FALCON_MOCK)
 *   2. verifier-registry   + setVerifier(1, pqVerifier)
 *   3. policy-engine
 *   4. nexora-account      (singleton implementation)
 *   5. account-factory     (init -> impl, registry, policy)
 *   6. bridge placeholder  (deployer stand-in for HIGH-op targets)
 *
 * The actual Stylus deployment is delegated to `cargo stylus deploy`
 * from each contract crate; this script orchestrates the calls and
 * post-deploy wiring transactions via viem.
 */
import "dotenv/config";
import {
  execFileSync,
  execSync,
} from "node:child_process";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Address,
  type Hex,
  concat,
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  http,
  keccak256,
  parseAbiParameters,
  parseEther,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const RPC_URL = process.env.NEXORA_RPC_URL ?? "http://localhost:8547";
const DEPLOYER_PRIVATE_KEY = (process.env.DEPLOYER_PRIVATE_KEY ?? "") as Hex;

if (!DEPLOYER_PRIVATE_KEY) {
  console.error("DEPLOYER_PRIVATE_KEY is required.");
  process.exit(1);
}

import { NEXORA_CHAIN, abi } from "@nexora/wallet-sdk";
import {
  falconMockKeypairFromSeed,
  falconPubkeyCommitment,
} from "@nexora/wallet-sdk/signers";
import { zeroHash } from "viem";

const deployer = privateKeyToAccount(DEPLOYER_PRIVATE_KEY);
const publicClient = createPublicClient({ chain: NEXORA_CHAIN, transport: http(RPC_URL) });
const walletClient = createWalletClient({
  account: deployer,
  chain: NEXORA_CHAIN,
  transport: http(RPC_URL),
});

interface Deployment {
  chainId: number;
  pqVerifier: Address;
  pqVerifierFalcon512: Address;
  verifierRegistry: Address;
  policyEngine: Address;
  accountImplementation: Address;
  accountFactory: Address;
  bridgeMock: Address;
  deployer: Address;
  account?: Address;
  pqPubkeyHash?: Hex;
}

const STYLUS_CRATES: Array<{ name: string; wasm: string; key: keyof Deployment }> = [
  { name: "pq-verifier", wasm: "nexora_pq_verifier.wasm", key: "pqVerifier" },
  {
    name: "pq-verifier-falcon512",
    wasm: "nexora_pq_verifier_falcon512.wasm",
    key: "pqVerifierFalcon512",
  },
  { name: "verifier-registry", wasm: "nexora_verifier_registry.wasm", key: "verifierRegistry" },
  { name: "policy-engine", wasm: "nexora_policy_engine.wasm", key: "policyEngine" },
  { name: "nexora-account", wasm: "nexora_account.wasm", key: "accountImplementation" },
  { name: "account-factory", wasm: "nexora_account_factory.wasm", key: "accountFactory" },
];

function buildAllWasm() {
  console.log("[deploy] cargo build --release --target wasm32-unknown-unknown");
  execSync(
    "cargo build --release --target wasm32-unknown-unknown",
    { cwd: ROOT, stdio: "inherit" },
  );
}

function deployStylusContract(crate: { name: string; wasm: string }): Address {
  const wasmPath = resolve(ROOT, "target/wasm32-unknown-unknown/release", crate.wasm);
  console.log(`\n[deploy] cargo stylus deploy --wasm-file ${crate.wasm}`);
  const out = execFileSync(
    "cargo",
    [
      "stylus",
      "deploy",
      "-e",
      RPC_URL,
      "--private-key",
      DEPLOYER_PRIVATE_KEY,
      "--no-verify",
      "--wasm-file",
      wasmPath,
    ],
    {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "inherit"],
      encoding: "utf8",
    },
  );
  // Strip ANSI escapes (cargo-stylus colorizes its output even when piped).
  const clean = out.replace(/\u001b\[[0-9;]*m/g, "");
  const m = clean.match(/deployed code at address:\s*(0x[0-9a-fA-F]{40})/);
  if (!m) {
    console.error(out);
    throw new Error(`could not parse deployment address for ${crate.name}`);
  }
  return m[1] as Address;
}

async function main() {
  const chainId = await publicClient.getChainId();
  console.log(`[deploy] chainId=${chainId} deployer=${deployer.address}`);

  const addresses: Partial<Deployment> = {
    chainId,
    deployer: deployer.address,
  };

  buildAllWasm();

  for (const c of STYLUS_CRATES) {
    (addresses as Record<keyof Deployment, Address | number | undefined>)[c.key] =
      deployStylusContract(c);
  }

  // Bridge target stand-in — use deployer address until a bridge contract exists.
  // Replace with a deployed contract once we have one.
  addresses.bridgeMock = deployer.address;

  const dep = addresses as Deployment;
  console.log("\n[deploy] addresses");
  console.table(dep);

  // ---- Wiring ----------------------------------------------------------
  console.log("\n[deploy] wiring contracts...");

  // 1. PqVerifier.init(deployer, true)            (scheme 1, FALCON_MOCK)
  await call(
    dep.pqVerifier,
    "init(address,bool)",
    encode(["address", "bool"], [deployer.address, true]),
  );

  // 1b. PqVerifierFalcon512.init(deployer)         (scheme 2, FALCON_512)
  await call(
    dep.pqVerifierFalcon512,
    "init(address)",
    encode(["address"], [deployer.address]),
  );

  // 2. VerifierRegistry.init(deployer)
  await call(
    dep.verifierRegistry,
    "init(address)",
    encode(["address"], [deployer.address]),
  );

  // 3a. VerifierRegistry.setVerifier(FALCON_MOCK = 1, pqVerifier)
  await call(
    dep.verifierRegistry,
    "setVerifier(uint16,address)",
    encode(["uint16", "address"], [1, dep.pqVerifier]),
  );

  // 3b. VerifierRegistry.setVerifier(FALCON_512 = 2, pqVerifierFalcon512)
  await call(
    dep.verifierRegistry,
    "setVerifier(uint16,address)",
    encode(["uint16", "address"], [2, dep.pqVerifierFalcon512]),
  );

  // 4. PolicyEngine.init(deployer)
  await call(
    dep.policyEngine,
    "init(address)",
    encode(["address"], [deployer.address]),
  );

  // 5. PolicyEngine.setThresholds(1 ether, 100 ether) — explicit so the
  //    demo's intents land in the expected bands.
  await call(
    dep.policyEngine,
    "setThresholds(uint256,uint256)",
    encode(
      ["uint256", "uint256"],
      [parseEther("1"), parseEther("100")],
    ),
  );

  // 6. AccountFactory.init(owner, impl, registry, policy)
  await call(
    dep.accountFactory,
    "init(address,address,address,address)",
    encode(
      ["address", "address", "address", "address"],
      [
        deployer.address,
        dep.accountImplementation,
        dep.verifierRegistry,
        dep.policyEngine,
      ],
    ),
  );

  // 7. (optional) Pre-create a scheme-1 demo account for `pnpm agent:demo`.
  //    The dashboard NEVER consumes this account — it always derives a
  //    fresh predicted address from the user's Falcon-512 public key. We
  //    only persist it under `deployments.json` (root) for the agent demo.
  if (process.env.NEXORA_SKIP_AGENT_ACCOUNT !== "1") {
    const seed = new Uint8Array(32).fill(0x42);
    const falconKp = falconMockKeypairFromSeed(seed);
    const pqPubkeyHash = falconPubkeyCommitment(falconKp.publicKey);
    console.log(
      `\n[deploy] creating agent-demo account (pqPubkeyHash=${pqPubkeyHash})`,
    );

    const predicted = (await publicClient.readContract({
      address: dep.accountFactory,
      abi: abi.accountFactoryAbi,
      functionName: "predictAddress",
      args: [deployer.address, pqPubkeyHash, zeroHash],
    })) as Address;
    console.log(`  predicted account = ${predicted}`);

    const createTx = await walletClient.writeContract({
      address: dep.accountFactory,
      abi: abi.accountFactoryAbi,
      functionName: "createAccount",
      args: [deployer.address, pqPubkeyHash, zeroHash],
    });
    await publicClient.waitForTransactionReceipt({ hash: createTx });
    console.log(`  created via ${createTx}`);

    // Fund the account so it can pay out value. We call the wallet's
    // payable `fund()` method since stylus 0.6 doesn't support
    // `receive()`.
    const fundSelector = (keccak256(toHex("fund()")) as Hex).slice(0, 10) as Hex;
    const fundTx = await walletClient.sendTransaction({
      to: predicted,
      value: parseEther("500"),
      data: fundSelector,
    });
    await publicClient.waitForTransactionReceipt({ hash: fundTx });
    console.log(`  funded with 500 ETH (${fundTx})`);

    dep.account = predicted;
    dep.pqPubkeyHash = pqPubkeyHash;
  } else {
    console.log("\n[deploy] skipping agent-demo account (NEXORA_SKIP_AGENT_ACCOUNT=1)");
  }

  // ---- Persist ---------------------------------------------------------
  const outDir = ROOT;
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(
    resolve(outDir, "deployments.json"),
    JSON.stringify(dep, null, 2),
  );
  console.log(`\n[deploy] wrote ${resolve(outDir, "deployments.json")}`);

  const dashboardPublic = resolve(ROOT, "dashboard/public/deployments.json");
  try {
    const {
      pqVerifier,
      pqVerifierFalcon512,
      verifierRegistry,
      policyEngine,
      accountImplementation,
      accountFactory,
      bridgeMock,
    } = dep;
    // Intentionally exclude `account` and `pqPubkeyHash`: the dashboard
    // brings its own Falcon-512 keys and derives a fresh address via
    // `AccountFactory.predict_address`. Pre-baking an address here would
    // re-introduce the "demo account" that the user can never re-deploy
    // from their browser keypair.
    writeFileSync(
      dashboardPublic,
      JSON.stringify(
        {
          chainId: dep.chainId,
          pqVerifier,
          pqVerifierFalcon512,
          verifierRegistry,
          policyEngine,
          accountImplementation,
          accountFactory,
          bridgeMock,
        },
        null,
        2,
      ),
    );
    console.log(`[deploy] synced dashboard/public/deployments.json`);
  } catch (e) {
    console.warn("[deploy] could not write dashboard/public/deployments.json", e);
  }
}

// Minimal selector+data assembly so we don't need typechain.
async function call(to: Address, signature: string, dataNoSelector: Hex) {
  const selector = (keccak256(toHex(signature)) as Hex).slice(0, 10) as Hex;
  const data = concat([selector, dataNoSelector]);
  const hash = await walletClient.sendTransaction({ to, data });
  console.log(`  -> ${signature} via ${hash}`);
  await publicClient.waitForTransactionReceipt({ hash });
}

function encode(types: string[], values: unknown[]): Hex {
  return encodeAbiParameters(parseAbiParameters(types.join(",")), values as never);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
