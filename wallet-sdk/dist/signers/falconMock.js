import { bytesToHex, hexToBytes, keccak256, concat, toHex, } from "viem";
import { VerifierScheme } from "../types.js";
/**
 * Falcon-512 fixed sizes (on-wire layout). Keypairs and signatures must
 * match these byte lengths so they pass `strict_lengths` checks in the
 * on-chain verifier.
 */
export const FALCON512_PUBKEY_BYTES = 897;
export const FALCON512_SIG_BYTES = 666;
/**
 * Generate a deterministic scheme-1 keypair from a 32-byte seed.
 * The pubkey layout is `seed || pad-to-897` so different seeds yield
 * different commitments.
 */
export function falconMockKeypairFromSeed(seed) {
    if (seed.length !== 32)
        throw new Error("seed must be 32 bytes");
    const pubkey = new Uint8Array(FALCON512_PUBKEY_BYTES);
    pubkey.set(seed, 0);
    // Fill the rest with a tag derived from the seed for uniqueness.
    const tail = hexToBytes(keccak256(seed));
    for (let i = 32; i < pubkey.length; i++) {
        pubkey[i] = tail[i % tail.length];
    }
    return { publicKey: pubkey, secret: seed };
}
export function randomFalconMockKeypair() {
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
export function signFalconMock(msgHash, keypair) {
    const tag = keccak256(concat([bytesToHex(keypair.publicKey), msgHash]));
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
export function falconPubkeyCommitment(pubkey) {
    return keccak256(bytesToHex(pubkey));
}
export function pubkeyToHex(pubkey) {
    return bytesToHex(pubkey);
}
/**
 * Persist/restore helpers for browser localStorage.
 */
export function serializeKeypair(kp) {
    return JSON.stringify({
        publicKey: toHex(kp.publicKey),
        secret: toHex(kp.secret),
    });
}
export function deserializeKeypair(s) {
    const o = JSON.parse(s);
    return {
        publicKey: hexToBytes(o.publicKey),
        secret: hexToBytes(o.secret),
    };
}
//# sourceMappingURL=falconMock.js.map