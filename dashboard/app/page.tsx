"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type Address } from "viem";
import {
  useAccount,
  useBalance,
  useChainId,
  useConnect,
  useDisconnect,
  usePublicClient,
  useSwitchChain,
} from "wagmi";
import { ConnectCard } from "@/components/ConnectCard";
import { AccountCard } from "@/components/AccountCard";
import { KeygenCard } from "@/components/KeygenCard";
import { DeployAccountCard } from "@/components/DeployAccountCard";
import { FundAccountCard } from "@/components/FundAccountCard";
import { SendForm } from "@/components/SendForm";
import { OpHistory } from "@/components/OpHistory";
import { useDeployments } from "@/lib/useDeployments";
import { type DashboardKeypairView } from "@/lib/falcon512Storage";
import { NEXORA_CHAIN } from "@nexora/wallet-sdk";

export default function Home() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const balance = useBalance({ address });
  const { deployments } = useDeployments();
  const publicClient = usePublicClient();

  const [keypair, setKeypair] = useState<DashboardKeypairView | null>(null);
  const [accountAddress, setAccountAddress] = useState<Address | null>(null);
  const [accountBalance, setAccountBalance] = useState<bigint>(0n);

  // Anchors for "fix this" in-page jumps from the SendForm.
  const keygenRef = useRef<HTMLDivElement | null>(null);
  const deployRef = useRef<HTMLDivElement | null>(null);
  const fundRef = useRef<HTMLDivElement | null>(null);

  // Keep accountBalance fresh — used for SendForm precondition gating.
  useEffect(() => {
    let cancelled = false;
    if (!accountAddress || !publicClient) {
      setAccountBalance(0n);
      return;
    }
    const tick = async () => {
      try {
        const v = await publicClient.getBalance({ address: accountAddress });
        if (!cancelled) setAccountBalance(v);
      } catch {
        // RPC noise — ignore
      }
    };
    tick();
    const t = setInterval(tick, 4_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [accountAddress, publicClient]);

  // When the user clears or re-generates keys, the deployed-account state
  // is no longer valid for the new key. Reset it so the deploy card can
  // re-probe under the new commitment.
  const handleKeypairChange = useCallback(
    (kp: DashboardKeypairView | null) => {
      setKeypair(kp);
      setAccountAddress(null);
    },
    [],
  );

  const handleDeployed = useCallback((addr: Address) => {
    setAccountAddress(addr);
  }, []);

  const handleJump = useCallback(
    (target: "keys" | "deploy" | "fund") => {
      const map = { keys: keygenRef, deploy: deployRef, fund: fundRef };
      const el = map[target].current;
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [],
  );

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
        onDisconnect={() => disconnect()}
      />

      <div ref={keygenRef}>
        <KeygenCard onChange={handleKeypairChange} />
      </div>

      <div ref={deployRef}>
        <DeployAccountCard
          owner={address!}
          keypair={keypair}
          deployments={deployments}
          onDeployed={handleDeployed}
        />
      </div>

      <div ref={fundRef}>
        <FundAccountCard account={accountAddress} />
      </div>

      <SendForm
        owner={address!}
        keypair={keypair}
        account={accountAddress}
        accountDeployed={Boolean(accountAddress)}
        accountBalance={accountBalance}
        deployments={deployments}
        onJumpToStep={handleJump}
      />

      <OpHistory deployments={deployments} />
    </div>
  );
}
