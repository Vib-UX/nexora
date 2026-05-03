"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  type Address,
  type Hex,
  type Transaction,
  type TransactionReceipt,
  formatEther,
  formatGwei,
  isHex,
} from "viem";
import { usePublicClient } from "wagmi";
import { useDeployments } from "@/lib/useDeployments";
import {
  type CallFrame,
  type FlatFrame,
  decodeBoolOutput,
  decodeVerify,
  fetchCallTrace,
  findVerifierCalls,
  flattenTree,
  gasNum,
  selectorOf,
} from "@/lib/trace";
import { shortHex } from "@/lib/explorer";

interface Props {
  params: { hash: string };
}

/**
 * Tiny block-explorer page for a single transaction.
 *
 * Renders out of the dashboard's own RPC connection — no Otterscan, no
 * Erigon-only namespace shim. Reads `eth_getTransactionByHash`,
 * `eth_getTransactionReceipt`, and `debug_traceTransaction` (Geth
 * callTracer, which Nitro implements), then decodes the Falcon-512
 * verifier call inline so the post-quantum signature size, message
 * hash, gas, and result are visible at a glance.
 */
export default function TxPage({ params }: Props) {
  const hash = decodeURIComponent(params.hash) as Hex;
  const valid = isHex(hash) && hash.length === 66;
  const publicClient = usePublicClient();
  const { deployments } = useDeployments();
  const verifier = deployments.pqVerifierFalcon512 as Address | undefined;

  const [tx, setTx] = useState<Transaction | null>(null);
  const [receipt, setReceipt] = useState<TransactionReceipt | null>(null);
  const [trace, setTrace] = useState<CallFrame | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!valid || !publicClient) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const t = await publicClient.getTransaction({ hash });
        if (cancelled) return;
        setTx(t);

        const r = await publicClient.getTransactionReceipt({ hash });
        if (cancelled) return;
        setReceipt(r);

        try {
          const result = await fetchCallTrace(publicClient, hash);
          if (!cancelled) setTrace(result);
        } catch (e) {
          if (!cancelled) {
            // Trace is optional — render the page without it.
            setError(`debug_traceTransaction unavailable: ${(e as Error).message}`);
          }
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hash, publicClient, valid]);

  const named = useMemo(() => {
    const m = new Map<string, string>();
    const add = (a: string | undefined, name: string) => {
      if (!a) return;
      m.set(a.toLowerCase(), name);
    };
    add(deployments.pqVerifier, "pqVerifier (mock)");
    add(deployments.pqVerifierFalcon512, "pqVerifierFalcon512");
    add(deployments.verifierRegistry, "VerifierRegistry");
    add(deployments.policyEngine, "PolicyEngine");
    add(deployments.accountImplementation, "AccountImpl");
    add(deployments.accountFactory, "AccountFactory");
    add(deployments.bridgeMock, "BridgeMock");
    return m;
  }, [deployments]);

  const labelFor = (addr?: string): string | null => {
    if (!addr) return null;
    return named.get(addr.toLowerCase()) ?? null;
  };

  const verifierCalls = useMemo(() => {
    if (!trace || !verifier) return [];
    return findVerifierCalls(trace, verifier);
  }, [trace, verifier]);

  const flat: FlatFrame[] = useMemo(() => {
    if (!trace) return [];
    return flattenTree(trace, verifier, 128);
  }, [trace, verifier]);

  if (!valid) {
    return (
      <div className="rounded-xl border border-nexora-border bg-nexora-card p-6">
        <h2 className="text-base font-semibold">Invalid transaction hash</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Expected a 32-byte hex hash (`0x` + 64 hex chars). Got{" "}
          <span className="break-all font-mono text-zinc-300">{hash}</span>.
        </p>
        <BackLink />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <BackLink />
        <span className="text-[11px] uppercase tracking-wider text-zinc-500">
          Tx
        </span>
      </div>

      <div className="rounded-xl border border-nexora-border bg-nexora-card p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">
              transaction
            </div>
            <div className="mt-1 break-all font-mono text-sm text-zinc-200">
              {hash}
            </div>
          </div>
          {receipt && <StatusBadge receipt={receipt} />}
        </div>

        {loading && !tx && (
          <p className="mt-4 text-[11px] text-zinc-500 font-mono">
            fetching tx…
          </p>
        )}

        {error && !tx && (
          <div className="mt-4 break-all rounded-md border border-red-500/40 bg-red-500/5 p-3 font-mono text-xs text-red-300">
            {error}
          </div>
        )}

        {tx && receipt && (
          <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
            <Row label="From">
              <AddressInline addr={tx.from} label={labelFor(tx.from)} />
            </Row>
            <Row label="To">
              <AddressInline
                addr={tx.to ?? ""}
                label={labelFor(tx.to ?? undefined)}
              />
            </Row>
            <Row label="Value">{formatEther(tx.value)} ETH</Row>
            <Row label="Block">
              #{receipt.blockNumber.toString()} (idx{" "}
              {receipt.transactionIndex})
            </Row>
            <Row label="Gas used">
              {receipt.gasUsed.toString()}{" "}
              <span className="text-zinc-500">
                / {tx.gas.toString()} limit
              </span>
            </Row>
            <Row label="Gas price">
              {tx.gasPrice ? `${formatGwei(tx.gasPrice)} gwei` : "—"}
            </Row>
            <Row label="Nonce">{tx.nonce}</Row>
            <Row label="Logs">
              {receipt.logs.length} event{receipt.logs.length === 1 ? "" : "s"}
            </Row>
          </dl>
        )}
      </div>

      {verifierCalls.length > 0 && (
        <div className="rounded-xl border border-nexora-border bg-nexora-card p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Falcon-512 verifier
          </h3>
          <p className="mt-1 text-[11px] text-zinc-500">
            On-chain post-quantum verification surfaced from{" "}
            <span className="font-mono">debug_traceTransaction</span>.
          </p>

          <div className="mt-4 space-y-3">
            {verifierCalls.map((f, i) => {
              const decoded = f.input ? decodeVerify(f.input) : null;
              const ok = decodeBoolOutput(f.output);
              const okBadge =
                ok === true
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : ok === false
                    ? "border-red-500/40 bg-red-500/10 text-red-300"
                    : "border-zinc-700 bg-zinc-900/40 text-zinc-400";
              return (
                <div
                  key={i}
                  className="rounded-md border border-emerald-500/30 bg-emerald-500/[0.04] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-zinc-300">
                      pqVerifierFalcon512.verify(bytes32, bytes, bytes)
                    </span>
                    <span
                      className={`shrink-0 rounded border px-2 py-0.5 text-[10px] uppercase tracking-wider ${okBadge}`}
                    >
                      {ok === true
                        ? "verify -> true"
                        : ok === false
                          ? "verify -> false"
                          : "no return"}
                    </span>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-mono text-zinc-300">
                    <div className="text-zinc-500">type</div>
                    <div>{f.type}</div>
                    <div className="text-zinc-500">to</div>
                    <div className="break-all">{f.to}</div>
                    <div className="text-zinc-500">selector</div>
                    <div>
                      {selectorOf(f.input)}{" "}
                      <span className="text-zinc-500">(verify)</span>
                    </div>
                    {decoded && (
                      <>
                        <div className="text-zinc-500">msg hash</div>
                        <div className="break-all">{decoded.msgHash}</div>
                        <div className="text-zinc-500">sig</div>
                        <div>
                          {decoded.sigBytes} B{" "}
                          <span className="text-zinc-500">
                            {decoded.sigBytes === 666
                              ? "(real Falcon-512)"
                              : "(unexpected size)"}
                          </span>
                        </div>
                        <div className="text-zinc-500">pubkey</div>
                        <div>
                          {decoded.pubkeyBytes} B{" "}
                          <span className="text-zinc-500">
                            {decoded.pubkeyBytes === 897
                              ? "(real Falcon-512)"
                              : "(unexpected size)"}
                          </span>
                        </div>
                      </>
                    )}
                    <div className="text-zinc-500">gas used</div>
                    <div>{gasNum(f.gasUsed).toLocaleString()}</div>
                    {f.error && (
                      <>
                        <div className="text-zinc-500">error</div>
                        <div className="text-red-300">{f.error}</div>
                      </>
                    )}
                  </dl>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {trace && (
        <div className="rounded-xl border border-nexora-border bg-nexora-card p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Call tree
          </h3>
          <p className="mt-1 text-[11px] text-zinc-500">
            From <span className="font-mono">debug_traceTransaction</span>{" "}
            (Geth callTracer). Verifier frames are highlighted.
          </p>

          <pre className="mt-4 max-h-[28rem] overflow-auto rounded-md border border-nexora-border bg-zinc-950/60 p-3 text-[11px] leading-5 text-zinc-300 font-mono">
{flat.map((row, idx) => {
  const indent = "  ".repeat(row.depth);
  const sel = selectorOf(row.frame.input);
  const arrow = idx === 0 ? "" : "↳ ";
  const name = labelFor(row.frame.to) ?? shortHex(row.frame.to ?? "0x", 8, 6);
  const errSuffix = row.frame.error ? `  ! ${row.frame.error}` : "";
  const line = `${indent}${arrow}${row.frame.type.padEnd(13)} ${name.padEnd(28)} ${sel}${errSuffix}`;
  const cls = row.frame.error
    ? "text-red-300"
    : row.isVerifier
      ? "text-emerald-300"
      : "";
  return (
    <span key={idx} className={cls}>{line}{"\n"}</span>
  );
})}
          </pre>
        </div>
      )}

      {!loading && !trace && tx && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-300">
          Call tree unavailable for this tx. The RPC node may not have
          archived the block, or <span className="font-mono">
            debug_traceTransaction
          </span>{" "}
          is disabled. {error}
        </div>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/"
      className="text-[11px] uppercase tracking-wider text-zinc-400 hover:text-nexora-accent"
    >
      ← dashboard
    </Link>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="break-all font-mono text-zinc-200">{children}</dd>
    </>
  );
}

function StatusBadge({ receipt }: { receipt: TransactionReceipt }) {
  const ok = receipt.status === "success";
  return (
    <span
      className={`shrink-0 rounded-md border px-2 py-1 text-[10px] uppercase tracking-wider ${
        ok
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
          : "border-red-500/40 bg-red-500/10 text-red-300"
      }`}
    >
      {ok ? "success" : "reverted"}
    </span>
  );
}

function AddressInline({ addr, label }: { addr: string; label: string | null }) {
  if (!addr) return <span className="text-zinc-500">—</span>;
  return (
    <span>
      <span>{addr}</span>
      {label && (
        <span className="ml-2 rounded border border-nexora-border bg-zinc-900/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-zinc-400">
          {label}
        </span>
      )}
    </span>
  );
}
