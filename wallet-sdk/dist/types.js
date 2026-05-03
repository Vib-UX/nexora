/// VerifierScheme ids (mirrors Rust enum).
export const VerifierScheme = {
    EcdsaK1: 0,
    FalconMock: 1,
    Falcon512: 2,
    Dilithium3: 3,
    SphincsPlus: 4,
};
/// PolicyTag ids (mirrors Rust enum).
export const PolicyTag = {
    Low: 0,
    High: 1,
    Critical: 2,
};
export const EMPTY_ECDSA = {
    r: "0x0000000000000000000000000000000000000000000000000000000000000000",
    s: "0x0000000000000000000000000000000000000000000000000000000000000000",
    v: 0,
};
export const EMPTY_PQ = {
    scheme: 0,
    pubkeyHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
    sigBytes: "0x",
};
//# sourceMappingURL=types.js.map