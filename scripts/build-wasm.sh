#!/usr/bin/env bash
# Build the Falcon-512 wasm-bindgen signer and place it where the dashboard
# can serve it directly from `/wasm/falcon512/...`.
#
# Outputs:
#   dashboard/public/wasm/falcon512/nexora_falcon512.js
#   dashboard/public/wasm/falcon512/nexora_falcon512_bg.wasm
#   dashboard/public/wasm/falcon512/nexora_falcon512.d.ts
#
# We also keep a copy under wallet-sdk/wasm/falcon512/ for non-browser consumers
# (e.g. tests, scripts that want to pre-generate keys).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_CRATE="$ROOT/signer/falcon-signer-wasm"
SDK_OUT="$ROOT/wallet-sdk/wasm/falcon512"
DASH_OUT="$ROOT/dashboard/public/wasm/falcon512"

if ! command -v wasm-pack >/dev/null 2>&1; then
  echo "error: wasm-pack not on PATH. Install with: cargo install wasm-pack --locked" >&2
  exit 1
fi

echo "[wasm:build] building $SRC_CRATE -> $SDK_OUT"
(cd "$SRC_CRATE" && wasm-pack build --release --target web --out-dir "$SDK_OUT" --out-name nexora_falcon512)

echo "[wasm:build] copying bundle to $DASH_OUT"
mkdir -p "$ROOT/dashboard/public/wasm"
rm -rf "$DASH_OUT"
cp -R "$SDK_OUT" "$DASH_OUT"

echo "[wasm:build] done. Artifacts:"
ls -lh "$DASH_OUT"
