"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type Address,
  type Hex,
  bytesToHex,
  keccak256,
  parseEther,
  isAddress,
  isHex,
  zeroHash,
} from "viem";
import { useAccount, usePublicClient, useReadContract, useWalletClient } from "wagmi";
import {
  NexoraClient,
  PolicyTag,
  VerifierScheme,
  abi,
} from "@nexora/wallet-sdk";
import type {
  Falcon512Keypair,
  FalconMockKeypair,
} from "@nexora/wallet-sdk/signers";
import { loadFalcon512Keypair } from "@nexora/wallet-sdk/signers";
import type { Deployments } from "@/lib/deployments";
import { getFalcon512SignerUrl } from "@/lib/falcon512Storage";

interface Props {
  owner: Address;
  falconKp: FalconMockKeypair | null;
  deployments: Deployments;
}

const SCHEME_STORAGE_KEY = "nexora.scheme.v1";

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

/** Match `agent/src/intentDemo.ts` + policy engine thresholds (1 ETH → HIGH, 100 ETH → CRITICAL). */
const DEMO_PRESETS = {
  low: {
    label: "LOW · ECDSA only",
    valueEth: "0.001",
    callData: "0x",
  },
  high: {
    label: "HIGH · ECDSA + PQ",
    valueEth: "5",
    callData: "0xa1b2c3d4" as Hex,
  },
  critical: {
    label: "CRITICAL · PQ + timelock",
    valueEth: "250",
    callData: "0xdeadbeef" as Hex,
  },
} as const;

const ADDR_ZERO = "0x0000000000000000000000000000000000000000";

export function SendForm({ owner, falconKp, deployments }: Props) {
  const { connector } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [target, setTarget] = useState<string>(deployments.bridgeMock);
  const [valueEth, setValueEth] = useState<string>("0.001");
  const [callData, setCallData] = useState<string>("0x");
  const [status, setStatus] = useState<string>("idle");
  const [tag, setTag] = useState<number | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [scheme, setScheme] = useState<VerifierScheme>(VerifierScheme.FalconMock);
  const [falcon512Kp, setFalcon512Kp] = useState<Falcon512Keypair | null>(null);
  const [falcon512Status, setFalcon512Status] = useState<string>("");

  // Persist scheme choice across reloads.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(SCHEME_STORAGE_KEY);
    if (stored === String(VerifierScheme.Falcon512)) {
      setScheme(VerifierScheme.Falcon512);
    }
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SCHEME_STORAGE_KEY, String(scheme));
  }, [scheme]);

  // When the user picks Falcon-512, fetch the daemon pubkey lazily.
  useEffect(() => {
    let cancelled = false;
    if (scheme !== VerifierScheme.Falcon512) {
      setFalcon512Status("");
      return;
    }
    if (falcon512Kp) return;
    const url = getFalcon512SignerUrl();
    setFalcon512Status(`fetching pubkey from ${url}…`);
    loadFalcon512Keypair({ signerUrl: url })
      .then((kp) => {
        if (cancelled) return;
        setFalcon512Kp(kp);
        setFalcon512Status(
          `daemon ok · pubkey=${bytesToHex(kp.publicKey).slice(0, 14)}…`,
        );
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setFalcon512Status(`daemon unreachable: ${e.message}`);
      });
    return () => {
      cancelled = true;
    };
  }, [scheme, falcon512Kp]);

  const ownerAccount = useMemo(() => walletClient?.account, [walletClient]);

  const activePqKp =
    scheme === VerifierScheme.Falcon512 ? falcon512Kp : falconKp;
  const pqHash = activePqKp
    ? keccak256(bytesToHex(activePqKp.publicKey))
    : zeroHash;

  const smartAccount = useReadContract({
    address: deployments.accountFactory,
    abi: abi.accountFactoryAbi,
    functionName: "predictAddress",
    args: [owner, pqHash, zeroHash],
    query: {
      enabled:
        Boolean(activePqKp) &&
        deployments.accountFactory !== "0x0000000000000000000000000000000000000000",
    },
  });

  const accountAddress =
    deployments.account ?? (smartAccount.data as Address | undefined);

  useEffect(() => {
    const b = deployments.bridgeMock;
    if (!b || b === ADDR_ZERO) return;
    setTarget((prev) =>
      prev === ADDR_ZERO || prev === "" || !isAddress(prev) ? b : prev,
    );
  }, [deployments.bridgeMock]);

  function applyPreset(key: keyof typeof DEMO_PRESETS) {
    const p = DEMO_PRESETS[key];
    const t =
      deployments.bridgeMock !== ADDR_ZERO
        ? deployments.bridgeMock
        : target;
    setTarget(t);
    setValueEth(p.valueEth);
    setCallData(p.callData);
    setTag(null);
    setTxHash(null);
    setStatus("idle");
  }

  async function preview() {
    if (!publicClient || !isAddress(target)) return;
    const value = parseEth(valueEth);
    const data = (isHex(callData) ? callData : "0x") as Hex;
    const out = (await publicClient.readContract({
      address: deployments.policyEngine,
      abi: abi.policyEngineAbi,
      functionName: "classify",
      args: [owner, target as Address, value, data],
    })) as number;
    setTag(out);
  }

  async function send() {
    if (!walletClient || !ownerAccount || !publicClient) return;
    if (!activePqKp) {
      setStatus(
        scheme === VerifierScheme.Falcon512
          ? "error: Falcon-512 daemon not reachable — start `falcon-signer serve`"
          : "error: scheme 1 keypair missing",
      );
      return;
    }
    if (!accountAddress) {
      setStatus("error: smart account address unavailable (check factory + key)");
      return;
    }
    if (!isAddress(target)) {
      setStatus("invalid target");
      return;
    }
    setStatus("preparing");
    try {
      const client = new NexoraClient({
        publicClient,
        walletClient,
        account: accountAddress,
        policyEngine: deployments.policyEngine,
        owner: ownerAccount,
        pqKeypair: activePqKp,
        scheme,
        falcon512:
          scheme === VerifierScheme.Falcon512
            ? { signerUrl: getFalcon512SignerUrl() }
            : undefined,
      });
      const { txHash } = await client.execute({
        target: target as Address,
        value: parseEth(valueEth),
        callData: (isHex(callData) ? callData : "0x") as Hex,
      });
      setTxHash(txHash);
      setStatus("submitted");
    } catch (e) {
      setStatus(`error: ${(e as Error).message}`);
    }
  }

  return (
    <div className="rounded-xl border border-nexora-border bg-nexora-card p-6">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
        Send transaction
      </h3>
      <p className="mt-2 text-xs text-zinc-500">
        Demo presets match the policy engine: &gt;1 ETH → HIGH, &gt;100 ETH → CRITICAL. HIGH uses
        non-empty calldata so the 4-byte prefix can trigger HIGH rules on some configs.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <PresetBtn onClick={() => applyPreset("low")} title="Small transfer — ECDSA only">
          {DEMO_PRESETS.low.label}
        </PresetBtn>
        <PresetBtn onClick={() => applyPreset("high")} title="Bridge-style — ECDSA + PQ (scheme 1)">
          {DEMO_PRESETS.high.label}
        </PresetBtn>
        <PresetBtn onClick={() => applyPreset("critical")} title="Treasury-sized — PQ + timelock channel">
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
            <option value={VerifierScheme.FalconMock}>FALCON_MOCK · scheme 1</option>
            <option
              value={VerifierScheme.Falcon512}
              disabled={
                !deployments.pqVerifierFalcon512 ||
                deployments.pqVerifierFalcon512 === ADDR_ZERO
              }
            >
              Falcon-512 real (2)
            </option>
          </select>
        </div>
      </div>
      {scheme === VerifierScheme.Falcon512 && falcon512Status && (
        <p className="mt-2 text-[11px] text-amber-400/80 font-mono">{falcon512Status}</p>
      )}
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
            <span className="text-xs text-zinc-500">— preview to classify</span>
          ) : (
            <span className={`inline-block rounded-md px-2 py-1 text-xs ${TAG_CLASS[tag]}`}>
              {TAG_LABEL[tag]}
            </span>
          )}
        </Field>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          className="rounded-md border border-nexora-border px-4 py-2 text-sm hover:border-nexora-accent"
          onClick={preview}
        >
          Classify
        </button>
        <button
          className="rounded-md bg-nexora-accent px-4 py-2 text-sm font-medium text-white"
          onClick={send}
          disabled={!walletClient || !connector || !accountAddress}
        >
          Sign &amp; send
        </button>
        <span className="text-xs text-zinc-500 font-mono">{status}</span>
      </div>

      {txHash && (
        <div className="mt-4 break-all rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 font-mono text-xs text-emerald-300">
          tx: {txHash}
        </div>
      )}

      <div className="mt-4 text-xs text-zinc-500">
        <span className={`mr-1 inline-block rounded px-1.5 py-0.5 ${TAG_CLASS[PolicyTag.Low]}`}>LOW</span>
        ECDSA only ·
        <span className={`mx-1 inline-block rounded px-1.5 py-0.5 ${TAG_CLASS[PolicyTag.High]}`}>HIGH</span>
        ECDSA + PQ ·
        <span className={`ml-1 inline-block rounded px-1.5 py-0.5 ${TAG_CLASS[PolicyTag.Critical]}`}>CRITICAL</span>
        PQ + 60s timelock
      </div>
    </div>
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

function parseEth(s: string): bigint {
  if (!s) return 0n;
  try {
    return parseEther(s as `${number}`);
  } catch {
    return 0n;
  }
}

// Anchors zeroHash so the tag class doesn't get tree-shaken when CSS
// is generated only from JS (Tailwind safelisting is handled in CSS).
void zeroHash;
