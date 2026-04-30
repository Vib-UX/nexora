/**
 * Real Falcon-512 signer. Mirrors the scheme-1 signer module API shape so the
 * `NexoraClient` can be configured to use either.
 *
 * The signer talks to a local HTTP service (see `signer/falcon-signer`) for
 * keygen/signing — running Falcon's full sampler in TS is impractical and
 * Stylus only needs to verify, not sign. The HTTP daemon caches the keypair
 * in memory.
 *
 * Default base URL: `http://127.0.0.1:9090`. Override per-call with
 * `opts.signerUrl`.
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

// Sizes are also exported from the scheme-1 signer module (same on-chain
// shape). We re-export under namespaced names to avoid the duplicate-export
// error from `signers/index.ts`.
import {
  FALCON512_PUBKEY_BYTES as PK_LEN,
  FALCON512_SIG_BYTES as SIG_LEN,
} from "./falconMock.js";

export const FALCON512_REAL_PUBKEY_BYTES = PK_LEN;
export const FALCON512_REAL_SIG_BYTES = SIG_LEN;

export interface Falcon512Keypair {
  /// 897-byte Falcon-512 public key (header `0x09` + 14-bit packed coeffs).
  publicKey: Uint8Array;
  /// Logical handle pointing to the secret key. The actual secret never
  /// leaves the signer daemon. Set to `"local"` when keys are loaded from a
  /// local `keys.json` and `signerUrl` resolves to that daemon.
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
 * Fetch the daemon's pubkey + commitment. Useful at app startup so the
 * dashboard / agent knows what `pqPubkey` to attach to UserOps.
 */
export async function loadFalcon512Keypair(
  opts: Falcon512SignOpts = {},
): Promise<Falcon512Keypair> {
  const url = (opts.signerUrl ?? DEFAULT_URL) + "/pubkey";
  const f = opts.fetchImpl ?? fetch;
  const r = await f(url);
  if (!r.ok) {
    throw new Error(`falcon-signer GET /pubkey failed: ${r.status}`);
  }
  const j = (await r.json()) as { pubkey: Hex; commitment: Hex; scheme: number };
  if (j.scheme !== VerifierScheme.Falcon512) {
    throw new Error(`unexpected scheme from signer: ${j.scheme}`);
  }
  const publicKey = hexToBytes(j.pubkey);
  if (publicKey.length !== PK_LEN) {
    throw new Error(`bad pubkey length: ${publicKey.length} (expected ${PK_LEN})`);
  }
  return { publicKey, secretRef: opts.signerUrl ?? DEFAULT_URL };
}

/**
 * Produce a real Falcon-512 signature over `opHash` (32 bytes).
 *
 * The signer daemon MUST be running and serving the same keypair whose
 * public key is in `kp.publicKey`. We sanity-check that the daemon's
 * pubkey matches `kp.publicKey` to catch desynced configurations.
 */
export async function signFalcon512(
  opHash: Hex,
  kp: Falcon512Keypair,
  opts: Falcon512SignOpts = {},
): Promise<PqSig> {
  const baseUrl = opts.signerUrl ?? kp.secretRef ?? DEFAULT_URL;
  const f = opts.fetchImpl ?? fetch;

  const r = await f(`${baseUrl}/sign`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hash: opHash }),
  });
  if (!r.ok) {
    throw new Error(`falcon-signer POST /sign failed: ${r.status} ${await r.text()}`);
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
  // Sanity: daemon pubkey must match the configured one — otherwise we'd
  // sign with a different key than the on-chain account expects.
  const localPubHex = bytesToHex(kp.publicKey);
  if (j.pubkey.toLowerCase() !== localPubHex.toLowerCase()) {
    throw new Error(
      "falcon-signer pubkey mismatch — daemon serves a different keypair",
    );
  }
  const sigBytes = hexToBytes(j.sig);
  if (sigBytes.length !== SIG_LEN) {
    throw new Error(`bad signature length: ${sigBytes.length} (expected ${SIG_LEN})`);
  }
  return {
    scheme: VerifierScheme.Falcon512,
    pubkeyHash: keccak256(localPubHex),
    sigBytes: bytesToHex(sigBytes),
  };
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
