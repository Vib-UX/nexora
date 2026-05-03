"use client";

/**
 * Tx explorer URL helpers.
 *
 * The dashboard ships a built-in `/tx/[hash]` route that renders the
 * receipt + decoded Falcon-512 verifier call straight from the Nitro
 * RPC (no external explorer required). To send users to a different
 * explorer instead — e.g. on a hosted devnet — set
 * `NEXT_PUBLIC_EXPLORER_URL` (no trailing slash). When set, links resolve
 * to `${base}/tx/<hash>`; otherwise they resolve to `/tx/<hash>` inside
 * the dashboard itself.
 */

export function getExplorerBase(): string | null {
  if (typeof process === "undefined") return null;
  const v = process.env.NEXT_PUBLIC_EXPLORER_URL;
  if (!v) return null;
  return v.replace(/\/$/, "");
}

export function txUrl(hash: string): string {
  const base = getExplorerBase();
  return base ? `${base}/tx/${hash}` : `/tx/${hash}`;
}

/**
 * `true` if `txUrl` will route inside the dashboard (no external
 * explorer override). Lets components pick `<Link>` vs `<a target=_blank>`.
 */
export function isInternalExplorer(): boolean {
  return getExplorerBase() === null;
}

/**
 * Compact `0x1234…abcd` formatter.
 */
export function shortHex(h: string, head = 8, tail = 6): string {
  if (typeof h !== "string") return String(h);
  if (h.length <= head + tail + 1) return h;
  return `${h.slice(0, head)}…${h.slice(-tail)}`;
}
