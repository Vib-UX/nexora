import type { Address, Hex } from "viem";

export interface RelayedOpRequest {
  op: {
    sender: Address;
    nonce: string;
    target: Address;
    value: string;
    callData: Hex;
    callGasLimit: string;
    validUntil: string;
    policyTag: number;
    verifierScheme: number;
    signatures: Hex;
  };
  providedPubkey: Hex;
  /// Optional agent id; when present we route to `execute_intent`.
  agentId?: Hex;
}

export interface RelayedOpResponse {
  txHash: Hex;
  account: Address;
  policyTag: number;
}

export interface ErrorResponse {
  error: string;
  detail?: string;
}
