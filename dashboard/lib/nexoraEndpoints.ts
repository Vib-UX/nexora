/**
 * Client-visible Nexora RPC / explorer URLs.
 *
 * These helpers live in the dashboard app (not `@nexora/wallet-sdk`) so Next.js
 * reliably inlines `NEXT_PUBLIC_*` env vars in the browser bundle. Workspace
 * packages can miss replacement and keep pointing at localhost.
 */

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

export function nexoraHttpRpcUrl(): string {
  const v = process.env.NEXT_PUBLIC_NEXORA_RPC_URL;
  return typeof v === "string" && v.length > 0
    ? stripTrailingSlash(v)
    : "http://localhost:8547";
}

export function nexoraWsRpcUrl(): string {
  const v = process.env.NEXT_PUBLIC_NEXORA_WS_URL;
  return typeof v === "string" && v.length > 0
    ? stripTrailingSlash(v)
    : "ws://localhost:8548";
}

export function nexoraExplorerUrl(): string {
  // Wallet-side block explorer URL (advertised via wallet_addEthereumChain).
  // Prefer the Blockscout-specific knob so MetaMask's "view tx" button
  // pops Blockscout when configured, even when the dashboard's own
  // NEXT_PUBLIC_EXPLORER_URL knob is left unset (which keeps the bespoke
  // /tx/[hash] page as the primary in-dashboard click target).
  const v =
    process.env.NEXT_PUBLIC_BLOCKSCOUT_URL ??
    process.env.NEXT_PUBLIC_EXPLORER_URL;
  return typeof v === "string" && v.length > 0
    ? stripTrailingSlash(v)
    : "http://localhost:4000";
}

/** EIP-3085 params for `wallet_addEthereumChain` (must match viem chain RPC). */
export function walletAddEthereumChainParams() {
  return {
    chainId: "0x64ABA",
    chainName: "Nexora Devnet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: [nexoraHttpRpcUrl()],
    blockExplorerUrls: [nexoraExplorerUrl()],
  };
}
