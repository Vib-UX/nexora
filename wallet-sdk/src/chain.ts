import { defineChain, type Chain } from "viem";

// MVP devnet uses Nitro's built-in dev chainId (0x64ABA / 412346).
// Production Orbit deployment will override this to a registered chainId.
export const NEXORA_CHAIN_ID = 412346;

/**
 * Canonical viem chain definition for Nexora Devnet.
 * RPC URL is overridable at runtime via the NEXORA_RPC_URL env var or
 * by passing your own `Transport` to `createWalletClient`.
 */
export const NEXORA_CHAIN: Chain = defineChain({
  id: NEXORA_CHAIN_ID,
  name: "Nexora Devnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXORA_RPC_URL ?? "http://localhost:8547",
      ],
      webSocket: [
        process.env.NEXORA_WS_URL ?? "ws://localhost:8548",
      ],
    },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "http://localhost:4000" },
  },
  testnet: true,
});

export const ADD_CHAIN_PARAMS = {
  chainId: "0x64ABA",
  chainName: "Nexora Devnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["http://localhost:8547"],
  blockExplorerUrls: ["http://localhost:4000"],
} as const;
