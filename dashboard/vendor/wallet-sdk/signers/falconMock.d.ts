import { type Hex } from "viem";
import type { PqSig } from "../types.js";
/**
 * Falcon-512 fixed sizes (on-wire layout). Keypairs and signatures must
 * match these byte lengths so they pass `strict_lengths` checks in the
 * on-chain verifier.
 */
export declare const FALCON512_PUBKEY_BYTES = 897;
export declare const FALCON512_SIG_BYTES = 666;
/**
 * Scheme-1 (FALCON_MOCK) keypair for local and integration testing. The
 * secret material is used only to derive a deterministic tag recognized by
 * the scheme-1 on-chain verifier — use Falcon-512 (scheme 2) for production
 * PQ verification.
 */
export interface FalconMockKeypair {
    publicKey: Uint8Array;
    secret: Uint8Array;
}
/**
 * Generate a deterministic scheme-1 keypair from a 32-byte seed.
 * The pubkey layout is `seed || pad-to-897` so different seeds yield
 * different commitments.
 */
export declare function falconMockKeypairFromSeed(seed: Uint8Array): FalconMockKeypair;
export declare function randomFalconMockKeypair(): FalconMockKeypair;
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
export declare function signFalconMock(msgHash: Hex, keypair: FalconMockKeypair): PqSig;
/**
 * Convenience: derive the on-chain commitment for a public key.
 */
export declare function falconPubkeyCommitment(pubkey: Uint8Array): Hex;
export declare function pubkeyToHex(pubkey: Uint8Array): Hex;
/**
 * Persist/restore helpers for browser localStorage.
 */
export declare function serializeKeypair(kp: FalconMockKeypair): string;
export declare function deserializeKeypair(s: string): FalconMockKeypair;
//# sourceMappingURL=falconMock.d.ts.map