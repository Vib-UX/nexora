"use client";

import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { NEXORA_CHAIN } from "@nexora/wallet-sdk";

export const wagmiConfig = createConfig({
  chains: [NEXORA_CHAIN],
  connectors: [injected()],
  transports: {
    [NEXORA_CHAIN.id]: http(),
  },
  ssr: true,
});
