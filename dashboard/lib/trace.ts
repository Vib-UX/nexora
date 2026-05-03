/**
 * Shared call-tracer helpers used by the in-page Verifier Trace panel
 * and the standalone /tx/[hash] explorer page.
 *
 * Geth's `callTracer` returns a recursively-nested frame tree with the
 * shape below; viem doesn't type `debug_traceTransaction`, but
 * `publicClient.request({ method: "debug_traceTransaction", ... })` is
 * a pass-through and works on Nitro.
 */

import type { Address, Hex, PublicClient } from "viem";
import { decodeFunctionData, hexToBytes } from "viem";
import { abi } from "@nexora/wallet-sdk";

export interface CallFrame {
  type: string; // CALL / DELEGATECALL / STATICCALL / CREATE / ...
  from: Address;
  to?: Address;
  value?: Hex;
  gas?: Hex;
  gasUsed?: Hex;
  input?: Hex;
  output?: Hex;
  error?: string;
  revertReason?: string;
  calls?: CallFrame[];
}

export function eqAddr(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

export function selectorOf(input?: Hex): string {
  if (!input || input.length < 10) return "0x";
  return input.slice(0, 10);
}

export function bytesLen(hex?: Hex): number {
  if (!hex || hex.length <= 2) return 0;
  return (hex.length - 2) / 2;
}

export function gasNum(g?: Hex): number {
  if (!g) return 0;
  try {
    return Number(BigInt(g));
  } catch {
    return 0;
  }
}

export interface DecodedVerify {
  msgHash: Hex;
  sigBytes: number;
  pubkeyBytes: number;
}

export function decodeVerify(input: Hex): DecodedVerify | null {
  try {
    const { args, functionName } = decodeFunctionData({
      abi: abi.pqVerifierAbi,
      data: input,
    });
    if (functionName !== "verify") return null;
    const [msgHash, sig, pubkey] = args as readonly [Hex, Hex, Hex];
    return {
      msgHash,
      sigBytes: bytesLen(sig),
      pubkeyBytes: bytesLen(pubkey),
    };
  } catch {
    return null;
  }
}

export function decodeBoolOutput(out?: Hex): boolean | null {
  if (!out || out.length < 4) return null;
  const bytes = hexToBytes(out);
  if (bytes.length === 0) return null;
  // Solidity bool returns are right-aligned in a 32-byte word.
  return bytes[bytes.length - 1] === 1;
}

/**
 * Walk the call tree and collect every frame whose `to` matches the
 * Falcon-512 verifier address. The same UserOp triggers two calls in
 * the current contract layout — `validateUserOp` (off-chain `view`
 * pre-flight) and the `executeUserOp` validation path — so we keep all
 * of them and let the UI render each.
 */
export function findVerifierCalls(
  root: CallFrame,
  verifier: Address | string,
): CallFrame[] {
  const out: CallFrame[] = [];
  const stack: CallFrame[] = [root];
  while (stack.length) {
    const f = stack.pop()!;
    if (eqAddr(f.to, verifier)) out.push(f);
    if (f.calls?.length) stack.push(...f.calls);
  }
  return out;
}

export interface FlatFrame {
  depth: number;
  frame: CallFrame;
  isVerifier: boolean;
}

/**
 * Flatten the call tree into a depth-indented list. The verifier flag
 * lets the UI highlight the row(s) that hit the Falcon-512 verifier.
 */
export function flattenTree(
  root: CallFrame,
  verifier: Address | string | undefined,
  limit = 64,
): FlatFrame[] {
  const out: FlatFrame[] = [];
  const walk = (frame: CallFrame, depth: number) => {
    if (out.length >= limit) return;
    out.push({
      depth,
      frame,
      isVerifier: verifier ? eqAddr(frame.to, verifier) : false,
    });
    for (const child of frame.calls ?? []) walk(child, depth + 1);
  };
  walk(root, 0);
  return out;
}

/**
 * Issue the `debug_traceTransaction` RPC with the Geth callTracer.
 * Wraps the viem `request` call with the right tracer config and
 * surfaces a nice error message when the node is missing the tracer.
 */
export async function fetchCallTrace(
  publicClient: PublicClient,
  hash: Hex,
): Promise<CallFrame> {
  return (await publicClient.request({
    // viem types don't expose `debug_*`, but the request method is
    // pass-through.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    method: "debug_traceTransaction" as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    params: [
      hash,
      { tracer: "callTracer", tracerConfig: { onlyTopCall: false, withLog: false } },
    ] as any,
  })) as CallFrame;
}
