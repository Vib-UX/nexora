# Falcon-512 wasm-bindgen bundle

The browser-side Falcon-512 signer is built from the
[`signer/falcon-signer-wasm`](../../signer/falcon-signer-wasm) crate.

Run the build script from the repo root:

```bash
pnpm wasm:build
```

This script:

1. Compiles the `nexora-falcon-signer-wasm` crate with `wasm-pack` (`--target web`).
2. Writes the output to `wallet-sdk/wasm/falcon512/` (this directory).
3. Copies the bundle to `dashboard/public/wasm/falcon512/` where Next.js
   serves it directly. The dashboard loads it dynamically; see
   [`dashboard/lib/falcon512Browser.ts`](../../dashboard/lib/falcon512Browser.ts).

The bundle currently weighs ~214 KB (uncompressed wasm) / ~14 KB JS shim.
Both directories are gitignored at the build-output level
(`wallet-sdk/wasm/falcon512/` is purely a build artifact). The
`dashboard/public/wasm/falcon512/` copy IS committed so the demo runs
without forcing visitors to install `wasm-pack`.

API exposed by the bundle (see `nexora_falcon512.d.ts`):

```ts
function keygen(seed_hex: string): Falcon512Result; // 32-byte hex seed
function sign(secret_key_hex: string, hash_hex: string): string;
```

`Falcon512Result` carries `publicKey` (897 B), `secretKey` (1281 B), and
`commitment` (`keccak256(publicKey)`), all hex-encoded.
