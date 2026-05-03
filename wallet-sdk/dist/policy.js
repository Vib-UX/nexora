import { PolicyTag } from "./types.js";
import { policyEngineAbi } from "./abi/policyEngine.js";
export const DEFAULT_POLICY = {
    highThreshold: 1000000000000000000n,
    criticalThreshold: 100000000000000000000n,
    highTargets: new Set(),
    criticalTargets: new Set(),
    highSelectors: new Set(),
    criticalSelectors: new Set(),
};
export function localClassify(target, value, data, params = DEFAULT_POLICY) {
    if (value > params.criticalThreshold)
        return PolicyTag.Critical;
    if (params.criticalTargets.has(target))
        return PolicyTag.Critical;
    const sel = (data.length >= 10 ? data.slice(0, 10).toLowerCase() : null);
    if (sel && params.criticalSelectors.has(sel))
        return PolicyTag.Critical;
    if (value > params.highThreshold)
        return PolicyTag.High;
    if (params.highTargets.has(target))
        return PolicyTag.High;
    if (sel && params.highSelectors.has(sel))
        return PolicyTag.High;
    return PolicyTag.Low;
}
/**
 * Authoritative classification — calls the on-chain engine.
 */
export async function onchainClassify(client, policyEngine, account, target, value, data) {
    const tag = (await client.readContract({
        address: policyEngine,
        abi: policyEngineAbi,
        functionName: "classify",
        args: [account, target, value, data],
    }));
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
//# sourceMappingURL=policy.js.map