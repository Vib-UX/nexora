"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.error(error);
    }
  }, [error]);

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-6">
      <h2 className="text-lg font-semibold text-amber-200">Page error</h2>
      <p className="mt-2 text-sm text-zinc-400">
        The app hit an error. You can try again, or use other parts of the
        site if the wallet or RPC is misconfigured.
      </p>
      <p className="mt-3 break-all font-mono text-xs text-zinc-500">
        {error.message}
      </p>
      <button
        type="button"
        className="mt-4 rounded-md bg-nexora-accent px-4 py-2 text-sm font-medium text-white"
        onClick={() => reset()}
      >
        Try again
      </button>
    </div>
  );
}
