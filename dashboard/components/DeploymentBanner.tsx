"use client";

import type { Deployments } from "@/lib/deployments";

const ZERO = "0x0000000000000000000000000000000000000000" as const;

export function DeploymentBanner({
  ready,
  deployments,
}: {
  ready: boolean;
  deployments: Deployments;
}) {
  const missing =
    ready &&
    (deployments.accountFactory === ZERO ||
      deployments.verifierRegistry === ZERO);

  if (!missing) return null;

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
      <span className="font-medium">Contract addresses not loaded.</span>{" "}
      Deploy contracts to your chain and ensure{" "}
      <code className="rounded bg-zinc-900 px-1 py-0.5 font-mono text-xs">
        public/deployments.json
      </code>{" "}
      is deployed with this build, or set{" "}
      <code className="rounded bg-zinc-900 px-1 py-0.5 font-mono text-xs">
        NEXT_PUBLIC_DEPLOYMENTS
      </code>{" "}
      on Vercel. Some steps below may stay idle until addresses exist.
    </div>
  );
}
