#!/usr/bin/env bash
# Install Nexora nginx snippets + site on this host (same pattern as paysats-api).
# Does not install Docker or Nitro — start the chain with:
#   docker compose -f chain/docker-compose.yml up -d
#
# Usage from repo root:
#   sudo bash deploy/vps/apply-nginx.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

if [[ "${EUID:-0}" -ne 0 ]]; then
  echo "Run with sudo: sudo bash deploy/vps/apply-nginx.sh"
  exit 1
fi

install -d -m0755 /etc/nginx/snippets
install -m0644 "$ROOT/deploy/vps/nginx/nexora-websocket-upgrade.map.conf" /etc/nginx/snippets/
install -m0644 "$ROOT/deploy/vps/nginx/blockchain.nexorapq.in.servers.conf" /etc/nginx/snippets/
install -m0644 "$ROOT/deploy/vps/nginx/explorer.nexorapq.in.servers.conf" /etc/nginx/snippets/
install -m0644 "$ROOT/deploy/vps/nginx/blockchain.nexorapq.in.conf" /etc/nginx/sites-available/nexora-blockchain
ln -sf /etc/nginx/sites-available/nexora-blockchain /etc/nginx/sites-enabled/nexora-blockchain

nginx -t
systemctl reload nginx

echo ""
echo "Nexora site enabled alongside existing vhosts (e.g. paysats-api)."
echo "  Snippets: /etc/nginx/snippets/nexora-*.map.conf,"
echo "            blockchain.nexorapq.in.servers.conf,"
echo "            explorer.nexorapq.in.servers.conf"
echo "  Site:     /etc/nginx/sites-enabled/nexora-blockchain"
echo ""
echo "Next:"
echo "  1) docker compose -f $ROOT/chain/docker-compose.yml up -d                  # Nitro on 127.0.0.1:8547-8548"
echo "  2) docker compose -f $ROOT/chain/docker-compose.yml --profile explorer up -d  # + Blockscout on 127.0.0.1:4001"
echo "  3) sudo certbot --nginx -d blockchain.nexorapq.in -d ws.blockchain.nexorapq.in -d explorer.nexorapq.in"
echo "  4) curl -sS https://blockchain.nexorapq.in -X POST -H 'Content-Type: application/json' \\"
echo "       -d '{\"jsonrpc\":\"2.0\",\"method\":\"eth_chainId\",\"params\":[],\"id\":1}'"
echo "  5) curl -sS https://explorer.nexorapq.in/api/v2/stats           # Blockscout API"
