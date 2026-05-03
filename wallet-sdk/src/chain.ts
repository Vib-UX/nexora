import { defineChain, type Chain } from "viem";

// Local devnet uses Nitro's built-in dev chainId (0x64ABA / 412346).
// Production Orbit deployment will override this to a registered chainId.
export const NEXORA_CHAIN_ID = 412346;

function resolveRpcUrl(): string {
  return (
    process.env.NEXT_PUBLIC_NEXORA_RPC_URL ??
    process.env.NEXORA_RPC_URL ??
    "http://localhost:8547"
  );
}

function resolveWsUrl(): string {
  return (
    process.env.NEXT_PUBLIC_NEXORA_WS_URL ??
    process.env.NEXORA_WS_URL ??
    "ws://localhost:8548"
  );
}

function resolveExplorerUrl(): string {
  return process.env.NEXT_PUBLIC_EXPLORER_URL ?? "http://localhost:4000";
}

/**
 * Canonical viem chain definition for Nexora Devnet.
 * RPC URL is overridable via `NEXORA_RPC_URL` or, for browser bundles
 * (Next.js dashboard), `NEXT_PUBLIC_NEXORA_RPC_URL`. Same pattern for WS /
 * explorer URLs.
 */
export const NEXORA_CHAIN: Chain = defineChain({
  id: NEXORA_CHAIN_ID,
  name: "Nexora Devnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [resolveRpcUrl()],
      webSocket: [resolveWsUrl()],
    },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: resolveExplorerUrl() },
  },
  testnet: true,
});

export const ADD_CHAIN_PARAMS = {
  chainId: "0x64ABA",
  chainName: "Nexora Devnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: [resolveRpcUrl()],
  blockExplorerUrls: [resolveExplorerUrl()],
} as const;
