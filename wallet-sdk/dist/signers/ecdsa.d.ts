import { type Account, type Hex, type WalletClient } from "viem";
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
/**
 * Sign a Nexora opHash using EIP-191 ("Ethereum Signed Message:\n32" prefix).
 * The on-chain validator wraps the same prefix before `ecrecover`, so this
 * matches `personal_sign` behaviour from MetaMask.
 */
export declare function signEcdsaOpHash(signer: EcdsaSigner, opHash: Hex): Promise<EcdsaSig>;
/**
 * Sign a digest directly with a private-key viem account
 * (no EIP-191 prefix). Mostly used in tests.
 */
export declare function signDigestPrivateKey(privateKey: Hex, digest: Hex): Promise<EcdsaSig>;
export declare function splitSig(flat: Hex): EcdsaSig;
//# sourceMappingURL=ecdsa.d.ts.map