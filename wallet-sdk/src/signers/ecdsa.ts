import {
  type Account,
  type Hex,
  hexToBytes,
  serializeSignature,
  toHex,
} from "viem";
import { sign } from "viem/accounts";
import type { EcdsaSig } from "../types.js";

/**
 * Sign a Nexora opHash using EIP-191 ("Ethereum Signed Message:\n32" prefix).
 * The on-chain validator wraps the same prefix before `ecrecover`, so this
 * matches `personal_sign` behaviour from MetaMask.
 */
export async function signEcdsaOpHash(
  account: Account,
  opHash: Hex,
): Promise<EcdsaSig> {
  if (!account.signMessage) {
    throw new Error("account does not support signMessage");
  }
  const flat = await account.signMessage({
    message: { raw: hexToBytes(opHash) },
  });
  return splitSig(flat);
}

/**
 * Sign a digest directly with a private-key viem account
 * (no EIP-191 prefix). Mostly used in tests.
 */
export async function signDigestPrivateKey(
  privateKey: Hex,
  digest: Hex,
): Promise<EcdsaSig> {
  const sig = await sign({ hash: digest, privateKey });
  return splitSig(serializeSignature(sig));
}

export function splitSig(flat: Hex): EcdsaSig {
  const bytes = hexToBytes(flat);
  if (bytes.length !== 65) {
    throw new Error(`expected 65-byte sig, got ${bytes.length}`);
  }
  return {
    r: toHex(bytes.slice(0, 32)),
    s: toHex(bytes.slice(32, 64)),
    v: bytes[64]!,
  };
}
