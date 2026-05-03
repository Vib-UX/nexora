#!/usr/bin/env bash
# Boot a local Nexora devnet (Nitro node).
#
# Block/tx exploration is handled inside the dashboard itself at
# `/tx/[hash]`; no external explorer container is required.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[nexora] starting nitro container..."
( cd chain && docker compose up -d nitro )

echo "[nexora] waiting for RPC at http://localhost:8547 ..."
for i in {1..30}; do
  if curl -fsS -X POST -H 'Content-Type: application/json' \
      --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
      http://localhost:8547 >/dev/null 2>&1; then
    echo "[nexora] RPC up."
    break
  fi
  sleep 2
done

echo "[nexora] devnet ready."
echo "  RPC:      http://localhost:8547"
echo "  WS:       ws://localhost:8548"
echo "  ChainID:  412346 (0x6453A) — Nitro --dev"
echo "  Explorer: http://localhost:3000/tx/<hash>  (in-dashboard)"
echo
echo "Next: pnpm tsx scripts/deploy-all.ts"
