import { NEXORA_CHAIN_ID } from "@nexora/wallet-sdk";
import { defineChain, type Chain } from "viem";
import { nexoraExplorerUrl, nexoraHttpRpcUrl, nexoraWsRpcUrl } from "./nexoraEndpoints";

/**
 * Same chain metadata as `@nexora/wallet-sdk` but RPC URLs come from
 * `dashboard/lib/nexoraEndpoints.ts` so Next inlines `NEXT_PUBLIC_*` correctly.
 */
export const NEXORA_CHAIN: Chain = defineChain({
  id: NEXORA_CHAIN_ID,
  name: "Nexora Devnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [nexoraHttpRpcUrl()],
      webSocket: [nexoraWsRpcUrl()],
    },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: nexoraExplorerUrl() },
  },
  testnet: true,
});
