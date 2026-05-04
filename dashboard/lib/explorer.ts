"use client";

/**
 * Tx explorer URL helpers.
 *
 * The dashboard ships a built-in `/tx/[hash]` route that renders the
 * receipt + decoded Falcon-512 verifier call straight from the Nitro
 * RPC. Two independent env knobs steer where outbound links go:
 *
 * 1. `NEXT_PUBLIC_EXPLORER_URL` — *replaces* the in-dashboard route.
 *    When set, every `txUrl(hash)` resolves to `${base}/tx/<hash>` and
 *    the bespoke `/tx/[hash]` page is bypassed. Use this when you want
 *    to point at a different first-party explorer entirely.
 *
 * 2. `NEXT_PUBLIC_BLOCKSCOUT_URL` — *additive*. The bespoke page stays
 *    primary (it decodes the Falcon-512 verifier call inline); UI
 *    components render a *second* "Blockscout ↗" chip pointing at
 *    `${base}/tx/<hash>` (or `/address/<addr>`, `/block/<n>`) for
 *    richer block / contract / address browsing.
 *
 * Both knobs are independent and can be set together.
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
 * Base URL for the Blockscout instance (no trailing slash), or `null`
 * when `NEXT_PUBLIC_BLOCKSCOUT_URL` is unset.
 */
export function getBlockscoutBase(): string | null {
  if (typeof process === "undefined") return null;
  const v = process.env.NEXT_PUBLIC_BLOCKSCOUT_URL;
  if (!v) return null;
  return v.replace(/\/$/, "");
}

/**
 * `true` when a Blockscout base is configured. Use to gate optional
 * "Blockscout ↗" chips in the UI.
 */
export function hasBlockscout(): boolean {
  return getBlockscoutBase() !== null;
}

export function blockscoutTxUrl(hash: string): string | null {
  const b = getBlockscoutBase();
  return b ? `${b}/tx/${hash}` : null;
}

export function blockscoutAddressUrl(addr: string): string | null {
  const b = getBlockscoutBase();
  return b ? `${b}/address/${addr}` : null;
}

export function blockscoutBlockUrl(n: number | bigint | string): string | null {
  const b = getBlockscoutBase();
  if (!b) return null;
  const v = typeof n === "bigint" ? n.toString() : String(n);
  return `${b}/block/${v}`;
}

/**
 * Compact `0x1234…abcd` formatter.
 */
export function shortHex(h: string, head = 8, tail = 6): string {
  if (typeof h !== "string") return String(h);
  if (h.length <= head + tail + 1) return h;
  return `${h.slice(0, head)}…${h.slice(-tail)}`;
}
