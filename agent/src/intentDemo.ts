import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type Address,
  type Hex,
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  parseEther,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { NEXORA_CHAIN, NexoraClient, VerifierScheme } from "@nexora/wallet-sdk";
import {
  falconMockKeypairFromSeed,
  loadFalcon512Keypair,
} from "@nexora/wallet-sdk/signers";
import { StaticIntentProvider, type Intent } from "./intentProvider.js";

interface Deployments {
  chainId: number;
  pqVerifier: Address;
  pqVerifierFalcon512?: Address;
  verifierRegistry: Address;
  policyEngine: Address;
  accountImplementation: Address;
  accountFactory: Address;
  bridgeMock: Address;
  account?: Address;
}

const ROOT = resolve(import.meta.dirname ?? __dirname, "../..");

function loadDeployments(): Deployments {
  const path = resolve(ROOT, "deployments.json");
  return JSON.parse(readFileSync(path, "utf8")) as Deployments;
}

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env: ${name}`);
  return v;
}

async function main() {
  const deployments = loadDeployments();
  if (!deployments.account) {
    throw new Error("deployments.json missing `account` — deploy a wallet first");
  }
  const ownerKey = need("OWNER_PRIVATE_KEY") as Hex;
  const owner = privateKeyToAccount(ownerKey);

  const rpcUrl = process.env.NEXORA_RPC_URL ?? "http://localhost:8547";
  const publicClient = createPublicClient({
    chain: NEXORA_CHAIN,
    transport: http(rpcUrl),
  });
  const walletClient = createWalletClient({
    account: owner,
    chain: NEXORA_CHAIN,
    transport: http(rpcUrl),
  });

  // Choose PQ verifier scheme via FALCON_SCHEME env (1 = FALCON_MOCK, 2 = FALCON_512).
  // For scheme 2 the agent talks to the local `falcon-signer` daemon
  // (default URL http://127.0.0.1:9090, override via FALCON_SIGNER_URL).
  const schemeNum = Number(process.env.FALCON_SCHEME ?? VerifierScheme.FalconMock);
  const scheme: VerifierScheme =
    schemeNum === VerifierScheme.Falcon512
      ? VerifierScheme.Falcon512
      : VerifierScheme.FalconMock;
  const signerUrl = process.env.FALCON_SIGNER_URL ?? "http://127.0.0.1:9090";

  let pqKeypair;
  if (scheme === VerifierScheme.Falcon512) {
    console.log(`[nexora-agent] PQ scheme=Falcon-512 (real)  signer=${signerUrl}`);
    pqKeypair = await loadFalcon512Keypair({ signerUrl });
  } else {
    console.log(`[nexora-agent] PQ scheme=FALCON_MOCK (1)`);
    const seed = new Uint8Array(32);
    seed.fill(0x42);
    pqKeypair = falconMockKeypairFromSeed(seed);
  }

  const client = new NexoraClient({
    publicClient,
    walletClient,
    account: deployments.account,
    policyEngine: deployments.policyEngine,
    owner,
    pqKeypair,
    scheme,
    falcon512: { signerUrl },
    relayerUrl: process.env.RELAYER_URL,
  });

  const intents: Intent[] = [
    {
      id: keccak256(toHex("agent.demo:transfer")),
      description: "LOW — small ETH transfer (ECDSA only)",
      target: deployments.bridgeMock,
      value: parseEther("0.001"),
      callData: "0x",
    },
    {
      id: keccak256(toHex("agent.demo:bridge-withdraw")),
      description: "HIGH — bridge withdrawal (ECDSA + PQ)",
      target: deployments.bridgeMock,
      value: parseEther("5"),
      callData: "0xa1b2c3d4",
    },
    {
      id: keccak256(toHex("agent.demo:critical-rotate")),
      description: "CRITICAL — large treasury move (PQ + timelock channel)",
      target: deployments.bridgeMock,
      value: parseEther("250"),
      callData: "0xdeadbeef",
    },
  ];

  const provider = new StaticIntentProvider(intents);

  console.log("\n[nexora-agent] starting intent walk-through\n");
  console.log(
    `  account=${deployments.account}\n  policy=${deployments.policyEngine}\n  rpc=${rpcUrl}\n`,
  );

  while (true) {
    const intent = await provider.next();
    if (!intent) break;
    console.log(`> intent ${intent.id.slice(0, 10)}…  ${intent.description}`);
    try {
      const signed = await client.prepare({
        target: intent.target,
        value: intent.value,
        callData: intent.callData,
      });
      const tagName = ["LOW", "HIGH", "CRITICAL"][signed.tag] ?? "?";
      console.log(
        `  classified=${tagName}  opHash=${signed.opHash.slice(0, 10)}…`,
      );
      const txHash = await client.submit(signed);
      console.log(`  tx=${txHash}\n`);
      await publicClient.waitForTransactionReceipt({ hash: txHash });
    } catch (err) {
      console.log(`  error: ${(err as Error).message}\n`);
    }
  }

  console.log("[nexora-agent] done.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
