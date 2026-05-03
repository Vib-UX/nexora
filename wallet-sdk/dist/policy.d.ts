import type { Address, Hex, PublicClient } from "viem";
import { PolicyTag } from "./types.js";
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
    highSelectors: Set<Hex>;
    criticalSelectors: Set<Hex>;
}
export declare const DEFAULT_POLICY: PolicyParams;
export declare function localClassify(target: Address, value: bigint, data: Hex, params?: PolicyParams): PolicyTag;
/**
 * Authoritative classification — calls the on-chain engine.
 */
export declare function onchainClassify(client: PublicClient, policyEngine: Address, account: Address, target: Address, value: bigint, data: Hex): Promise<PolicyTag>;
//# sourceMappingURL=policy.d.ts.map