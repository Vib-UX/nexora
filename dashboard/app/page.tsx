"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useBalance,
  useChainId,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { ConnectCard } from "@/components/ConnectCard";
import { AccountCard } from "@/components/AccountCard";
import { SendForm } from "@/components/SendForm";
import { OpHistory } from "@/components/OpHistory";
import { useDeployments } from "@/lib/useDeployments";
import { loadOrCreateFalconKeypair } from "@/lib/falconStorage";
import type { FalconMockKeypair } from "@nexora/wallet-sdk/signers";
import { NEXORA_CHAIN } from "@nexora/wallet-sdk";

export default function Home() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const balance = useBalance({ address });
  const { deployments } = useDeployments();
  const [falconKp, setFalconKp] = useState<FalconMockKeypair | null>(null);

  useEffect(() => {
    setFalconKp(loadOrCreateFalconKeypair());
  }, []);

  const wrongChain = isConnected && chainId !== NEXORA_CHAIN.id;

  if (!isConnected) {
    return (
      <ConnectCard
        connectors={connectors}
        connect={connect}
        deployments={deployments}
      />
    );
  }

  if (wrongChain) {
    return (
      <div className="rounded-lg border border-nexora-border bg-nexora-card p-6">
        <h2 className="text-lg font-semibold">Wrong network</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Switch your wallet to Nexora Devnet (chainId {NEXORA_CHAIN.id}).
        </p>
        <button
          className="mt-4 rounded-md bg-nexora-accent px-4 py-2 text-sm font-medium text-white"
          onClick={() => switchChain({ chainId: NEXORA_CHAIN.id })}
        >
          Switch to Nexora
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AccountCard
        owner={address!}
        balance={balance.data}
        falconKp={falconKp}
        deployments={deployments}
        onDisconnect={() => disconnect()}
      />
      <SendForm
        owner={address!}
        falconKp={falconKp}
        deployments={deployments}
      />
      <OpHistory deployments={deployments} />
    </div>
  );
}
