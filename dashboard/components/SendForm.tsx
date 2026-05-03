"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type Address,
  type Hex,
  formatEther,
  hexToBytes,
  isAddress,
  isHex,
  parseEther,
} from "viem";
import {
  useAccount,
  usePublicClient,
  useWaitForTransactionReceipt,
  useWalletClient,
} from "wagmi";
import {
  PolicyTag,
  VerifierScheme,
  abi,
  computeOpHash,
  encodeUserOp,
  onchainClassify,
  signers,
} from "@nexora/wallet-sdk";
import type { Falcon512Signer } from "@nexora/wallet-sdk/signers";
import type { Deployments } from "@/lib/deployments";
import {
  type DashboardKeypairView,
  resolveFalcon512Signer,
} from "@/lib/falcon512Storage";
import { txUrl as explorerTxUrl } from "@/lib/explorer";

const ADDR_ZERO = "0x0000000000000000000000000000000000000000" as Address;

type Status = "idle" | "running" | "ok" | "error";

interface StepView {
  id: string;
  label: string;
  status: Status;
  detail?: string;
  ms?: number;
}

const INITIAL_STEPS: StepView[] = [
  { id: "classify", label: "1 · classify policy", status: "idle" },
  { id: "build", label: "2 · build UserOp", status: "idle" },
  { id: "ecdsa", label: "3 · sign ECDSA (owner)", status: "idle" },
  { id: "pq", label: "4 · sign Falcon-512", status: "idle" },
  { id: "submit", label: "5 · submit", status: "idle" },
  { id: "confirm", label: "6 · confirm", status: "idle" },
];

const TAG_LABEL: Record<number, string> = {
  0: "LOW (ECDSA only)",
  1: "HIGH (ECDSA + PQ)",
  2: "CRITICAL (PQ + timelock)",
};

const TAG_CLASS: Record<number, string> = {
  0: "tag-low",
  1: "tag-high",
  2: "tag-critical",
};

const DEMO_PRESETS = {
  low: { label: "LOW · 0.001 ETH", valueEth: "0.001", callData: "0x" as Hex },
  high: {
    label: "HIGH · 0.05 ETH + calldata",
    valueEth: "0.05",
    callData: "0xa1b2c3d4" as Hex,
  },
  critical: {
    label: "CRITICAL · 0.5 ETH",
    valueEth: "0.5",
    callData: "0xdeadbeef" as Hex,
  },
} as const;

interface Props {
  owner: Address;
  keypair: DashboardKeypairView | null;
  account: Address | null;
  accountDeployed: boolean;
  accountBalance: bigint;
  deployments: Deployments;
  /// Render a small "fix this" hint next to disabled preconditions.
  onJumpToStep?: (step: "keys" | "deploy" | "fund") => void;
  /// Notify the page of every successful submit so a sibling Verifier
  /// Trace panel can fetch `debug_traceTransaction` for it.
  onTx?: (tx: { hash: Hex; tag: PolicyTag; scheme: VerifierScheme }) => void;
}

export function SendForm({
  owner,
  keypair,
  account,
  accountDeployed,
  accountBalance,
  deployments,
  onJumpToStep,
  onTx,
}: Props) {
  const { connector } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [target, setTarget] = useState<string>(deployments.bridgeMock);
  const [valueEth, setValueEth] = useState<string>("0.001");
  const [callData, setCallData] = useState<string>("0x");
  const [showLegacy, setShowLegacy] = useState<boolean>(false);
  const [scheme, setScheme] = useState<VerifierScheme>(VerifierScheme.Falcon512);

  const [steps, setSteps] = useState<StepView[]>(INITIAL_STEPS);
  const [running, setRunning] = useState(false);
  const [tag, setTag] = useState<PolicyTag | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [opHash, setOpHash] = useState<Hex | null>(null);
  const [pqSigSize, setPqSigSize] = useState<number | null>(null);
  const [signerSource, setSignerSource] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Pin the bridge placeholder as default target on mount/refresh.
  useEffect(() => {
    const b = deployments.bridgeMock;
    if (!b || b === ADDR_ZERO) return;
    setTarget((prev) =>
      prev === ADDR_ZERO || prev === "" || !isAddress(prev) ? b : prev,
    );
  }, [deployments.bridgeMock]);

  const txReceipt = useWaitForTransactionReceipt({ hash: txHash ?? undefined });
  useEffect(() => {
    if (!txHash) return;
    if (txReceipt.isSuccess && txReceipt.data) {
      patchStep("confirm", {
        status: "ok",
        detail: `block ${txReceipt.data.blockNumber} · gas ${txReceipt.data.gasUsed}`,
      });
    } else if (txReceipt.isError) {
      patchStep("confirm", {
        status: "error",
        detail: txReceipt.error?.message ?? "receipt error",
      });
    }
    // We intentionally don't depend on patchStep — it's stable from the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txHash, txReceipt.isSuccess, txReceipt.isError, txReceipt.data]);

  // Stable patcher — keeps the running closure pinned to the latest setter.
  const patchRef = useRef<(id: string, p: Partial<StepView>) => void>(
    () => undefined,
  );
  patchRef.current = (id: string, p: Partial<StepView>) =>
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const patchStep = (id: string, p: Partial<StepView>) =>
    patchRef.current(id, p);

  function reset(): void {
    setSteps(INITIAL_STEPS.map((s) => ({ ...s })));
    setTag(null);
    setTxHash(null);
    setOpHash(null);
    setPqSigSize(null);
    setSignerSource(null);
    setErrorMsg(null);
  }

  function applyPreset(key: keyof typeof DEMO_PRESETS): void {
    const p = DEMO_PRESETS[key];
    const t =
      deployments.bridgeMock !== ADDR_ZERO ? deployments.bridgeMock : target;
    setTarget(t);
    setValueEth(p.valueEth);
    setCallData(p.callData);
    reset();
  }

  // -------- Preconditions ------------------------------------------------

  const valueWei = parseEthSafe(valueEth);
  const balanceShort = valueWei + parseEther("0.0005") > accountBalance;

  const preconditions: Array<{
    ok: boolean;
    label: string;
    fix?: { label: string; step: "keys" | "deploy" | "fund" };
  }> = [
    {
      ok: Boolean(keypair),
      label: "Falcon-512 keypair generated",
      fix: { label: "go to keygen", step: "keys" },
    },
    {
      ok: accountDeployed,
      label: "Smart account deployed",
      fix: { label: "deploy account", step: "deploy" },
    },
    {
      ok: !balanceShort,
      label: `Account funded (≥ ${formatEther(valueWei + parseEther("0.0005"))} ETH)`,
      fix: { label: "fund account", step: "fund" },
    },
  ];
  const allOk = preconditions.every((p) => p.ok);

  // -------- Send ---------------------------------------------------------

  async function send(): Promise<void> {
    if (running) return;
    if (!walletClient || !walletClient.account || !publicClient) {
      setErrorMsg("wallet client not ready");
      return;
    }
    if (!account || !keypair) return;
    if (!isAddress(target)) {
      setErrorMsg("invalid target address");
      return;
    }
    setRunning(true);
    reset();
    setErrorMsg(null);

    const data: Hex = (isHex(callData) ? callData : "0x") as Hex;
    const value = parseEthSafe(valueEth);

    try {
      // 1. classify --------------------------------------------------------
      patchStep("classify", { status: "running" });
      const t1 = performance.now();
      const policyTag = await onchainClassify(
        publicClient,
        deployments.policyEngine,
        account,
        target as Address,
        value,
        data,
      );
      setTag(policyTag);
      patchStep("classify", {
        status: "ok",
        detail: `${TAG_LABEL[policyTag]} · engine ${shorten(deployments.policyEngine)}`,
        ms: Math.round(performance.now() - t1),
      });

      // 2. build op --------------------------------------------------------
      patchStep("build", { status: "running" });
      const t2 = performance.now();
      const channel = policyTag === PolicyTag.Low ? 0n : 1n;
      const nextNonce = ((await publicClient.readContract({
        address: account,
        abi: abi.nexoraAccountAbi,
        functionName: "getNonce",
        args: [channel],
      })) as bigint) + 1n;
      const chainId = BigInt(await publicClient.getChainId());

      const op = {
        sender: account,
        nonce: nextNonce,
        target: target as Address,
        value,
        callData: data,
        callGasLimit: 1_000_000n,
        validUntil: 0n,
        policyTag,
        verifierScheme: scheme,
        signatures: "0x" as Hex,
      };
      const computedOpHash = computeOpHash(op, chainId, account);
      setOpHash(computedOpHash);
      patchStep("build", {
        status: "ok",
        detail: `nonce=${nextNonce} · chain=${chainId} · opHash=${shorten(computedOpHash)}`,
        ms: Math.round(performance.now() - t2),
      });

      // 3. sign ECDSA ------------------------------------------------------
      let ecdsaSig = null;
      if (policyTag === PolicyTag.Low || policyTag === PolicyTag.High) {
        patchStep("ecdsa", { status: "running" });
        const t3 = performance.now();
        ecdsaSig = await signers.signEcdsaOpHash(
          { walletClient, account: walletClient.account },
          computedOpHash,
        );
        patchStep("ecdsa", {
          status: "ok",
          detail: `65 B · v=${ecdsaSig.v}`,
          ms: Math.round(performance.now() - t3),
        });
      } else {
        patchStep("ecdsa", { status: "ok", detail: "skipped (CRITICAL = PQ-only)" });
      }

      // 4. sign Falcon-512 -------------------------------------------------
      let pqSig = null;
      let pqPubkeyBytes: Uint8Array | null = null;
      let signer: Falcon512Signer | null = null;
      if (
        policyTag === PolicyTag.High ||
        policyTag === PolicyTag.Critical
      ) {
        patchStep("pq", { status: "running" });
        const t4 = performance.now();
        signer = await resolveFalcon512Signer();
        setSignerSource(signer.source);
        pqPubkeyBytes = signer.publicKey;
        pqSig = await signer.signOp(computedOpHash);
        const sigBytes = hexToBytes(pqSig.sigBytes).length;
        setPqSigSize(sigBytes);
        patchStep("pq", {
          status: "ok",
          detail: `${sigBytes} B real Falcon sig · source=${signer.source}`,
          ms: Math.round(performance.now() - t4),
        });
      } else {
        patchStep("pq", { status: "ok", detail: "skipped (LOW = ECDSA only)" });
      }

      const sigsHex = signers.encodeSignatures(ecdsaSig, pqSig);
      op.signatures = sigsHex;

      // 5. submit ----------------------------------------------------------
      patchStep("submit", { status: "running" });
      const t5 = performance.now();
      const opBytes = encodeUserOp(op);
      const pqPubkeyHex: Hex = pqPubkeyBytes
        ? (`0x${Array.from(pqPubkeyBytes).map((b) => b.toString(16).padStart(2, "0")).join("")}` as Hex)
        : ("0x" as Hex);

      const sentTx = await walletClient.writeContract({
        address: account,
        abi: abi.nexoraAccountAbi,
        functionName: "executeUserOp",
        args: [opBytes, pqPubkeyHex],
        account: walletClient.account,
        chain: walletClient.chain,
        value,
      });
      setTxHash(sentTx);
      patchStep("submit", {
        status: "ok",
        detail: `tx ${shorten(sentTx)}`,
        ms: Math.round(performance.now() - t5),
      });
      onTx?.({ hash: sentTx, tag: policyTag, scheme });

      // 6. confirm — handled by the useWaitForTransactionReceipt effect.
      patchStep("confirm", { status: "running" });
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      setErrorMsg(msg);
      // Mark whichever step is currently "running" as failed.
      setSteps((prev) =>
        prev.map((s) => (s.status === "running" ? { ...s, status: "error", detail: msg } : s)),
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rounded-xl border border-nexora-border bg-nexora-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
            4 · Send transaction
          </h3>
          <p className="mt-2 text-xs text-zinc-500">
            Demo presets exercise each policy band. HIGH and CRITICAL paths
            both run real Falcon-512 signing client-side and on-chain
            verification.
          </p>
        </div>
        <SchemeBadge scheme={scheme} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <PresetBtn onClick={() => applyPreset("low")} title="ECDSA only">
          {DEMO_PRESETS.low.label}
        </PresetBtn>
        <PresetBtn onClick={() => applyPreset("high")} title="ECDSA + Falcon-512">
          {DEMO_PRESETS.high.label}
        </PresetBtn>
        <PresetBtn
          onClick={() => applyPreset("critical")}
          title="Falcon-512 + 60s timelock channel"
        >
          {DEMO_PRESETS.critical.label}
        </PresetBtn>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-zinc-500">
            verifier
          </span>
          <select
            className="rounded-md border border-nexora-border bg-zinc-950 px-2 py-1 text-[11px] font-mono text-zinc-300"
            value={scheme}
            onChange={(e) => setScheme(Number(e.target.value) as VerifierScheme)}
          >
            <option
              value={VerifierScheme.Falcon512}
              disabled={
                !deployments.pqVerifierFalcon512 ||
                deployments.pqVerifierFalcon512 === ADDR_ZERO
              }
            >
              Falcon-512 · scheme 2 (real)
            </option>
            {showLegacy && (
              <option value={VerifierScheme.FalconMock}>
                FALCON_MOCK · scheme 1 (legacy)
              </option>
            )}
          </select>
          <label className="flex items-center gap-1 text-[10px] text-zinc-500">
            <input
              type="checkbox"
              className="accent-nexora-accent"
              checked={showLegacy}
              onChange={(e) => {
                setShowLegacy(e.target.checked);
                if (!e.target.checked) setScheme(VerifierScheme.Falcon512);
              }}
            />
            show legacy
          </label>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Target">
          <input
            className="w-full rounded-md border border-nexora-border bg-zinc-950 px-3 py-2 font-mono text-xs"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="0x..."
          />
        </Field>
        <Field label="Value (ETH)">
          <input
            className="w-full rounded-md border border-nexora-border bg-zinc-950 px-3 py-2 font-mono text-xs"
            value={valueEth}
            onChange={(e) => setValueEth(e.target.value)}
            placeholder="0.001"
          />
        </Field>
        <Field label="Calldata (hex)">
          <input
            className="w-full rounded-md border border-nexora-border bg-zinc-950 px-3 py-2 font-mono text-xs"
            value={callData}
            onChange={(e) => setCallData(e.target.value)}
          />
        </Field>
        <Field label="Predicted tag">
          {tag === null ? (
            <span className="text-xs text-zinc-500">— run send to classify</span>
          ) : (
            <span
              className={`inline-block rounded-md px-2 py-1 text-xs ${TAG_CLASS[tag]}`}
            >
              {TAG_LABEL[tag]}
            </span>
          )}
        </Field>
      </div>

      <div className="mt-5 rounded-md border border-nexora-border bg-zinc-900/30 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">
            Pipeline
          </span>
          {pqSigSize !== null && (
            <span className="text-[10px] font-mono text-emerald-400">
              {pqSigSize} B Falcon sig + 65 B ECDSA submitted
            </span>
          )}
        </div>
        <ol className="mt-3 space-y-1.5">
          {steps.map((s) => (
            <li key={s.id} className="flex items-baseline gap-3 text-xs">
              <StepDot status={s.status} />
              <span className="w-44 shrink-0 font-mono text-zinc-300">
                {s.label}
              </span>
              <span className="flex-1 truncate text-zinc-500 font-mono">
                {s.detail ?? "—"}
              </span>
              {s.ms !== undefined && (
                <span className="shrink-0 text-[10px] text-zinc-600 font-mono">
                  {s.ms} ms
                </span>
              )}
            </li>
          ))}
        </ol>
        {opHash && (
          <div className="mt-3 break-all border-t border-nexora-border pt-2 font-mono text-[11px] text-zinc-500">
            opHash {opHash}
          </div>
        )}
        {signerSource && (
          <div className="mt-1 text-[11px] text-zinc-500">
            signer source ·{" "}
            <span className="font-mono text-emerald-400">{signerSource}</span>
          </div>
        )}
      </div>

      {!allOk && (
        <ul className="mt-4 space-y-1 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
          {preconditions
            .filter((p) => !p.ok)
            .map((p) => (
              <li key={p.label} className="flex items-center gap-2">
                <span>•</span>
                <span>{p.label}</span>
                {p.fix && onJumpToStep && (
                  <button
                    type="button"
                    onClick={() => onJumpToStep(p.fix!.step)}
                    className="ml-auto rounded border border-amber-500/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-300 hover:bg-amber-500/10"
                  >
                    {p.fix.label}
                  </button>
                )}
              </li>
            ))}
        </ul>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          className="rounded-md bg-nexora-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={send}
          disabled={!walletClient || !connector || !allOk || running}
        >
          {running ? "Signing & submitting…" : "Sign & send"}
        </button>
        {txHash && (
          <a
            className="break-all font-mono text-[11px] text-emerald-300 underline decoration-dotted hover:text-emerald-200"
            href={explorerTxUrl(txHash)}
            target="_blank"
            rel="noreferrer"
            title="open trace"
          >
            {txHash}
          </a>
        )}
        {txHash && (
          <a
            className="text-[11px] text-zinc-400 hover:text-nexora-accent"
            href={explorerTxUrl(txHash)}
            target="_blank"
            rel="noreferrer"
          >
            open trace ↗
          </a>
        )}
      </div>

      {errorMsg && (
        <div className="mt-3 break-all rounded-md border border-amber-500/40 bg-amber-500/5 p-3 font-mono text-xs text-amber-300">
          {errorMsg}
        </div>
      )}

      <div className="mt-4 text-xs text-zinc-500">
        <span className={`mr-1 inline-block rounded px-1.5 py-0.5 ${TAG_CLASS[PolicyTag.Low]}`}>
          LOW
        </span>
        ECDSA only ·
        <span className={`mx-1 inline-block rounded px-1.5 py-0.5 ${TAG_CLASS[PolicyTag.High]}`}>
          HIGH
        </span>
        ECDSA + PQ ·
        <span className={`ml-1 inline-block rounded px-1.5 py-0.5 ${TAG_CLASS[PolicyTag.Critical]}`}>
          CRITICAL
        </span>
        PQ + 60s timelock
      </div>
    </div>
  );
}

function StepDot({ status }: { status: Status }) {
  const map: Record<Status, string> = {
    idle: "bg-zinc-700",
    running: "bg-amber-400 animate-pulse",
    ok: "bg-emerald-400",
    error: "bg-red-500",
  };
  return (
    <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${map[status]}`} />
  );
}

function PresetBtn({
  children,
  onClick,
  title,
}: {
  children: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      className="rounded-md border border-nexora-border bg-zinc-900/50 px-2 py-1.5 text-[11px] text-zinc-300 hover:border-nexora-accent hover:text-white"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-500">
      <span className="uppercase tracking-wider">{label}</span>
      {children}
    </label>
  );
}

function SchemeBadge({ scheme }: { scheme: VerifierScheme }) {
  const palette =
    scheme === VerifierScheme.Falcon512
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      : "border-amber-500/40 bg-amber-500/10 text-amber-300";
  const label =
    scheme === VerifierScheme.Falcon512
      ? "scheme 2 · Falcon-512"
      : `scheme ${scheme} · legacy`;
  return (
    <span
      className={`shrink-0 rounded-md border px-2 py-1 text-[10px] uppercase tracking-wider ${palette}`}
    >
      {label}
    </span>
  );
}

function shorten(h: string): string {
  if (h.length <= 14) return h;
  return `${h.slice(0, 8)}…${h.slice(-6)}`;
}

function parseEthSafe(s: string): bigint {
  if (!s) return 0n;
  try {
    return parseEther(s as `${number}`);
  } catch {
    return 0n;
  }
}
