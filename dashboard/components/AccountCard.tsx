"use client";

import { type Address, formatEther } from "viem";
import { NEXORA_CHAIN } from "@nexora/wallet-sdk";

interface Props {
  owner: Address;
  balance: { value: bigint; symbol: string } | undefined;
  onDisconnect: () => void;
}

/**
 * Compact summary of the connected wallet. Heavy onboarding state lives in
 * the dedicated Keygen / Deploy / Fund cards.
 */
export function AccountCard({ owner, balance, onDisconnect }: Props) {
  return (
    <div className="rounded-xl border border-nexora-border bg-nexora-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-zinc-500">
            Connected (EOA)
          </div>
          <div className="mt-1 break-all font-mono text-sm">{owner}</div>
          <div className="mt-1 text-sm text-zinc-400">
            {balance
              ? `${formatEther(balance.value)} ${balance.symbol}`
              : "…"}{" "}
            · chain {NEXORA_CHAIN.id}
          </div>
        </div>
        <button
          className="rounded-md border border-nexora-border px-3 py-1.5 text-xs text-zinc-300 hover:border-nexora-accent"
          onClick={onDisconnect}
        >
          disconnect
        </button>
      </div>
    </div>
  );
}
