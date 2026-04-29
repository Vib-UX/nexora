import type { Address, Hex } from "viem";

/**
 * Generic intent contract — any agent runtime (ZeroClaw, custom, etc.)
 * adapts to this. Nexora SDK only depends on this interface, never on a
 * specific runtime.
 */
export interface Intent {
  id: Hex; // bytes32 agent id (keccak256(agent_name || nonce))
  description: string;
  target: Address;
  value: bigint;
  callData: Hex;
}

export interface IntentProvider {
  next(): Promise<Intent | null>;
}

/**
 * In-memory provider used by the demo: yields a fixed list of LOW / HIGH /
 * CRITICAL-shaped intents and stops.
 */
export class StaticIntentProvider implements IntentProvider {
  private idx = 0;
  constructor(private readonly intents: Intent[]) {}
  async next(): Promise<Intent | null> {
    return this.intents[this.idx++] ?? null;
  }
}
