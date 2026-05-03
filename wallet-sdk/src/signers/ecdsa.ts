import {
  type Account,
  type Hex,
  type WalletClient,
  hexToBytes,
  serializeSignature,
  toHex,
} from "viem";
import { sign } from "viem/accounts";
import type { EcdsaSig } from "../types.js";

/**
 * `signEcdsaOpHash` accepts:
 *   - a local viem `Account` (e.g. `privateKeyToAccount`) that exposes
 *     `signMessage` directly; or
 *   - a `{ walletClient, account }` pair (browser / MetaMask path) — the
 *     `JsonRpcAccount` from `wagmi.useWalletClient()` does NOT expose
 *     `signMessage`, so the call must be routed through the wallet client.
 */
export interface EcdsaWalletClientSigner {
  walletClient: WalletClient;
  account: Account;
}
export type EcdsaSigner = Account | EcdsaWalletClientSigner;

function isWalletClientSigner(s: EcdsaSigner): s is EcdsaWalletClientSigner {
  return (
    typeof (s as EcdsaWalletClientSigner).walletClient === "object" &&
    (s as EcdsaWalletClientSigner).walletClient !== null &&
    typeof (s as EcdsaWalletClientSigner).account === "object"
  );
}

/**
 * Sign a Nexora opHash using EIP-191 ("Ethereum Signed Message:\n32" prefix).
 * The on-chain validator wraps the same prefix before `ecrecover`, so this
 * matches `personal_sign` behaviour from MetaMask.
 */
export async function signEcdsaOpHash(
  signer: EcdsaSigner,
  opHash: Hex,
): Promise<EcdsaSig> {
  const message = { raw: hexToBytes(opHash) } as const;
  if (isWalletClientSigner(signer)) {
    const flat = await signer.walletClient.signMessage({
      account: signer.account,
      message,
    });
    return splitSig(flat);
  }
  if (!signer.signMessage) {
    throw new Error(
      "ecdsa signer does not support signMessage — pass { walletClient, account } instead",
    );
  }
  const flat = await signer.signMessage({ message });
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
