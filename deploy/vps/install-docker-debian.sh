#!/usr/bin/env bash
# Minimal Docker on Debian/Ubuntu from distro packages (no Docker Inc. apt repo).
# Run: sudo bash deploy/vps/install-docker-debian.sh
#
# Provides `docker` and `docker-compose` (v1 CLI). Use either:
#   docker-compose -f chain/docker-compose.yml up -d
# or, after installing the Compose v2 plugin separately:
#   docker compose -f chain/docker-compose.yml up -d

set -euo pipefail

if [[ "${EUID:-0}" -ne 0 ]]; then
  echo "Run with sudo: sudo bash deploy/vps/install-docker-debian.sh"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y docker.io docker-compose

systemctl enable --now docker

# Let the user who invoked sudo use the socket without root (avoids Permission denied on /var/run/docker.sock)
if [[ -n "${SUDO_USER:-}" ]] && id "$SUDO_USER" &>/dev/null; then
  usermod -aG docker "$SUDO_USER"
  echo "Added '$SUDO_USER' to group 'docker'."
else
  echo "To run docker without sudo, add your user: sudo usermod -aG docker \"\$USER\""
fi

echo ""
echo "Log out and back in (or run: newgrp docker) for group membership to apply."
echo "Or use sudo once: sudo docker-compose -f chain/docker-compose.yml up -d"
echo ""
echo "Start Nitro from repo root (after newgrp or re-login):"
echo "  docker-compose -f chain/docker-compose.yml up -d"
