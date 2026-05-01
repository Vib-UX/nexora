/* tslint:disable */
/* eslint-disable */

export class Falcon512Result {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly commitment: string;
    readonly publicKey: string;
    readonly secretKey: string;
}

/**
 * Deterministic keygen from a 32-byte seed.
 */
export function keygen(seed_hex: string): Falcon512Result;

/**
 * Sign a 32-byte hex hash with a Falcon-512 secret key. Returns the 666-byte
 * hex signature.
 */
export function sign(secret_key_hex: string, hash_hex: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_falcon512result_free: (a: number, b: number) => void;
    readonly falcon512result_commitment: (a: number) => [number, number];
    readonly falcon512result_publicKey: (a: number) => [number, number];
    readonly falcon512result_secretKey: (a: number) => [number, number];
    readonly keygen: (a: number, b: number) => [number, number, number];
    readonly sign: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
