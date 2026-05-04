"use client";

import { useEffect, useState } from "react";
import {
  type Address,
  type Hex,
  zeroHash,
} from "viem";
import {
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { abi } from "@nexora/wallet-sdk";
import type { Deployments } from "@/lib/deployments";
import type { DashboardKeypairView } from "@/lib/falcon512Storage";
import { txUrl as explorerTxUrl, blockscoutTxUrl } from "@/lib/explorer";
import { usePublicClient } from "wagmi";

interface Props {
  owner: Address;
  keypair: DashboardKeypairView | null;
  deployments: Deployments;
  /// Notified once the deployment lands on-chain.
  onDeployed: (address: Address) => void;
}

const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as Address;

/**
 * Step 2: deploy the user's smart account via `AccountFactory.createAccount`.
 *
 * Computes the deterministic address from the connected EOA + the
 * Falcon-512 public-key hash, signs the deployment tx with the user's
 * MetaMask, and polls `getBytecode` until the account is live.
 */
export function DeployAccountCard({ owner, keypair, deployments, onDeployed }: Props) {
  const factoryReady =
    deployments.accountFactory && deployments.accountFactory !== ZERO_ADDR;

  const predicted = useReadContract({
    address: deployments.accountFactory,
    abi: abi.accountFactoryAbi,
    functionName: "predictAddress",
    args: [owner, (keypair?.pubkeyHash ?? zeroHash) as Hex, zeroHash],
    query: { enabled: Boolean(keypair) && Boolean(factoryReady) },
  });
  const predictedAddress = (predicted.data as Address | undefined) ?? null;

  const [isDeployed, setIsDeployed] = useState<boolean | null>(null);
  const [pollErr, setPollErr] = useState<string | null>(null);
  const publicClient = usePublicClient();

  // Probe deployment state whenever the predicted address changes.
  useEffect(() => {
    let cancelled = false;
    setIsDeployed(null);
    setPollErr(null);
    if (!predictedAddress || !publicClient) return;
    (async () => {
      try {
        const code = await publicClient.getCode({ address: predictedAddress });
        if (cancelled) return;
        const deployed = Boolean(code) && code !== "0x";
        setIsDeployed(deployed);
        if (deployed) onDeployed(predictedAddress);
      } catch (e) {
        if (!cancelled) setPollErr((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [predictedAddress, publicClient, onDeployed]);

  const {
    writeContractAsync,
    data: txHash,
    isPending: txPending,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed } =
    useWaitForTransactionReceipt({ hash: txHash });

  // Re-probe once a tx confirms.
  useEffect(() => {
    if (!confirmed || !publicClient || !predictedAddress) return;
    (async () => {
      const code = await publicClient.getCode({ address: predictedAddress });
      const deployed = Boolean(code) && code !== "0x";
      setIsDeployed(deployed);
      if (deployed) onDeployed(predictedAddress);
    })();
  }, [confirmed, publicClient, predictedAddress, onDeployed]);

  async function handleDeploy(): Promise<void> {
    if (!keypair || !predictedAddress) return;
    resetWrite();
    try {
      await writeContractAsync({
        address: deployments.accountFactory,
        abi: abi.accountFactoryAbi,
        functionName: "createAccount",
        args: [owner, keypair.pubkeyHash as Hex, zeroHash],
      });
    } catch {
      // surfaced via writeError
    }
  }

  return (
    <div className="rounded-xl border border-nexora-border bg-nexora-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
            2 · Smart account
          </h3>
          <p className="mt-2 text-xs text-zinc-500">
            Deterministic CREATE2 deployment via{" "}
            <span className="font-mono">AccountFactory.createAccount</span>.
            Address is derived from your EOA and Falcon-512 commitment, so
            re-generating keys gives you a brand-new account.
          </p>
        </div>
        <DeployBadge keypair={keypair} isDeployed={isDeployed} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Card title="Owner (EOA)">
          <div className="break-all font-mono text-xs text-zinc-300">
            {owner}
          </div>
        </Card>
        <Card title="PQ pubkey hash">
          <div className="break-all font-mono text-xs text-zinc-300">
            {keypair ? keypair.pubkeyHash : "— generate keys first"}
          </div>
        </Card>
        <Card title="Predicted account">
          <div className="break-all font-mono text-xs text-zinc-300">
            {!keypair
              ? "— waiting for keys"
              : !factoryReady
                ? "— factory not deployed"
                : predicted.isLoading
                  ? "computing…"
                  : predictedAddress
                    ? predictedAddress
                    : "—"}
          </div>
        </Card>
        <Card title="Factory">
          <div className="break-all font-mono text-xs text-zinc-300">
            {deployments.accountFactory}
          </div>
        </Card>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          className="rounded-md bg-nexora-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={handleDeploy}
          disabled={
            !keypair ||
            !predictedAddress ||
            txPending ||
            confirming ||
            isDeployed === true
          }
        >
          {isDeployed === true
            ? "Already deployed"
            : txPending
              ? "Awaiting wallet…"
              : confirming
                ? "Confirming…"
                : "Deploy smart account"}
        </button>
        {txHash && (
          <a
            className="break-all font-mono text-[11px] text-zinc-400 underline decoration-dotted hover:text-nexora-accent"
            href={explorerTxUrl(txHash)}
            target="_blank"
            rel="noreferrer"
            title="open trace"
          >
            tx: {txHash}
          </a>
        )}
        {txHash &&
          (() => {
            const bs = blockscoutTxUrl(txHash);
            return bs ? (
              <a
                className="text-[11px] text-zinc-500 hover:text-nexora-accent"
                href={bs}
                target="_blank"
                rel="noreferrer"
                title="open on Blockscout"
              >
                Blockscout ↗
              </a>
            ) : null;
          })()}
      </div>

      {writeError && (
        <div className="mt-3 break-all rounded-md border border-amber-500/40 bg-amber-500/5 p-3 font-mono text-xs text-amber-300">
          {writeError.message}
        </div>
      )}
      {pollErr && (
        <div className="mt-3 break-all rounded-md border border-amber-500/40 bg-amber-500/5 p-3 font-mono text-xs text-amber-300">
          poll error: {pollErr}
        </div>
      )}
    </div>
  );
}

function DeployBadge({
  keypair,
  isDeployed,
}: {
  keypair: DashboardKeypairView | null;
  isDeployed: boolean | null;
}) {
  let label = "not generated";
  let palette = "border-zinc-600 bg-zinc-800/50 text-zinc-400";
  if (keypair && isDeployed === true) {
    label = "deployed";
    palette = "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  } else if (keypair && isDeployed === false) {
    label = "predicted · not deployed";
    palette = "border-amber-500/40 bg-amber-500/10 text-amber-300";
  } else if (keypair) {
    label = "checking…";
    palette = "border-zinc-600 bg-zinc-800/50 text-zinc-400";
  }
  return (
    <span
      className={`shrink-0 rounded-md border px-2 py-1 text-[10px] uppercase tracking-wider ${palette}`}
    >
      {label}
    </span>
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
