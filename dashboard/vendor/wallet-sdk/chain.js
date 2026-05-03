import { defineChain } from "viem";
// Local devnet uses Nitro's built-in dev chainId (0x64ABA / 412346).
// Production Orbit deployment will override this to a registered chainId.
export const NEXORA_CHAIN_ID = 412346;
function stripTrailingSlash(url) {
    return url.replace(/\/$/, "");
}
/**
 * HTTP RPC for Nexora.
 * `NEXT_PUBLIC_*` is inlined by Next.js in the browser; `NEXORA_RPC_URL` is for Node/scripts.
 */
export function getNexoraHttpRpcUrl() {
    const raw = process.env.NEXT_PUBLIC_NEXORA_RPC_URL ??
        process.env.NEXORA_RPC_URL ??
        "http://localhost:8547";
    return stripTrailingSlash(raw);
}
/**
 * WebSocket RPC for Nexora (subscriptions).
 */
export function getNexoraWsRpcUrl() {
    const raw = process.env.NEXT_PUBLIC_NEXORA_WS_URL ??
        process.env.NEXORA_WS_URL ??
        "ws://localhost:8548";
    return stripTrailingSlash(raw);
}
function getNexoraBlockExplorerUrl() {
    const raw = process.env.NEXT_PUBLIC_EXPLORER_URL ??
        process.env.NEXORA_EXPLORER_URL ??
        "http://localhost:4000";
    return stripTrailingSlash(raw);
}
/**
 * Canonical viem chain definition for Nexora Devnet.
 * Override RPC via `NEXT_PUBLIC_NEXORA_RPC_URL` / `NEXORA_RPC_URL` (and WS analogs),
 * or pass your own `Transport` to `createWalletClient`.
 */
export const NEXORA_CHAIN = defineChain({
    id: NEXORA_CHAIN_ID,
    name: "Nexora Devnet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
        default: {
            http: [getNexoraHttpRpcUrl()],
            webSocket: [getNexoraWsRpcUrl()],
        },
    },
    blockExplorers: {
        default: { name: "Blockscout", url: getNexoraBlockExplorerUrl() },
    },
    testnet: true,
});
export const ADD_CHAIN_PARAMS = {
    chainId: "0x64ABA",
    chainName: "Nexora Devnet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: [getNexoraHttpRpcUrl()],
    blockExplorerUrls: [getNexoraBlockExplorerUrl()],
};
//# sourceMappingURL=chain.js.map