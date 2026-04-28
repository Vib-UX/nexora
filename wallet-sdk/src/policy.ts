import type { Address, Hex, PublicClient } from "viem";
import { PolicyTag } from "./types.js";
import { policyEngineAbi } from "./abi/policyEngine.js";

/**
 * Off-chain mirror of `PolicyEngine.classify` so the SDK can decide which
 * signatures to request before sending. The on-chain engine is the
 * authoritative answer; this is a UX optimization.
 */
export interface PolicyParams {
  highThreshold: bigint;
  criticalThreshold: bigint;
  highTargets: Set<Address>;
  criticalTargets: Set<Address>;
  highSelectors: Set<Hex>; // 4-byte selector lowercase
  criticalSelectors: Set<Hex>;
}

export const DEFAULT_POLICY: PolicyParams = {
  highThreshold: 1_000_000_000_000_000_000n,
  criticalThreshold: 100_000_000_000_000_000_000n,
  highTargets: new Set(),
  criticalTargets: new Set(),
  highSelectors: new Set(),
  criticalSelectors: new Set(),
};

export function localClassify(
  target: Address,
  value: bigint,
  data: Hex,
  params: PolicyParams = DEFAULT_POLICY,
): PolicyTag {
  if (value > params.criticalThreshold) return PolicyTag.Critical;
  if (params.criticalTargets.has(target)) return PolicyTag.Critical;
  const sel = (data.length >= 10 ? (data.slice(0, 10).toLowerCase() as Hex) : null);
  if (sel && params.criticalSelectors.has(sel)) return PolicyTag.Critical;

  if (value > params.highThreshold) return PolicyTag.High;
  if (params.highTargets.has(target)) return PolicyTag.High;
  if (sel && params.highSelectors.has(sel)) return PolicyTag.High;

  return PolicyTag.Low;
}

/**
 * Authoritative classification — calls the on-chain engine.
 */
export async function onchainClassify(
  client: PublicClient,
  policyEngine: Address,
  account: Address,
  target: Address,
  value: bigint,
  data: Hex,
): Promise<PolicyTag> {
  const tag = (await client.readContract({
    address: policyEngine,
    abi: policyEngineAbi,
    functionName: "classify",
    args: [account, target, value, data],
  })) as number;
  switch (tag) {
    case 0:
      return PolicyTag.Low;
    case 1:
      return PolicyTag.High;
    case 2:
      return PolicyTag.Critical;
    default:
      throw new Error(`unknown policy tag: ${tag}`);
  }
}
