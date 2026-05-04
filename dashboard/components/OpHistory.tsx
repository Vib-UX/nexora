"use client";

import { useEffect, useState } from "react";
import { type Address, type Hex, formatEther } from "viem";
import { usePublicClient } from "wagmi";
import { abi } from "@nexora/wallet-sdk";
import type { Deployments } from "@/lib/deployments";
import { txUrl as explorerTxUrl, blockscoutTxUrl } from "@/lib/explorer";

interface Entry {
  txHash: Hex;
  blockNumber: bigint;
  sender: Address;
  opHash: Hex;
  policyTag: number;
  scheme: number;
  success: boolean;
}

const TAG_CLASS = ["tag-low", "tag-high", "tag-critical"];
const TAG_LABEL = ["LOW", "HIGH", "CRITICAL"];

export function OpHistory({ deployments }: { deployments: Deployments }) {
  const client = usePublicClient();
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    let unwatch: (() => void) | undefined;

    (async () => {
      try {
        const block = await client.getBlockNumber();
        const fromBlock = block > 5_000n ? block - 5_000n : 0n;
        const logs = await client.getContractEvents({
          abi: abi.nexoraAccountAbi,
          eventName: "UserOpExecuted",
          fromBlock,
        });
        if (cancelled) return;
        setEntries(
          logs.map((l) => ({
            txHash: l.transactionHash!,
            blockNumber: l.blockNumber!,
            sender: l.args.sender!,
            opHash: l.args.opHash!,
            policyTag: Number(l.args.policyTag ?? 0),
            scheme: Number(l.args.verifierScheme ?? 0),
            success: Boolean(l.args.success),
          })),
        );

        unwatch = client.watchContractEvent({
          abi: abi.nexoraAccountAbi,
          eventName: "UserOpExecuted",
          onLogs: (newLogs) => {
            setEntries((prev) => [
              ...newLogs.map((l) => ({
                txHash: l.transactionHash!,
                blockNumber: l.blockNumber!,
                sender: l.args.sender!,
                opHash: l.args.opHash!,
                policyTag: Number(l.args.policyTag ?? 0),
                scheme: Number(l.args.verifierScheme ?? 0),
                success: Boolean(l.args.success),
              })),
              ...prev,
            ]);
          },
        });
      } catch {
        // ignore — chain may not be reachable yet.
      }
    })();

    return () => {
      cancelled = true;
      unwatch?.();
    };
  }, [client]);

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-nexora-border bg-nexora-card p-6 text-sm text-zinc-500">
        No operations yet. Try the Send transaction form.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-nexora-border bg-nexora-card p-6">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
        Op history
      </h3>
      <div className="mt-4 divide-y divide-nexora-border">
        {entries.map((e) => (
          <div key={e.txHash} className="flex items-center justify-between gap-3 py-2 text-xs">
            <div className="font-mono">
              <div className="text-zinc-300">{shorten(e.opHash)}</div>
              <div className="text-zinc-600">block {e.blockNumber.toString()}</div>
            </div>
            <span className={`rounded px-2 py-1 ${TAG_CLASS[e.policyTag] ?? ""}`}>
              {TAG_LABEL[e.policyTag] ?? "?"}
            </span>
            <span className="font-mono text-zinc-500">scheme={e.scheme}</span>
            <span
              className={`rounded px-2 py-1 ${
                e.success ? "tag-low" : "tag-critical"
              }`}
            >
              {e.success ? "ok" : "revert"}
            </span>
            <a
              href={explorerTxUrl(e.txHash)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[10px] text-zinc-400 hover:text-nexora-accent"
              title={`open trace for ${e.txHash}`}
            >
              trace ↗
            </a>
            {(() => {
              const bs = blockscoutTxUrl(e.txHash);
              return bs ? (
                <a
                  href={bs}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[10px] text-zinc-500 hover:text-nexora-accent"
                  title={`open ${e.txHash} on Blockscout`}
                >
                  Blockscout ↗
                </a>
              ) : null;
            })()}
          </div>
        ))}
      </div>
    </div>
  );
}

function shorten(h: string): string {
  return `${h.slice(0, 10)}…${h.slice(-6)}`;
}
// formatEther is exported for potential future per-row value displays.
void formatEther;
