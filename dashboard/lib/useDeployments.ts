"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type Deployments,
  emptyDeployments,
  normalizeDeployments,
} from "./deployments";

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
 * 1. `NEXT_PUBLIC_DEPLOYMENTS` (build-time JSON string) if set
 * 2. Otherwise fetches `/deployments.json` (served from `public/`, updated by `deploy-all.ts`)
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
      .then((r) => (r.ok ? r.json() : null))
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

  const deployments = envDeployments ?? fetched ?? emptyDeployments();
  const ready = Boolean(envDeployments) || fetchDone;

  return { deployments, ready };
}

export type { Deployments };
