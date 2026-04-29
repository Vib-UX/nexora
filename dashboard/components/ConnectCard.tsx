"use client";

import type { Connector } from "wagmi";
import type { Deployments } from "@/lib/deployments";
import { ADD_CHAIN_PARAMS } from "@nexora/wallet-sdk";

interface Props {
  connectors: readonly Connector[];
  connect: (args: { connector: Connector }) => void;
  deployments: Deployments;
}

export function ConnectCard({ connectors, connect, deployments }: Props) {
  return (
    <div className="rounded-xl border border-nexora-border bg-nexora-card p-8">
      <h2 className="text-2xl font-semibold tracking-tight">
        Connect to Nexora
      </h2>
      <p className="mt-2 text-sm text-zinc-400">
        Hybrid ECDSA + post-quantum smart wallet on a custom Arbitrum Orbit
        chain. Connect a standard EVM wallet to get started.
      </p>

      <div className="mt-6 space-y-2">
        {connectors.map((c) => (
          <button
            key={c.uid}
            className="w-full rounded-md border border-nexora-border bg-zinc-900/40 px-4 py-3 text-left text-sm hover:border-nexora-accent hover:text-nexora-accent"
            onClick={() => connect({ connector: c })}
          >
            {c.name}
          </button>
        ))}
        <button
          className="w-full rounded-md border border-dashed border-nexora-border px-4 py-3 text-left text-sm text-zinc-400 hover:text-zinc-100"
          onClick={async () => {
            const eth = (window as unknown as { ethereum?: { request: (args: unknown) => Promise<unknown> } })
              .ethereum;
            if (!eth) return alert("No injected wallet found.");
            await eth.request({
              method: "wallet_addEthereumChain",
              params: [ADD_CHAIN_PARAMS],
            });
          }}
        >
          + add Nexora Devnet to wallet
        </button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 text-xs text-zinc-500 font-mono">
        <Row label="ChainId" value={`${deployments.chainId} (0x${deployments.chainId.toString(16)})`} />
        <Row label="Verifier registry" value={deployments.verifierRegistry} />
        <Row label="Policy engine" value={deployments.policyEngine} />
        <Row label="Account factory" value={deployments.accountFactory} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-zinc-600">{label}</div>
      <div className="truncate text-zinc-400">{value}</div>
    </div>
  );
}
