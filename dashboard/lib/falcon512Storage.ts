"use client";

import {
  type Falcon512Keypair,
  loadFalcon512Keypair as fetchFalcon512Keypair,
  serializeFalcon512Keypair,
  deserializeFalcon512Keypair,
} from "@nexora/wallet-sdk/signers";

/**
 * Real Falcon-512 keypair storage for the dashboard.
 *
 * Keygen + sign happen in the local `falcon-signer` daemon (see
 * `signer/falcon-signer`). The dashboard only caches the *public* key in
 * localStorage so we can show the commitment / pre-fill the smart-account
 * predict_address call without hitting the daemon every render.
 *
 * Browser-side signing via wasm-bindgen is the eventual goal (gated behind
 * `NEXT_PUBLIC_FALCON512_BROWSER=1`); see `docs/architecture.md` →
 * "PQ verifier roadmap" for the plan.
 */

const STORAGE_KEY = "nexora.falcon512.kp.v1";

export const FALCON512_BROWSER_ENABLED =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_FALCON512_BROWSER === "1";

export function getFalcon512SignerUrl(): string {
  if (typeof process === "undefined") return "http://127.0.0.1:9090";
  return process.env.NEXT_PUBLIC_FALCON512_SIGNER_URL ?? "http://127.0.0.1:9090";
}

/**
 * Returns the cached pubkey (if any), otherwise asks the daemon for one and
 * caches it. Does NOT trigger keygen on the daemon — assumes the daemon was
 * started with a `keys.json` already.
 */
export async function loadOrFetchFalcon512Keypair(
  signerUrl: string = getFalcon512SignerUrl(),
): Promise<Falcon512Keypair> {
  if (typeof window !== "undefined") {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) {
      try {
        const kp = deserializeFalcon512Keypair(existing);
        if (kp.publicKey.length === 897) return kp;
      } catch {
        // fall through and refetch
      }
    }
  }
  const kp = await fetchFalcon512Keypair({ signerUrl });
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, serializeFalcon512Keypair(kp));
  }
  return kp;
}

export function clearFalcon512Keypair(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
