/**
 * Real Falcon-512 signer.
 *
 * Two execution modes are supported:
 *
 *  1. **Browser wasm** (default in the dashboard) — the
 *     `signer/falcon-signer-wasm` crate compiled with `wasm-pack` runs
 *     keygen and sign in the visitor's browser. The dashboard injects a
 *     {@link Falcon512Adapter} that wraps the wasm bindings.
 *
 *  2. **Daemon HTTP** — the `signer/falcon-signer` Rust binary runs as a
 *     local process and exposes `GET /pubkey` + `POST /sign`. Used by
 *     Node-side callers (the agent, scripts) and as a browser fallback
 *     when wasm fails to load.
 *
 * Both modes converge on the same {@link Falcon512Signer} surface, which
 * the {@link NexoraClient} consumes.
 */

import {
  type Hex,
  bytesToHex,
  hexToBytes,
  keccak256,
  toHex,
} from "viem";
import type { PqSig } from "../types.js";
import { VerifierScheme } from "../types.js";

import {
  FALCON512_PUBKEY_BYTES as PK_LEN,
  FALCON512_SIG_BYTES as SIG_LEN,
} from "./falconMock.js";

export const FALCON512_REAL_PUBKEY_BYTES = PK_LEN;
export const FALCON512_REAL_SIG_BYTES = SIG_LEN;

export interface Falcon512Keypair {
  /** 897-byte Falcon-512 public key (header `0x09` + 14-bit packed coeffs). */
  publicKey: Uint8Array;
  /**
   * Logical handle pointing to the secret key. For the daemon backend this
   * holds the daemon URL; for the browser-wasm backend it holds the
   * localStorage key under which the secret is cached. The actual secret
   * never travels through this object except via the {@link Falcon512Adapter}.
   */
  secretRef: string;
}

export interface Falcon512SignOpts {
  /** Base URL of the local Falcon signer daemon. */
  signerUrl?: string;
  /** Optional fetch override (useful for tests / non-fetch runtimes). */
  fetchImpl?: typeof fetch;
}

const DEFAULT_URL = "http://127.0.0.1:9090";

/**
 * Where Falcon-512 keygen / signing physically runs for a given session.
 */
export type Falcon512Source = "browser-wasm" | "daemon" | "external";

/**
 * Stateless adapter the SDK uses to talk to whichever Falcon-512 backend
 * the host has wired up. Implementations are free to bring their own
 * keystore (browser localStorage, OS keyring, HSM, ...).
 */
export interface Falcon512Adapter {
  source: Falcon512Source;
  /**
   * Sign a 32-byte op hash. Implementations MUST return the canonical
   * 666-byte Falcon-512 signature with the `0x39 || nonce || tail` PQClean
   * layout (or the equivalent FIPS-206 `0x59` header — both are accepted by
   * the on-chain verifier).
   */
  sign(opHash: Hex): Promise<Hex>;
  /**
   * 897-byte Falcon-512 public key. Used by the SDK to construct
   * `pqPubkey` and by the dashboard to compute the `pqPubkeyHash`
   * commitment.
   */
  getPublicKey(): Promise<Uint8Array>;
}

/**
 * Unified signer. Carries the public key and a `sign()` method. The
 * dashboard typically constructs this once after the user clicks
 * "Generate keypair" and reuses it for every UserOp.
 */
export interface Falcon512Signer {
  source: Falcon512Source;
  publicKey: Uint8Array;
  /** Returns a fully-formed `PqSig` ready to be ABI-packed into a UserOp. */
  signOp(opHash: Hex): Promise<PqSig>;
}

/**
 * Build a {@link Falcon512Signer} from an arbitrary adapter. The dashboard
 * passes a wasm-backed adapter; the daemon helpers below produce one
 * automatically.
 */
export async function makeFalcon512Signer(
  adapter: Falcon512Adapter,
): Promise<Falcon512Signer> {
  const publicKey = await adapter.getPublicKey();
  if (publicKey.length !== PK_LEN) {
    throw new Error(
      `falcon512 adapter returned bad pubkey length: ${publicKey.length} (expected ${PK_LEN})`,
    );
  }
  const pubkeyHashHex = keccak256(bytesToHex(publicKey));
  return {
    source: adapter.source,
    publicKey,
    async signOp(opHash: Hex): Promise<PqSig> {
      const sigHex = await adapter.sign(opHash);
      const sigBytes = hexToBytes(sigHex);
      if (sigBytes.length !== SIG_LEN) {
        throw new Error(
          `falcon512 adapter returned bad sig length: ${sigBytes.length} (expected ${SIG_LEN})`,
        );
      }
      return {
        scheme: VerifierScheme.Falcon512,
        pubkeyHash: pubkeyHashHex,
        sigBytes: bytesToHex(sigBytes),
      };
    },
  };
}

/**
 * Build a daemon-backed adapter. The daemon must already be serving
 * `/pubkey` and `/sign` (see `signer/falcon-signer/src/main.rs`).
 */
export function makeDaemonFalcon512Adapter(
  opts: Falcon512SignOpts = {},
): Falcon512Adapter {
  const baseUrl = opts.signerUrl ?? DEFAULT_URL;
  const f = opts.fetchImpl ?? fetch;
  let cached: Uint8Array | null = null;
  return {
    source: "daemon",
    async getPublicKey(): Promise<Uint8Array> {
      if (cached) return cached;
      const r = await f(`${baseUrl}/pubkey`);
      if (!r.ok) {
        throw new Error(`falcon-signer GET /pubkey failed: ${r.status}`);
      }
      const j = (await r.json()) as {
        pubkey: Hex;
        commitment: Hex;
        scheme: number;
      };
      if (j.scheme !== VerifierScheme.Falcon512) {
        throw new Error(`unexpected scheme from signer: ${j.scheme}`);
      }
      const pk = hexToBytes(j.pubkey);
      if (pk.length !== PK_LEN) {
        throw new Error(
          `bad pubkey length from daemon: ${pk.length} (expected ${PK_LEN})`,
        );
      }
      cached = pk;
      return pk;
    },
    async sign(opHash: Hex): Promise<Hex> {
      const r = await f(`${baseUrl}/sign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hash: opHash }),
      });
      if (!r.ok) {
        throw new Error(
          `falcon-signer POST /sign failed: ${r.status} ${await r.text()}`,
        );
      }
      const j = (await r.json()) as {
        sig: Hex;
        pubkey: Hex;
        commitment: Hex;
        error?: string;
      };
      if (j.error) {
        throw new Error(`falcon-signer error: ${j.error}`);
      }
      const expected = await this.getPublicKey();
      if (j.pubkey.toLowerCase() !== bytesToHex(expected).toLowerCase()) {
        throw new Error(
          "falcon-signer pubkey mismatch — daemon serves a different keypair",
        );
      }
      return j.sig;
    },
  };
}

/**
 * Convenience: ask the daemon for its current pubkey + return a
 * {@link Falcon512Keypair} compatible with older SDK call sites.
 */
export async function loadFalcon512Keypair(
  opts: Falcon512SignOpts = {},
): Promise<Falcon512Keypair> {
  const adapter = makeDaemonFalcon512Adapter(opts);
  const publicKey = await adapter.getPublicKey();
  return {
    publicKey,
    secretRef: opts.signerUrl ?? DEFAULT_URL,
  };
}

/**
 * Back-compat helper. Prefer {@link makeFalcon512Signer} +
 * {@link makeDaemonFalcon512Adapter} in new code.
 */
export async function signFalcon512(
  opHash: Hex,
  kp: Falcon512Keypair,
  opts: Falcon512SignOpts = {},
): Promise<PqSig> {
  const baseUrl = opts.signerUrl ?? kp.secretRef ?? DEFAULT_URL;
  const adapter = makeDaemonFalcon512Adapter({
    ...opts,
    signerUrl: baseUrl,
  });
  // Trust the caller's pubkey rather than refetching from the daemon —
  // they already have it in the keypair.
  const signer: Falcon512Signer = {
    source: adapter.source,
    publicKey: kp.publicKey,
    async signOp(h: Hex): Promise<PqSig> {
      const sigHex = await adapter.sign(h);
      return {
        scheme: VerifierScheme.Falcon512,
        pubkeyHash: keccak256(bytesToHex(kp.publicKey)),
        sigBytes: sigHex,
      };
    },
  };
  return signer.signOp(opHash);
}

export function falcon512PubkeyCommitment(pk: Uint8Array): Hex {
  return keccak256(bytesToHex(pk));
}

export function serializeFalcon512Keypair(kp: Falcon512Keypair): string {
  return JSON.stringify({
    publicKey: toHex(kp.publicKey),
    secretRef: kp.secretRef,
  });
}

export function deserializeFalcon512Keypair(s: string): Falcon512Keypair {
  const o = JSON.parse(s) as { publicKey: Hex; secretRef: string };
  return {
    publicKey: hexToBytes(o.publicKey),
    secretRef: o.secretRef,
  };
}
