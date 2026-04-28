import type { Address, Hex } from "viem";

/// VerifierScheme ids (mirrors Rust enum).
export const VerifierScheme = {
  EcdsaK1: 0,
  FalconMock: 1,
  Falcon512: 2,
  Dilithium3: 3,
  SphincsPlus: 4,
} as const;
export type VerifierScheme = (typeof VerifierScheme)[keyof typeof VerifierScheme];

/// PolicyTag ids (mirrors Rust enum).
export const PolicyTag = {
  Low: 0,
  High: 1,
  Critical: 2,
} as const;
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

export const EMPTY_ECDSA: EcdsaSig = {
  r: "0x0000000000000000000000000000000000000000000000000000000000000000",
  s: "0x0000000000000000000000000000000000000000000000000000000000000000",
  v: 0,
};

export const EMPTY_PQ: PqSig = {
  scheme: 0,
  pubkeyHash:
    "0x0000000000000000000000000000000000000000000000000000000000000000",
  sigBytes: "0x",
};
