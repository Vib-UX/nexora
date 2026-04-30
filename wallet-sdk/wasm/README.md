# Falcon-512 wasm-bindgen bundle

This directory holds the compiled wasm-bindgen output of the
[`signer/falcon-signer-wasm`](../../signer/falcon-signer-wasm) crate. The
dashboard lazy-loads it only when `NEXT_PUBLIC_FALCON512_BROWSER=1` (default
flow uses the local `falcon-signer` HTTP daemon).

Build:

```bash
cd signer/falcon-signer-wasm
wasm-pack build --release --target web --out-dir ../../wallet-sdk/wasm
```

After building, this directory will contain `nexora_falcon_signer_wasm.js`,
`nexora_falcon_signer_wasm_bg.wasm`, and a small `.d.ts` file. The dashboard
loader is in
[`dashboard/lib/falcon512Browser.ts`](../../dashboard/lib/falcon512Browser.ts).
