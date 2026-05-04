"use client";

import { useEffect, useMemo, useState } from "react";
import { type Address, type Hex } from "viem";
import { usePublicClient } from "wagmi";
import type { Deployments } from "@/lib/deployments";
import {
  txUrl as explorerTxUrl,
  blockscoutTxUrl,
  shortHex,
} from "@/lib/explorer";
import {
  type CallFrame,
  decodeBoolOutput,
  decodeVerify,
  fetchCallTrace,
  findVerifierCalls,
  flattenTree,
  gasNum,
  selectorOf,
} from "@/lib/trace";

export interface PendingTraceTx {
  hash: Hex;
  tag: number; // PolicyTag
  scheme: number;
}

interface Props {
  pending: PendingTraceTx | null;
  deployments: Deployments;
}

const TAG_LABEL = ["LOW", "HIGH", "CRITICAL"];

export function VerifierTracePanel({ pending, deployments }: Props) {
  const publicClient = usePublicClient();
  const verifier = deployments.pqVerifierFalcon512 as Address | undefined;

  const [trace, setTrace] = useState<CallFrame | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pending || !publicClient) {
      setTrace(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setTrace(null);

    (async () => {
      try {
        // Wait for the receipt first so the tracer has the block at hand.
        await publicClient.waitForTransactionReceipt({ hash: pending.hash });
        const result = await fetchCallTrace(publicClient, pending.hash);
        if (cancelled) return;
        setTrace(result);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pending, publicClient]);

  const verifierFrames = useMemo(() => {
    if (!trace || !verifier) return [];
    return findVerifierCalls(trace, verifier);
  }, [trace, verifier]);

  const tree = useMemo(() => {
    if (!trace || !verifier) return [];
    return flattenTree(trace, verifier);
  }, [trace, verifier]);

  if (!pending) {
    return (
      <div className="rounded-xl border border-nexora-border bg-nexora-card p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
          5 · Verifier trace
        </h3>
        <p className="mt-2 text-xs text-zinc-500">
          Send a transaction above; this panel will fetch
          <span className="ml-1 font-mono">debug_traceTransaction</span> and
          highlight the call into the on-chain Falcon-512 verifier.
        </p>
      </div>
    );
  }

  const tagName = TAG_LABEL[pending.tag] ?? `tag=${pending.tag}`;
  const expectsVerify = pending.tag === 1 || pending.tag === 2;

  return (
    <div className="rounded-xl border border-nexora-border bg-nexora-card p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
            5 · Verifier trace
          </h3>
          <p className="mt-2 text-xs text-zinc-500">
            <span className="text-zinc-400">tx</span>{" "}
            <a
              className="font-mono text-emerald-300 underline decoration-dotted hover:text-emerald-200"
              href={explorerTxUrl(pending.hash)}
              target="_blank"
              rel="noreferrer"
            >
              {shortHex(pending.hash)}
            </a>
            {(() => {
              const bs = blockscoutTxUrl(pending.hash);
              return bs ? (
                <a
                  className="ml-2 text-zinc-500 hover:text-nexora-accent"
                  href={bs}
                  target="_blank"
                  rel="noreferrer"
                  title="open on Blockscout"
                >
                  Blockscout ↗
                </a>
              ) : null;
            })()}
            <span className="ml-2 text-zinc-500">· tag {tagName}</span>
            <span className="ml-2 text-zinc-500">· scheme {pending.scheme}</span>
          </p>
        </div>
        <Badge
          state={
            loading
              ? "loading"
              : error
                ? "error"
                : !expectsVerify
                  ? "skipped"
                  : verifierFrames.length === 0
                    ? "missing"
                    : verifierFrames.every(
                          (f) => decodeBoolOutput(f.output) === true && !f.error,
                        )
                      ? "ok"
                      : "fail"
          }
        />
      </div>

      {loading && (
        <p className="mt-4 text-[11px] text-zinc-500 font-mono">
          fetching debug_traceTransaction…
        </p>
      )}

      {error && (
        <div className="mt-4 break-all rounded-md border border-amber-500/40 bg-amber-500/5 p-3 font-mono text-xs text-amber-300">
          {error}
        </div>
      )}

      {!expectsVerify && !loading && !error && (
        <div className="mt-4 rounded-md border border-zinc-700 bg-zinc-900/40 p-3 text-xs text-zinc-400">
          {tagName === "LOW"
            ? "No verifier call expected — LOW operations are ECDSA only."
            : `No verifier call expected for tag=${tagName}.`}
        </div>
      )}

      {expectsVerify && trace && verifierFrames.length === 0 && !loading && (
        <div className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-300">
          The trace contains no call to{" "}
          <span className="font-mono">{verifier}</span>. Either the policy
          tag was inferred incorrectly, the verifier registry resolves a
          different address for this scheme, or the tx reverted before the
          validator ran.
        </div>
      )}

      {verifierFrames.length > 0 && (
        <div className="mt-4 space-y-3">
          {verifierFrames.map((f, i) => {
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
                          {decoded.sigBytes === 666 ? "(real Falcon-512)" : "(unexpected size)"}
                        </span>
                      </div>
                      <div className="text-zinc-500">pubkey</div>
                      <div>
                        {decoded.pubkeyBytes} B{" "}
                        <span className="text-zinc-500">
                          {decoded.pubkeyBytes === 897 ? "(real Falcon-512)" : "(unexpected size)"}
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
      )}

      {tree.length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">
            Call tree
          </div>
          <pre className="mt-2 max-h-72 overflow-auto rounded-md border border-nexora-border bg-zinc-950/60 p-3 text-[11px] leading-5 text-zinc-300 font-mono">
{tree.map((row, idx) => {
  const indent = "  ".repeat(row.depth);
  const sel = selectorOf(row.frame.input);
  const arrow = idx === 0 ? "" : "↳ ";
  const line = `${indent}${arrow}${row.frame.type.padEnd(13)} ${shortHex(row.frame.to ?? "0x", 8, 6)} ${sel}`;
  return row.isVerifier ? (
    <span key={idx} className="text-emerald-300">{line}{"\n"}</span>
  ) : (
    <span key={idx}>{line}{"\n"}</span>
  );
})}
          </pre>
        </div>
      )}

      <div className="mt-4 text-[11px] text-zinc-500">
        Trace fetched via{" "}
        <span className="font-mono">debug_traceTransaction</span> with the
        Geth <span className="font-mono">callTracer</span>. The verifier
        address is read from{" "}
        <span className="font-mono">deployments.pqVerifierFalcon512</span>.
      </div>
    </div>
  );
}

function Badge({
  state,
}: {
  state: "loading" | "ok" | "fail" | "skipped" | "missing" | "error";
}) {
  const map: Record<typeof state, { label: string; cls: string }> = {
    loading: {
      label: "tracing…",
      cls: "border-zinc-600 bg-zinc-800/50 text-zinc-300",
    },
    ok: {
      label: "verify · ok",
      cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    },
    fail: {
      label: "verify · failed",
      cls: "border-red-500/40 bg-red-500/10 text-red-300",
    },
    skipped: {
      label: "skipped",
      cls: "border-zinc-600 bg-zinc-800/50 text-zinc-400",
    },
    missing: {
      label: "no verify call",
      cls: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    },
    error: {
      label: "trace error",
      cls: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    },
  };
  const { label, cls } = map[state];
  return (
    <span
      className={`shrink-0 rounded-md border px-2 py-1 text-[10px] uppercase tracking-wider ${cls}`}
    >
      {label}
    </span>
  );
}
