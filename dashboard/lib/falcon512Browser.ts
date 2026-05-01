"use client";

import { type Hex, hexToBytes } from "viem";
import type { Falcon512Adapter } from "@nexora/wallet-sdk/signers";

/**
 * Browser-side Falcon-512 signer.
 *
 * The dashboard ships a pre-built `wasm-bindgen` bundle under
 * `dashboard/public/wasm/falcon512/` (built from
 * `signer/falcon-signer-wasm`). We load it lazily on first use via a
 * runtime dynamic import marked with `webpackIgnore` so Next.js does not
 * try to resolve the absolute path at build time.
 *
 * If loading fails (older browser, file:// origin, asset moved, etc.),
 * the dashboard transparently falls back to the local `falcon-signer`
 * HTTP daemon — see `dashboard/lib/falcon512Storage.ts`.
 */

interface WasmKeygenResult {
  publicKey: string;
  secretKey: string;
  commitment: string;
}

interface WasmModule {
  default: (input?: string | URL | Request | Response) => Promise<unknown>;
  keygen: (seed_hex: string) => WasmKeygenResult;
  sign: (secret_key_hex: string, hash_hex: string) => string;
}

const WASM_JS_URL = "/wasm/falcon512/nexora_falcon512.js";
const WASM_BIN_URL = "/wasm/falcon512/nexora_falcon512_bg.wasm";

let wasmPromise: Promise<WasmModule | null> | null = null;

async function loadWasm(): Promise<WasmModule | null> {
  if (typeof window === "undefined") return null;
  if (wasmPromise) return wasmPromise;
  wasmPromise = (async () => {
    try {
      const mod = (await import(
        /* webpackIgnore: true */ /* @vite-ignore */ WASM_JS_URL
      )) as WasmModule;
      // wasm-bindgen `--target web` requires an explicit `init(url)` call
      // before any export is usable.
      await mod.default(WASM_BIN_URL);
      return mod;
    } catch (e) {
      console.warn(
        "[falcon512Browser] wasm bundle not available, daemon fallback will be used:",
        e,
      );
      return null;
    }
  })();
  return wasmPromise;
}

/**
 * Has the wasm bundle loaded successfully? Used by UI badges to display
 * `signer source: browser-wasm` vs `daemon`.
 */
export async function isWasmAvailable(): Promise<boolean> {
  const m = await loadWasm();
  return m !== null;
}

export interface BrowserKeypair {
  publicKey: Uint8Array; // 897 bytes
  secretKeyHex: Hex; // 1281-byte Falcon-512 secret, hex-encoded with 0x prefix
  commitment: Hex; // keccak256(publicKey)
}

function randomSeedHex(): Hex {
  const seed = new Uint8Array(32);
  crypto.getRandomValues(seed);
  let s = "0x";
  for (const b of seed) s += b.toString(16).padStart(2, "0");
  return s as Hex;
}

/**
 * Generate a fresh Falcon-512 keypair entirely in the browser using the
 * `wasm-bindgen` bundle. Throws if the bundle failed to load — callers can
 * surface that and ask the user to use the daemon fallback.
 */
export async function generateBrowserKeypair(): Promise<BrowserKeypair> {
  const mod = await loadWasm();
  if (!mod) {
    throw new Error(
      "Falcon-512 wasm bundle is not available in this browser. " +
        "Falling back to the local falcon-signer daemon.",
    );
  }
  const seedHex = randomSeedHex();
  const r = mod.keygen(seedHex);
  return {
    publicKey: hexToBytes(r.publicKey as Hex),
    secretKeyHex: r.secretKey as Hex,
    commitment: r.commitment as Hex,
  };
}

/**
 * Sign a 32-byte op hash with the given secret key. Returns the canonical
 * 666-byte Falcon-512 signature, hex-encoded.
 */
export async function signFalcon512Browser(
  opHash: Hex,
  secretKeyHex: Hex,
): Promise<Hex> {
  const mod = await loadWasm();
  if (!mod) {
    throw new Error("Falcon-512 wasm bundle not available");
  }
  return mod.sign(secretKeyHex, opHash) as Hex;
}

/**
 * Build a {@link Falcon512Adapter} backed by the browser-wasm bundle. The
 * adapter holds the secret key in a closure for the lifetime of the page;
 * persistence is the caller's responsibility (see
 * `dashboard/lib/falcon512Storage.ts`).
 */
export function makeBrowserFalcon512Adapter(
  kp: BrowserKeypair,
): Falcon512Adapter {
  return {
    source: "browser-wasm",
    async getPublicKey(): Promise<Uint8Array> {
      return kp.publicKey;
    },
    async sign(opHash: Hex): Promise<Hex> {
      return signFalcon512Browser(opHash, kp.secretKeyHex);
    },
  };
}
