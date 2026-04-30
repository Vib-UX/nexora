import {
  type Hex,
  bytesToHex,
  hexToBytes,
  keccak256,
  concat,
  toHex,
} from "viem";
import type { PqSig } from "../types.js";
import { VerifierScheme } from "../types.js";

/**
 * Falcon-512 fixed sizes (on-wire layout). Keypairs and signatures must
 * match these byte lengths so they pass `strict_lengths` checks in the
 * on-chain verifier.
 */
export const FALCON512_PUBKEY_BYTES = 897;
export const FALCON512_SIG_BYTES = 666;

/**
 * Scheme-1 (FALCON_MOCK) keypair for local and integration testing. The
 * secret material is used only to derive a deterministic tag recognized by
 * the scheme-1 on-chain verifier — use Falcon-512 (scheme 2) for production
 * PQ verification.
 */
export interface FalconMockKeypair {
  publicKey: Uint8Array;
  /// 32 random bytes used purely to make different keypairs distinct.
  secret: Uint8Array;
}

/**
 * Generate a deterministic scheme-1 keypair from a 32-byte seed.
 * The pubkey layout is `seed || pad-to-897` so different seeds yield
 * different commitments.
 */
export function falconMockKeypairFromSeed(seed: Uint8Array): FalconMockKeypair {
  if (seed.length !== 32) throw new Error("seed must be 32 bytes");
  const pubkey = new Uint8Array(FALCON512_PUBKEY_BYTES);
  pubkey.set(seed, 0);
  // Fill the rest with a tag derived from the seed for uniqueness.
  const tail = hexToBytes(keccak256(seed));
  for (let i = 32; i < pubkey.length; i++) {
    pubkey[i] = tail[i % tail.length]!;
  }
  return { publicKey: pubkey, secret: seed };
}

export function randomFalconMockKeypair(): FalconMockKeypair {
  const seed = new Uint8Array(32);
  crypto.getRandomValues(seed);
  return falconMockKeypairFromSeed(seed);
}

/**
 * Produce a deterministic scheme-1 signature.
 *
 * On-chain check is:
 *
 *   sig[..32] == keccak256(pubkey || msgHash)
 *
 * We pad the rest of `sig` to FALCON512_SIG_BYTES with zeros so the
 * length matches a real Falcon signature.
 */
export function signFalconMock(
  msgHash: Hex,
  keypair: FalconMockKeypair,
): PqSig {
  const tag = keccak256(
    concat([bytesToHex(keypair.publicKey), msgHash]),
  );
  const sig = new Uint8Array(FALCON512_SIG_BYTES);
  sig.set(hexToBytes(tag), 0);

  return {
    scheme: VerifierScheme.FalconMock,
    pubkeyHash: keccak256(bytesToHex(keypair.publicKey)),
    sigBytes: bytesToHex(sig),
  };
}

/**
 * Convenience: derive the on-chain commitment for a public key.
 */
export function falconPubkeyCommitment(pubkey: Uint8Array): Hex {
  return keccak256(bytesToHex(pubkey));
}

export function pubkeyToHex(pubkey: Uint8Array): Hex {
  return bytesToHex(pubkey);
}

/**
 * Persist/restore helpers for browser localStorage.
 */
export function serializeKeypair(kp: FalconMockKeypair): string {
  return JSON.stringify({
    publicKey: toHex(kp.publicKey),
    secret: toHex(kp.secret),
  });
}

export function deserializeKeypair(s: string): FalconMockKeypair {
  const o = JSON.parse(s) as { publicKey: Hex; secret: Hex };
  return {
    publicKey: hexToBytes(o.publicKey),
    secret: hexToBytes(o.secret),
  };
}
