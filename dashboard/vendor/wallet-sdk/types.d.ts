import type { Address, Hex } from "viem";
export declare const VerifierScheme: {
    readonly EcdsaK1: 0;
    readonly FalconMock: 1;
    readonly Falcon512: 2;
    readonly Dilithium3: 3;
    readonly SphincsPlus: 4;
};
export type VerifierScheme = (typeof VerifierScheme)[keyof typeof VerifierScheme];
export declare const PolicyTag: {
    readonly Low: 0;
    readonly High: 1;
    readonly Critical: 2;
};
export type PolicyTag = (typeof PolicyTag)[keyof typeof PolicyTag];
export interface UserOp {
    sender: Address;
    nonce: bigint;
    target: Address;
    value: bigint;
    callData: Hex;
    callGasLimit: bigint;
    validUntil: bigint;
    policyTag: PolicyTag;
    verifierScheme: VerifierScheme;
    /** abi.encode(EcdsaSig, PqSig) — set by signers, not by callers. */
    signatures: Hex;
}
export interface EcdsaSig {
    r: Hex;
    s: Hex;
    v: number;
}
export interface PqSig {
    scheme: VerifierScheme;
    pubkeyHash: Hex;
    sigBytes: Hex;
}
export interface SignatureEnvelope {
    ecdsa: EcdsaSig;
    pq: PqSig;
}
export declare const EMPTY_ECDSA: EcdsaSig;
export declare const EMPTY_PQ: PqSig;
//# sourceMappingURL=types.d.ts.map