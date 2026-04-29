import {
  type Address,
  type Hex,
  createPublicClient,
  createWalletClient,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { NEXORA_CHAIN, abi, deserializeOp, encodeUserOp } from "@nexora/wallet-sdk";
import type { RelayedOpRequest } from "./types.js";

export interface ExecutorConfig {
  rpcUrl: string;
  privateKey: Hex;
}

export class Executor {
  readonly publicClient;
  readonly walletClient;
  readonly account;

  constructor(cfg: ExecutorConfig) {
    this.account = privateKeyToAccount(cfg.privateKey);
    this.publicClient = createPublicClient({
      chain: NEXORA_CHAIN,
      transport: http(cfg.rpcUrl),
    });
    this.walletClient = createWalletClient({
      account: this.account,
      chain: NEXORA_CHAIN,
      transport: http(cfg.rpcUrl),
    });
  }

  async run(req: RelayedOpRequest): Promise<{ txHash: Hex; account: Address }> {
    const op = deserializeOp(req.op as unknown as Record<string, unknown>);
    const opBytes = encodeUserOp(op);

    if (req.agentId) {
      const txHash = await this.walletClient.writeContract({
        address: op.sender,
        abi: abi.nexoraAccountAbi,
        functionName: "executeIntent",
        args: [req.agentId, opBytes, req.providedPubkey],
        value: op.value,
      });
      return { txHash, account: op.sender };
    }

    const txHash = await this.walletClient.writeContract({
      address: op.sender,
      abi: abi.nexoraAccountAbi,
      functionName: "executeUserOp",
      args: [opBytes, req.providedPubkey],
      value: op.value,
    });
    return { txHash, account: op.sender };
  }
}
