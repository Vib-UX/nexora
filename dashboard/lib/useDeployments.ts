"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type Deployments,
  normalizeDeployments,
} from "./deployments";
import bundledDeploymentsJson from "./deployments.bundled.json";

/** Addresses baked in at build time from `lib/deployments.bundled.json` (webpack cannot import from `public/`). */
const BUNDLED = normalizeDeployments(bundledDeploymentsJson as unknown);

function fromEnv(): Deployments | null {
  const raw = process.env.NEXT_PUBLIC_DEPLOYMENTS;
  if (!raw) return null;
  try {
    return normalizeDeployments(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

/**
 * Loads contract addresses for the dashboard:
 * 1. `NEXT_PUBLIC_DEPLOYMENTS` (build-time JSON string) if set — wins over everything
 * 2. Otherwise GET `/deployments.json` (optional refresh / CDN)
 * 3. Otherwise bundled import of `lib/deployments.bundled.json` (kept in sync by deploy-all.ts)
 */
export function useDeployments(): {
  deployments: Deployments;
  ready: boolean;
} {
  const envDeployments = useMemo(() => fromEnv(), []);
  const [fetched, setFetched] = useState<Deployments | null>(null);
  const [fetchDone, setFetchDone] = useState(Boolean(envDeployments));

  useEffect(() => {
    if (envDeployments) return;
    let cancelled = false;
    fetch("/deployments.json", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return null;
        const ct = r.headers.get("content-type") ?? "";
        if (!ct.includes("application/json")) return null;
        try {
          return (await r.json()) as unknown;
        } catch {
          return null;
        }
      })
      .then((j: unknown) => {
        if (cancelled || !j) return;
        setFetched(normalizeDeployments(j));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setFetchDone(true);
      });
    return () => {
      cancelled = true;
    };
  }, [envDeployments]);

  const deployments = envDeployments ?? fetched ?? BUNDLED;
  const ready = Boolean(envDeployments) || fetchDone;

  return { deployments, ready };
}

export type { Deployments };
