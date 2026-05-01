"use client";

import {
  type Falcon512Adapter,
  type Falcon512Signer,
  makeDaemonFalcon512Adapter,
  makeFalcon512Signer,
} from "@nexora/wallet-sdk/signers";
import { VerifierScheme } from "@nexora/wallet-sdk";
import { type Hex, bytesToHex, hexToBytes, keccak256 } from "viem";
import {
  type BrowserKeypair,
  generateBrowserKeypair,
  isWasmAvailable,
  makeBrowserFalcon512Adapter,
} from "./falcon512Browser";

/**
 * Falcon-512 keystore + signer factory for the dashboard.
 *
 * The browser path is the default: keys are generated in-browser via the
 * `wasm-bindgen` bundle and the secret is cached in `localStorage` under
 * {@link STORAGE_KEY}. The daemon path is a transparent fallback when the
 * wasm bundle fails to load.
 *
 * Demo-grade caveat: persisting raw Falcon-512 secret material in
 * localStorage is appropriate for a public devnet demo only. For a
 * production wallet this seed would come from a passkey / WebAuthn-derived
 * key (see `docs/architecture.md` → "PQ verifier roadmap"), an OS keychain
 * binding, or stay entirely on a hardware signer.
 */

const STORAGE_KEY = "nexora.falcon512.sk.v1";

interface StoredKeypair {
  publicKey: Hex; // 897-byte Falcon-512 public key
  secretKey: Hex; // 1281-byte Falcon-512 secret key
  commitment: Hex; // keccak256(publicKey)
  /// ms-since-epoch when the keypair was generated.
  createdAt: number;
}

export type SignerSource = "browser-wasm" | "daemon" | "none";

export interface DashboardKeypairView {
  publicKey: Uint8Array;
  publicKeyHex: Hex;
  pubkeyHash: Hex;
  source: SignerSource;
  /// Sizes in bytes — useful for the "real Falcon" demo badges.
  publicKeyLen: number;
  secretKeyLen: number;
  /// `Date.now()` of generation (browser path only).
  createdAt?: number;
}

export const FALCON512_BROWSER_OPT_OUT =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_FALCON512_BROWSER === "0";

export function getFalcon512SignerUrl(): string {
  if (typeof process === "undefined") return "http://127.0.0.1:9090";
  return (
    process.env.NEXT_PUBLIC_FALCON512_SIGNER_URL ?? "http://127.0.0.1:9090"
  );
}

/* -------------------------------------------------------------------- */
/*  Persistence                                                         */
/* -------------------------------------------------------------------- */

function readStored(): StoredKeypair | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as StoredKeypair;
    if (
      typeof o.publicKey !== "string" ||
      typeof o.secretKey !== "string" ||
      typeof o.commitment !== "string"
    )
      return null;
    if (hexToBytes(o.publicKey).length !== 897) return null;
    if (hexToBytes(o.secretKey).length === 0) return null;
    return o;
  } catch {
    return null;
  }
}

function writeStored(kp: BrowserKeypair): StoredKeypair {
  if (typeof window === "undefined") {
    throw new Error("writeStored called outside the browser");
  }
  const stored: StoredKeypair = {
    publicKey: bytesToHex(kp.publicKey),
    secretKey: kp.secretKeyHex,
    commitment: kp.commitment,
    createdAt: Date.now(),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  return stored;
}

/* -------------------------------------------------------------------- */
/*  Public API                                                          */
/* -------------------------------------------------------------------- */

/**
 * Inspect what is currently in the keystore. Returns `null` if the user
 * hasn't generated keys yet. Does NOT touch the network or wasm.
 */
export function readKeypair(): DashboardKeypairView | null {
  const s = readStored();
  if (!s) return null;
  const publicKey = hexToBytes(s.publicKey);
  return {
    publicKey,
    publicKeyHex: s.publicKey,
    pubkeyHash: s.commitment,
    source: "browser-wasm",
    publicKeyLen: publicKey.length,
    secretKeyLen: hexToBytes(s.secretKey).length,
    createdAt: s.createdAt,
  };
}

/**
 * Generate a fresh keypair via the browser wasm bundle and persist the
 * secret in localStorage. Throws if wasm is unavailable — callers should
 * surface that and offer the daemon fallback (see {@link probeDaemon}).
 */
export async function generateBrowserKeypairAndStore(): Promise<DashboardKeypairView> {
  const kp = await generateBrowserKeypair();
  const stored = writeStored(kp);
  return {
    publicKey: kp.publicKey,
    publicKeyHex: bytesToHex(kp.publicKey),
    pubkeyHash: stored.commitment,
    source: "browser-wasm",
    publicKeyLen: kp.publicKey.length,
    secretKeyLen: hexToBytes(kp.secretKeyHex).length,
    createdAt: stored.createdAt,
  };
}

/** Wipe the cached keypair. */
export function clearKeypair(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

/** Lightweight daemon health check used by the UI badge. */
export async function probeDaemon(
  url: string = getFalcon512SignerUrl(),
): Promise<{ ok: boolean; pubkey?: Hex; error?: string }> {
  try {
    const r = await fetch(`${url}/pubkey`);
    if (!r.ok) return { ok: false, error: `${r.status}` };
    const j = (await r.json()) as { pubkey: Hex; scheme: number };
    if (j.scheme !== VerifierScheme.Falcon512) {
      return { ok: false, error: `wrong scheme ${j.scheme}` };
    }
    return { ok: true, pubkey: j.pubkey };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Build a ready-to-sign {@link Falcon512Signer} from whatever the
 * dashboard currently has access to.
 *
 * Resolution order:
 *
 *  1. If a keypair exists in localStorage AND the wasm bundle is available
 *     → browser-wasm signer (no network).
 *  2. Else if the local daemon is reachable AND its pubkey matches a
 *     stored Falcon-512 pubkey (or no stored pubkey) → daemon signer.
 *  3. Else throws.
 */
export async function resolveFalcon512Signer(opts?: {
  preferDaemon?: boolean;
  signerUrl?: string;
}): Promise<Falcon512Signer> {
  const url = opts?.signerUrl ?? getFalcon512SignerUrl();
  const stored = readStored();

  if (!opts?.preferDaemon && stored && (await isWasmAvailable())) {
    const adapter = makeBrowserFalcon512Adapter({
      publicKey: hexToBytes(stored.publicKey),
      secretKeyHex: stored.secretKey,
      commitment: stored.commitment,
    });
    return makeFalcon512Signer(adapter);
  }

  // Daemon fallback. The daemon brings its own keypair; we don't expect
  // it to match the browser-stored one (different keystores).
  const daemonAdapter: Falcon512Adapter = makeDaemonFalcon512Adapter({
    signerUrl: url,
  });
  return makeFalcon512Signer(daemonAdapter);
}

/**
 * Pure helper used by AccountCard / DeployAccountCard before the user has
 * generated keys: returns the zero-hash if no keypair is present so we
 * don't pre-render a wrong predicted address.
 */
export function pubkeyHashOrZero(view: DashboardKeypairView | null): Hex {
  return (view?.pubkeyHash ?? `0x${"0".repeat(64)}`) as Hex;
}

/** Used by KeygenCard / SendForm to format sizes for display. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KiB`;
}

/**
 * Compute the keccak256 commitment of an arbitrary Falcon-512 public key.
 * Re-exported here so components that already import this module don't
 * have to pull viem directly.
 */
export function commitFalcon512Pubkey(pk: Uint8Array): Hex {
  return keccak256(bytesToHex(pk));
}
