"use client";

import { useEffect, useState } from "react";
import {
  type DashboardKeypairView,
  type SignerSource,
  clearKeypair,
  formatBytes,
  generateBrowserKeypairAndStore,
  getFalcon512SignerUrl,
  probeDaemon,
  readKeypair,
} from "@/lib/falcon512Storage";
import { isWasmAvailable } from "@/lib/falcon512Browser";

interface Props {
  /// Notified whenever the keypair view changes (generate, clear, fallback to daemon).
  onChange: (view: DashboardKeypairView | null) => void;
}

/**
 * Step 1 of the dashboard onboarding flow.
 *
 * Generates a real Falcon-512 keypair (897 B public, 1281 B secret) using
 * the in-browser `wasm-bindgen` bundle. The secret is cached in
 * localStorage for the lifetime of the demo session; clearing it is a
 * one-click action.
 *
 * If the wasm bundle fails to load (older browsers, file:// origin, etc.)
 * the card reports the local `falcon-signer` daemon as a fallback signer
 * source so the user can continue without aborting the flow.
 */
export function KeygenCard({ onChange }: Props) {
  const [view, setView] = useState<DashboardKeypairView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wasmReady, setWasmReady] = useState<boolean | null>(null);
  const [daemonReady, setDaemonReady] = useState<boolean | null>(null);
  const [daemonPubkey, setDaemonPubkey] = useState<string | null>(null);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    const v = readKeypair();
    setView(v);
    onChange(v);
  }, [onChange]);

  // Probe the wasm bundle and the daemon in parallel for the badge.
  useEffect(() => {
    let cancelled = false;
    isWasmAvailable().then((ok) => {
      if (!cancelled) setWasmReady(ok);
    });
    probeDaemon().then((r) => {
      if (cancelled) return;
      setDaemonReady(r.ok);
      if (r.ok && r.pubkey) setDaemonPubkey(r.pubkey);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleGenerate(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const v = await generateBrowserKeypairAndStore();
      setView(v);
      onChange(v);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handleClear(): void {
    if (
      view &&
      !confirm(
        "Clear the locally cached Falcon-512 keypair? Any smart account " +
          "you deployed against this key will become unreachable from this " +
          "browser session.",
      )
    ) {
      return;
    }
    clearKeypair();
    setView(null);
    onChange(null);
  }

  const sigSource: SignerSource = view
    ? view.source
    : wasmReady
      ? "browser-wasm"
      : daemonReady
        ? "daemon"
        : "none";

  return (
    <div className="rounded-xl border border-nexora-border bg-nexora-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
            1 · Falcon-512 keypair
          </h3>
          <p className="mt-2 text-xs text-zinc-500">
            Generate a real Falcon-512 keypair (NIST PQC, 897-byte public key,
            1281-byte secret). Keys are produced and stored entirely
            client-side via the wasm-bindgen bundle.
          </p>
        </div>
        <SignerBadge source={sigSource} />
      </div>

      {view ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Card title="Public key hash (commitment)">
            <div className="break-all font-mono text-xs text-zinc-300">
              {view.pubkeyHash}
            </div>
          </Card>
          <Card title="Sizes">
            <div className="font-mono text-xs text-zinc-300">
              public {formatBytes(view.publicKeyLen)} · secret{" "}
              {formatBytes(view.secretKeyLen)}
            </div>
            <div className="mt-1 text-[10px] text-zinc-500">
              Real Falcon-512 sizes — no mock substitution.
            </div>
          </Card>
          <Card title="Generated">
            <div className="font-mono text-xs text-zinc-300">
              {view.createdAt
                ? new Date(view.createdAt).toLocaleString()
                : "—"}
            </div>
          </Card>
          <Card title="Public key (first 24 bytes)">
            <div className="break-all font-mono text-xs text-zinc-300">
              {view.publicKeyHex.slice(0, 50)}…
            </div>
          </Card>
        </div>
      ) : (
        <div className="mt-5 rounded-md border border-dashed border-nexora-border bg-zinc-900/40 p-4 text-xs text-zinc-500">
          No keypair yet. Click <em>Generate</em> to create one in your
          browser.
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          className="rounded-md bg-nexora-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={handleGenerate}
          disabled={busy}
        >
          {view ? (busy ? "Re-generating…" : "Re-generate") : busy ? "Generating…" : "Generate Falcon-512 keypair"}
        </button>
        {view && (
          <button
            className="rounded-md border border-nexora-border px-3 py-2 text-xs text-zinc-300 hover:border-nexora-accent"
            onClick={handleClear}
            disabled={busy}
          >
            Clear keys
          </button>
        )}
        <span className="ml-auto text-[11px] text-zinc-500 font-mono">
          wasm: {wasmReady === null ? "…" : wasmReady ? "ok" : "unavailable"} ·
          daemon: {daemonReady === null ? "…" : daemonReady ? "ok" : "down"}
          {daemonPubkey && daemonReady ? (
            <span> ({daemonPubkey.slice(0, 10)}…)</span>
          ) : null}
        </span>
      </div>

      {error && (
        <div className="mt-3 break-all rounded-md border border-amber-500/40 bg-amber-500/5 p-3 font-mono text-xs text-amber-300">
          {error}
        </div>
      )}

      <div className="mt-4 text-[11px] text-zinc-500">
        Demo-grade caveat: secret material lives in <code>localStorage</code>{" "}
        for this session. Production wallets would derive seeds from a
        passkey / WebAuthn flow or keep the secret on a hardware signer.
      </div>

      <div className="mt-2 text-[11px] text-zinc-500">
        Daemon URL:{" "}
        <span className="font-mono text-zinc-400">
          {getFalcon512SignerUrl()}
        </span>
      </div>
    </div>
  );
}

function SignerBadge({ source }: { source: SignerSource }) {
  const palette: Record<SignerSource, string> = {
    "browser-wasm": "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    daemon: "border-sky-500/40 bg-sky-500/10 text-sky-300",
    none: "border-zinc-600 bg-zinc-800/50 text-zinc-400",
  };
  const label: Record<SignerSource, string> = {
    "browser-wasm": "signer · browser-wasm",
    daemon: "signer · daemon",
    none: "signer · none",
  };
  return (
    <span
      className={`shrink-0 rounded-md border px-2 py-1 text-[10px] uppercase tracking-wider ${palette[source]}`}
    >
      {label[source]}
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
