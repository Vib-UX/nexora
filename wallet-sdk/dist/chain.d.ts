import { type Chain } from "viem";
export declare const NEXORA_CHAIN_ID = 412346;
/**
 * HTTP RPC for Nexora.
 * `NEXT_PUBLIC_*` is inlined by Next.js in the browser; `NEXORA_RPC_URL` is for Node/scripts.
 */
export declare function getNexoraHttpRpcUrl(): string;
/**
 * WebSocket RPC for Nexora (subscriptions).
 */
export declare function getNexoraWsRpcUrl(): string;
/**
 * Canonical viem chain definition for Nexora Devnet.
 * Override RPC via `NEXT_PUBLIC_NEXORA_RPC_URL` / `NEXORA_RPC_URL` (and WS analogs),
 * or pass your own `Transport` to `createWalletClient`.
 */
export declare const NEXORA_CHAIN: Chain;
export declare const ADD_CHAIN_PARAMS: {
    readonly chainId: "0x64ABA";
    readonly chainName: "Nexora Devnet";
    readonly nativeCurrency: {
        readonly name: "Ether";
        readonly symbol: "ETH";
        readonly decimals: 18;
    };
    readonly rpcUrls: readonly [string];
    readonly blockExplorerUrls: readonly [string];
};
//# sourceMappingURL=chain.d.ts.map