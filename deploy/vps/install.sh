#!/usr/bin/env bash
# One-shot VPS prep for Nexora Nitro + nginx + firewall (Debian/Ubuntu).
# Run on the server with sudo: bash deploy/vps/install.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ "${EUID:-0}" -ne 0 ]]; then
  echo "Re-run with sudo: sudo bash deploy/vps/install.sh"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx certbot python3-certbot-nginx ca-certificates curl dnsutils ufw \
  apt-transport-https gnupg

if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

# Firewall: HTTP/HTTPS only (do not publish 8547/8548 publicly).
if command -v ufw &>/dev/null; then
  ufw allow OpenSSH
  ufw allow 'Nginx Full'
  ufw --force enable || true
fi

# Nitro: localhost-only ports (see chain/docker-compose.yml)
docker compose -f chain/docker-compose.yml up -d

# nginx snippets + site (snippets are reusable when merging into an existing nginx)
install -m0755 -d /etc/nginx/snippets
install -m0644 deploy/vps/nginx/nexora-websocket-upgrade.map.conf /etc/nginx/snippets/
install -m0644 deploy/vps/nginx/blockchain.nexorapq.in.servers.conf /etc/nginx/snippets/

NGINX_SITE="blockchain.nexorapq.in.conf"
install -m0644 "deploy/vps/nginx/${NGINX_SITE}" "/etc/nginx/sites-available/${NGINX_SITE}"
ln -sf "/etc/nginx/sites-available/${NGINX_SITE}" "/etc/nginx/sites-enabled/${NGINX_SITE}"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo ""
echo "Done. Next:"
echo "  1) Ensure DNS A records for blockchain.nexorapq.in and ws.blockchain.nexorapq.in → this host."
echo "  2) bash deploy/vps/verify-dns.sh blockchain.nexorapq.in"
echo "  3) certbot --nginx -d blockchain.nexorapq.in -d ws.blockchain.nexorapq.in"
echo "  4) curl -sk https://blockchain.nexorapq.in -X POST -H 'Content-Type: application/json' \\"
echo "       -d '{\"jsonrpc\":\"2.0\",\"method\":\"eth_chainId\",\"params\":[],\"id\":1}'"
