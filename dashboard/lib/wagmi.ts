"use client";

import { NEXORA_CHAIN } from "@/lib/nexoraChain";
import { nexoraHttpRpcUrl } from "@/lib/nexoraEndpoints";
import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";

export const wagmiConfig = createConfig({
  chains: [NEXORA_CHAIN],
  connectors: [injected()],
  transports: {
    [NEXORA_CHAIN.id]: http(nexoraHttpRpcUrl()),
  },
  ssr: true,
});
