"use client";

import type { Address } from "viem";

/// Deployments are written by `scripts/deploy-all.ts` to `deployments.json` (repo root)
/// and copied to `dashboard/public/deployments.json` for the dev UI.
/// Override with `NEXT_PUBLIC_DEPLOYMENTS` if needed.
export interface Deployments {
  chainId: number;
  /** Reference PQ verifier address (scheme = 1, FALCON_MOCK). */
  pqVerifier: Address;
  /** Real Falcon-512 verifier (scheme = 2, FALCON_512). */
  pqVerifierFalcon512?: Address;
  verifierRegistry: Address;
  policyEngine: Address;
  accountImplementation: Address;
  accountFactory: Address;
  bridgeMock: Address;
  /** Optional: demo account from deploy script; otherwise UI derives address via factory. */
  account?: Address;
}

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

/** Normalize API / file payloads (may include extra keys from deploy script). */
export function normalizeDeployments(raw: unknown): Deployments {
  const o = raw as Record<string, unknown>;
  return {
    chainId: Number(o.chainId ?? 412346),
    pqVerifier: (o.pqVerifier as Address) ?? ZERO,
    pqVerifierFalcon512: o.pqVerifierFalcon512
      ? (o.pqVerifierFalcon512 as Address)
      : undefined,
    verifierRegistry: (o.verifierRegistry as Address) ?? ZERO,
    policyEngine: (o.policyEngine as Address) ?? ZERO,
    accountImplementation: (o.accountImplementation as Address) ?? ZERO,
    accountFactory: (o.accountFactory as Address) ?? ZERO,
    bridgeMock: (o.bridgeMock as Address) ?? ZERO,
    account: o.account ? (o.account as Address) : undefined,
  };
}

export function emptyDeployments(): Deployments {
  return {
    chainId: 412346,
    pqVerifier: ZERO,
    verifierRegistry: ZERO,
    policyEngine: ZERO,
    accountImplementation: ZERO,
    accountFactory: ZERO,
    bridgeMock: ZERO,
  };
}

/** @deprecated Prefer `useDeployments()` so `/deployments.json` is loaded in the browser. */
export function loadDeployments(): Deployments {
  const raw = process.env.NEXT_PUBLIC_DEPLOYMENTS;
  if (raw) {
    try {
      return normalizeDeployments(JSON.parse(raw) as unknown);
    } catch {
      // fall through
    }
  }
  return emptyDeployments();
}
