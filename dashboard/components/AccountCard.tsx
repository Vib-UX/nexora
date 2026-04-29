"use client";

import { useEffect, useState } from "react";
import { type Address, formatEther, keccak256, bytesToHex, zeroHash } from "viem";
import { useReadContract } from "wagmi";
import { abi } from "@nexora/wallet-sdk";
import type { FalconMockKeypair } from "@nexora/wallet-sdk/signers";
import type { Deployments } from "@/lib/deployments";

interface Props {
  owner: Address;
  balance: { value: bigint; symbol: string } | undefined;
  falconKp: FalconMockKeypair | null;
  deployments: Deployments;
  onDisconnect: () => void;
}

export function AccountCard({ owner, balance, falconKp, deployments, onDisconnect }: Props) {
  const [predicted, setPredicted] = useState<Address | null>(null);
  const pqHash = falconKp ? keccak256(bytesToHex(falconKp.publicKey)) : zeroHash;

  const predict = useReadContract({
    address: deployments.accountFactory,
    abi: abi.accountFactoryAbi,
    functionName: "predictAddress",
    args: [owner, pqHash, zeroHash],
    query: {
      enabled:
        Boolean(falconKp) &&
        deployments.accountFactory !==
          "0x0000000000000000000000000000000000000000",
    },
  });

  useEffect(() => {
    if (predict.data) setPredicted(predict.data as Address);
  }, [predict.data]);

  return (
    <div className="rounded-xl border border-nexora-border bg-nexora-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-zinc-500">
            Connected
          </div>
          <div className="mt-1 font-mono text-sm">{owner}</div>
          <div className="mt-1 text-sm text-zinc-400">
            {balance ? `${formatEther(balance.value)} ${balance.symbol}` : "…"}
          </div>
        </div>
        <button
          className="rounded-md border border-nexora-border px-3 py-1.5 text-xs text-zinc-300 hover:border-nexora-accent"
          onClick={onDisconnect}
        >
          disconnect
        </button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card title="ECDSA owner (k1)">
          <div className="font-mono text-xs text-zinc-300">{owner}</div>
        </Card>
        <Card title="PQ pubkey hash (Falcon-mock)">
          <div className="font-mono text-xs text-zinc-300 break-all">
            {pqHash}
          </div>
        </Card>
        <Card title="Smart account">
          <div className="font-mono text-xs text-zinc-300">
            {predicted ?? "not yet deployed"}
          </div>
        </Card>
        <Card title="Verifier registry">
          <div className="font-mono text-xs text-zinc-300">
            {deployments.verifierRegistry}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-nexora-border bg-zinc-900/30 p-4">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">
        {title}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}
