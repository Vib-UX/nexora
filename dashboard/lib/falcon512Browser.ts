"use client";

import {
  type Falcon512Keypair,
  type Falcon512SignOpts,
} from "@nexora/wallet-sdk/signers";
import {
  hexToBytes,
  bytesToHex,
  keccak256,
  type Hex,
} from "viem";
import { FALCON512_BROWSER_ENABLED, getFalcon512SignerUrl } from "./falcon512Storage";

/**
 * Browser-side wasm-bindgen Falcon-512 signer (opt-in).
 *
 * When `NEXT_PUBLIC_FALCON512_BROWSER=1` is set, lazy-load the wasm bundle
 * built from `signer/falcon-signer-wasm` and use it for signing. Otherwise
 * fall back to the local HTTP daemon.
 *
 * The bundle is expected at `@nexora/wallet-sdk/wasm/...` — see
 * `wallet-sdk/wasm/README.md` for build instructions. The dynamic import is
 * wrapped in a `try`/`catch` so the dashboard still renders if the bundle
 * hasn't been built.
 */

interface WasmModule {
  keygen: (seed_hex: string) => {
    publicKey: string;
    secretKey: string;
    commitment: string;
  };
  sign: (secret_key_hex: string, hash_hex: string) => string;
}

let wasmPromise: Promise<WasmModule | null> | null = null;

async function loadWasm(): Promise<WasmModule | null> {
  if (!FALCON512_BROWSER_ENABLED) return null;
  if (wasmPromise) return wasmPromise;
  wasmPromise = (async () => {
    try {
      // The wasm bundle is opt-in; @nexora/wallet-sdk does not declare a
      // hard import dependency on it. We use a runtime dynamic import
      // wrapped in a `Function` indirection so bundlers don't try to
      // resolve the path at compile time when the bundle isn't built yet.
      // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
      const dynImport = new Function("p", "return import(p)") as (
        p: string,
      ) => Promise<unknown>;
      const mod = (await dynImport(
        "@nexora/wallet-sdk/wasm/nexora_falcon_signer_wasm.js",
      )) as { default?: () => Promise<unknown> } & WasmModule;
      if (typeof mod.default === "function") {
        await mod.default();
      }
      return mod as WasmModule;
    } catch (e) {
      console.warn(
        "[falcon512Browser] wasm bundle not available, falling back to daemon:",
        e,
      );
      return null;
    }
  })();
  return wasmPromise;
}

/**
 * Browser-side keygen (only used when the wasm path is enabled). Falls back
 * to the daemon's `/pubkey` if wasm is unavailable.
 */
export async function browserKeygenFalcon512(
  seedHex: Hex,
): Promise<Falcon512Keypair | null> {
  const wasm = await loadWasm();
  if (!wasm) return null;
  const r = wasm.keygen(seedHex);
  return {
    publicKey: hexToBytes(r.publicKey as Hex),
    secretRef: r.secretKey,
  };
}

/**
 * Returns a `Falcon512SignOpts.fetchImpl` that, when wasm is loaded, signs
 * locally instead of POSTing to the daemon. The shape conforms to the daemon
 * response so the existing `signFalcon512` SDK function works unchanged.
 */
export function browserFalcon512Opts(
  kp: Falcon512Keypair,
  fallbackUrl: string = getFalcon512SignerUrl(),
): Falcon512SignOpts {
  if (!FALCON512_BROWSER_ENABLED) return { signerUrl: fallbackUrl };
  return {
    signerUrl: fallbackUrl,
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const wasm = await loadWasm();
      if (!wasm) {
        return fetch(input, init);
      }
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/sign") && init?.method === "POST") {
        const { hash } = JSON.parse(init.body as string) as { hash: Hex };
        const sig = wasm.sign(kp.secretRef, hash);
        const pubkey = bytesToHex(kp.publicKey);
        return new Response(
          JSON.stringify({
            sig,
            pubkey,
            commitment: keccak256(pubkey),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return fetch(input, init);
    }) as typeof fetch,
  };
}
