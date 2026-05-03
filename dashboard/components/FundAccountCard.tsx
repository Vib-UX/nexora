"use client";

import { useEffect, useState } from "react";
import {
  type Address,
  type Hex,
  formatEther,
  isAddress,
  parseEther,
} from "viem";
import {
  useBalance,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { abi } from "@nexora/wallet-sdk";
import { txUrl as explorerTxUrl } from "@/lib/explorer";

interface Props {
  /// Address to fund. May be `null` while the user hasn't deployed yet —
  /// the card stays visible but disabled to keep the flow stable.
  account: Address | null;
}

const QUICK_AMOUNTS = ["0.01", "0.1", "1"];

/**
 * Step 3: top up the smart account with ETH from the connected EOA so it
 * can pay out `value` on subsequent UserOps. Calls the wallet's payable
 * `fund()` selector (Stylus 0.6 doesn't support a bare `receive()`).
 */
export function FundAccountCard({ account }: Props) {
  const [amount, setAmount] = useState<string>("0.01");
  const [error, setError] = useState<string | null>(null);

  const balance = useBalance({
    address: account ?? undefined,
    query: { enabled: Boolean(account), refetchInterval: 6_000 },
  });

  const {
    writeContractAsync,
    data: txHash,
    isPending: txPending,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed } =
    useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (confirmed) balance.refetch();
  }, [confirmed, balance]);

  async function handleFund(): Promise<void> {
    setError(null);
    if (!account || !isAddress(account)) {
      setError("account address unavailable");
      return;
    }
    let value: bigint;
    try {
      value = parseEther(amount as `${number}`);
    } catch {
      setError(`invalid amount: ${amount}`);
      return;
    }
    if (value <= 0n) {
      setError("amount must be > 0");
      return;
    }
    resetWrite();
    try {
      await writeContractAsync({
        address: account,
        abi: abi.nexoraAccountAbi,
        functionName: "fund",
        args: [],
        value,
      });
    } catch {
      // surfaced via writeError
    }
  }

  const balanceWei = balance.data?.value ?? 0n;
  const fundedEnough = balanceWei > 0n;

  return (
    <div className="rounded-xl border border-nexora-border bg-nexora-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
            3 · Fund smart account
          </h3>
          <p className="mt-2 text-xs text-zinc-500">
            Send ETH from your connected EOA to the smart account so it can
            cover transaction value plus L3 gas.
          </p>
        </div>
        <FundBadge funded={account ? fundedEnough : null} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Card title="Smart account">
          <div className="break-all font-mono text-xs text-zinc-300">
            {account ?? "— deploy the account first"}
          </div>
        </Card>
        <Card title="Balance">
          <div className="font-mono text-xs text-zinc-300">
            {!account
              ? "—"
              : balance.isLoading
                ? "fetching…"
                : `${formatEther(balanceWei)} ${balance.data?.symbol ?? "ETH"}`}
          </div>
          {account && balance.data && (
            <div className="mt-1 text-[10px] text-zinc-500">
              auto-refreshes every 6s
            </div>
          )}
        </Card>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {QUICK_AMOUNTS.map((q) => (
          <button
            key={q}
            type="button"
            className={`rounded-md border px-2 py-1.5 text-[11px] hover:border-nexora-accent hover:text-white ${
              amount === q
                ? "border-nexora-accent bg-zinc-900 text-nexora-accent"
                : "border-nexora-border bg-zinc-900/50 text-zinc-300"
            }`}
            onClick={() => setAmount(q)}
          >
            {q} ETH
          </button>
        ))}
        <input
          className="ml-1 w-32 rounded-md border border-nexora-border bg-zinc-950 px-3 py-1.5 font-mono text-xs"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.01"
        />
        <button
          className="rounded-md bg-nexora-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={handleFund}
          disabled={!account || txPending || confirming}
        >
          {txPending
            ? "Awaiting wallet…"
            : confirming
              ? "Confirming…"
              : "Send from MetaMask"}
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
      </div>

      {(writeError || error) && (
        <div className="mt-3 break-all rounded-md border border-amber-500/40 bg-amber-500/5 p-3 font-mono text-xs text-amber-300">
          {error ?? writeError?.message}
        </div>
      )}

      <div className="mt-4 text-[11px] text-zinc-500">
        Funding calls the wallet&apos;s payable{" "}
        <span className="font-mono">fund()</span> selector
        (<span className="font-mono">0xb60d4288</span>) — Stylus 0.6 doesn&apos;t
        expose a bare <span className="font-mono">receive()</span>, so plain
        EOA-to-contract transfers won&apos;t bump the balance.
      </div>
    </div>
  );
}

function FundBadge({ funded }: { funded: boolean | null }) {
  let label = "no account";
  let palette = "border-zinc-600 bg-zinc-800/50 text-zinc-400";
  if (funded === true) {
    label = "funded";
    palette = "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  } else if (funded === false) {
    label = "empty";
    palette = "border-amber-500/40 bg-amber-500/10 text-amber-300";
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

// Suppress unused-export warnings — Hex is part of the design surface in
// case we extend the card with an "approve & call" flow later.
export type _Unused = Hex;
