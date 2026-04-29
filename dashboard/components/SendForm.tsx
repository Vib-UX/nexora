"use client";

import { useMemo, useState } from "react";
import {
  type Address,
  type Hex,
  parseEther,
  isAddress,
  isHex,
  zeroHash,
} from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import {
  NexoraClient,
  PolicyTag,
  abi,
} from "@nexora/wallet-sdk";
import type { FalconMockKeypair } from "@nexora/wallet-sdk/signers";
import type { Deployments } from "@/lib/deployments";

interface Props {
  owner: Address;
  falconKp: FalconMockKeypair | null;
  deployments: Deployments;
}

const TAG_LABEL: Record<number, string> = {
  0: "LOW (ECDSA only)",
  1: "HIGH (ECDSA + PQ)",
  2: "CRITICAL (PQ + timelock)",
};

const TAG_CLASS: Record<number, string> = {
  0: "tag-low",
  1: "tag-high",
  2: "tag-critical",
};

export function SendForm({ owner, falconKp, deployments }: Props) {
  const { connector } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [target, setTarget] = useState<string>(deployments.bridgeMock);
  const [valueEth, setValueEth] = useState<string>("0.001");
  const [callData, setCallData] = useState<string>("0x");
  const [status, setStatus] = useState<string>("idle");
  const [tag, setTag] = useState<number | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);

  const ownerAccount = useMemo(() => walletClient?.account, [walletClient]);

  async function preview() {
    if (!publicClient || !isAddress(target)) return;
    const value = parseEth(valueEth);
    const data = (isHex(callData) ? callData : "0x") as Hex;
    const out = (await publicClient.readContract({
      address: deployments.policyEngine,
      abi: abi.policyEngineAbi,
      functionName: "classify",
      args: [owner, target as Address, value, data],
    })) as number;
    setTag(out);
  }

  async function send() {
    if (!walletClient || !ownerAccount || !falconKp || !publicClient) return;
    if (!isAddress(target)) {
      setStatus("invalid target");
      return;
    }
    setStatus("preparing");
    try {
      const client = new NexoraClient({
        publicClient,
        walletClient,
        account: deployments.accountFactory, // placeholder until wallet is created
        policyEngine: deployments.policyEngine,
        owner: ownerAccount,
        pqKeypair: falconKp,
      });
      const { txHash } = await client.execute({
        target: target as Address,
        value: parseEth(valueEth),
        callData: (isHex(callData) ? callData : "0x") as Hex,
      });
      setTxHash(txHash);
      setStatus("submitted");
    } catch (e) {
      setStatus(`error: ${(e as Error).message}`);
    }
  }

  return (
    <div className="rounded-xl border border-nexora-border bg-nexora-card p-6">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
        Send transaction
      </h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Target">
          <input
            className="w-full rounded-md border border-nexora-border bg-zinc-950 px-3 py-2 font-mono text-xs"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="0x..."
          />
        </Field>
        <Field label="Value (ETH)">
          <input
            className="w-full rounded-md border border-nexora-border bg-zinc-950 px-3 py-2 font-mono text-xs"
            value={valueEth}
            onChange={(e) => setValueEth(e.target.value)}
            placeholder="0.001"
          />
        </Field>
        <Field label="Calldata (hex)">
          <input
            className="w-full rounded-md border border-nexora-border bg-zinc-950 px-3 py-2 font-mono text-xs"
            value={callData}
            onChange={(e) => setCallData(e.target.value)}
          />
        </Field>
        <Field label="Predicted tag">
          {tag === null ? (
            <span className="text-xs text-zinc-500">— preview to classify</span>
          ) : (
            <span className={`inline-block rounded-md px-2 py-1 text-xs ${TAG_CLASS[tag]}`}>
              {TAG_LABEL[tag]}
            </span>
          )}
        </Field>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          className="rounded-md border border-nexora-border px-4 py-2 text-sm hover:border-nexora-accent"
          onClick={preview}
        >
          Classify
        </button>
        <button
          className="rounded-md bg-nexora-accent px-4 py-2 text-sm font-medium text-white"
          onClick={send}
          disabled={!walletClient || !connector}
        >
          Sign &amp; send
        </button>
        <span className="text-xs text-zinc-500 font-mono">{status}</span>
      </div>

      {txHash && (
        <div className="mt-4 break-all rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 font-mono text-xs text-emerald-300">
          tx: {txHash}
        </div>
      )}

      <div className="mt-4 text-xs text-zinc-500">
        <span className={`mr-1 inline-block rounded px-1.5 py-0.5 ${TAG_CLASS[PolicyTag.Low]}`}>LOW</span>
        ECDSA only ·
        <span className={`mx-1 inline-block rounded px-1.5 py-0.5 ${TAG_CLASS[PolicyTag.High]}`}>HIGH</span>
        ECDSA + PQ ·
        <span className={`ml-1 inline-block rounded px-1.5 py-0.5 ${TAG_CLASS[PolicyTag.Critical]}`}>CRITICAL</span>
        PQ + 60s timelock
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-500">
      <span className="uppercase tracking-wider">{label}</span>
      {children}
    </label>
  );
}

function parseEth(s: string): bigint {
  if (!s) return 0n;
  try {
    return parseEther(s as `${number}`);
  } catch {
    return 0n;
  }
}

// Anchors zeroHash so the tag class doesn't get tree-shaken when CSS
// is generated only from JS (Tailwind safelisting is handled in CSS).
void zeroHash;
