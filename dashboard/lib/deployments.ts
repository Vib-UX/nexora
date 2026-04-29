"use client";

import type { Address } from "viem";

/// Deployments are written by `scripts/deploy-all.ts` to deployments.json
/// at the repo root. The dashboard reads the same shape from a
/// NEXT_PUBLIC_DEPLOYMENTS env var (stringified JSON) or falls back to
/// the empty placeholder below.
export interface Deployments {
  chainId: number;
  pqVerifier: Address;
  verifierRegistry: Address;
  policyEngine: Address;
  accountImplementation: Address;
  accountFactory: Address;
  bridgeMock: Address;
}

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

export function loadDeployments(): Deployments {
  const raw = process.env.NEXT_PUBLIC_DEPLOYMENTS;
  if (raw) {
    try {
      return JSON.parse(raw) as Deployments;
    } catch {
      // fall through
    }
  }
  return {
    chainId: 20056,
    pqVerifier: ZERO,
    verifierRegistry: ZERO,
    policyEngine: ZERO,
    accountImplementation: ZERO,
    accountFactory: ZERO,
    bridgeMock: ZERO,
  };
}
