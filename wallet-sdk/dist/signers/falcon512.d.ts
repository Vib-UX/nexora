/**
 * Real Falcon-512 signer.
 *
 * Two execution modes are supported:
 *
 *  1. **Browser wasm** (default in the dashboard) — the
 *     `signer/falcon-signer-wasm` crate compiled with `wasm-pack` runs
 *     keygen and sign in the visitor's browser. The dashboard injects a
 *     {@link Falcon512Adapter} that wraps the wasm bindings.
 *
 *  2. **Daemon HTTP** — the `signer/falcon-signer` Rust binary runs as a
 *     local process and exposes `GET /pubkey` + `POST /sign`. Used by
 *     Node-side callers (the agent, scripts) and as a browser fallback
 *     when wasm fails to load.
 *
 * Both modes converge on the same {@link Falcon512Signer} surface, which
 * the {@link NexoraClient} consumes.
 */
import { type Hex } from "viem";
import type { PqSig } from "../types.js";
export declare const FALCON512_REAL_PUBKEY_BYTES = 897;
export declare const FALCON512_REAL_SIG_BYTES = 666;
export interface Falcon512Keypair {
    /** 897-byte Falcon-512 public key (header `0x09` + 14-bit packed coeffs). */
    publicKey: Uint8Array;
    /**
     * Logical handle pointing to the secret key. For the daemon backend this
     * holds the daemon URL; for the browser-wasm backend it holds the
     * localStorage key under which the secret is cached. The actual secret
     * never travels through this object except via the {@link Falcon512Adapter}.
     */
    secretRef: string;
}
export interface Falcon512SignOpts {
    /** Base URL of the local Falcon signer daemon. */
    signerUrl?: string;
    /** Optional fetch override (useful for tests / non-fetch runtimes). */
    fetchImpl?: typeof fetch;
}
/**
 * Where Falcon-512 keygen / signing physically runs for a given session.
 */
export type Falcon512Source = "browser-wasm" | "daemon" | "external";
/**
 * Stateless adapter the SDK uses to talk to whichever Falcon-512 backend
 * the host has wired up. Implementations are free to bring their own
 * keystore (browser localStorage, OS keyring, HSM, ...).
 */
export interface Falcon512Adapter {
    source: Falcon512Source;
    /**
     * Sign a 32-byte op hash. Implementations MUST return the canonical
     * 666-byte Falcon-512 signature with the `0x39 || nonce || tail` PQClean
     * layout (or the equivalent FIPS-206 `0x59` header — both are accepted by
     * the on-chain verifier).
     */
    sign(opHash: Hex): Promise<Hex>;
    /**
     * 897-byte Falcon-512 public key. Used by the SDK to construct
     * `pqPubkey` and by the dashboard to compute the `pqPubkeyHash`
     * commitment.
     */
    getPublicKey(): Promise<Uint8Array>;
}
/**
 * Unified signer. Carries the public key and a `sign()` method. The
 * dashboard typically constructs this once after the user clicks
 * "Generate keypair" and reuses it for every UserOp.
 */
export interface Falcon512Signer {
    source: Falcon512Source;
    publicKey: Uint8Array;
    /** Returns a fully-formed `PqSig` ready to be ABI-packed into a UserOp. */
    signOp(opHash: Hex): Promise<PqSig>;
}
/**
 * Build a {@link Falcon512Signer} from an arbitrary adapter. The dashboard
 * passes a wasm-backed adapter; the daemon helpers below produce one
 * automatically.
 */
export declare function makeFalcon512Signer(adapter: Falcon512Adapter): Promise<Falcon512Signer>;
/**
 * Build a daemon-backed adapter. The daemon must already be serving
 * `/pubkey` and `/sign` (see `signer/falcon-signer/src/main.rs`).
 */
export declare function makeDaemonFalcon512Adapter(opts?: Falcon512SignOpts): Falcon512Adapter;
/**
 * Convenience: ask the daemon for its current pubkey + return a
 * {@link Falcon512Keypair} compatible with older SDK call sites.
 */
export declare function loadFalcon512Keypair(opts?: Falcon512SignOpts): Promise<Falcon512Keypair>;
/**
 * Back-compat helper. Prefer {@link makeFalcon512Signer} +
 * {@link makeDaemonFalcon512Adapter} in new code.
 */
export declare function signFalcon512(opHash: Hex, kp: Falcon512Keypair, opts?: Falcon512SignOpts): Promise<PqSig>;
export declare function falcon512PubkeyCommitment(pk: Uint8Array): Hex;
export declare function serializeFalcon512Keypair(kp: Falcon512Keypair): string;
export declare function deserializeFalcon512Keypair(s: string): Falcon512Keypair;
//# sourceMappingURL=falcon512.d.ts.map