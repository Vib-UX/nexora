#!/usr/bin/env bash
# Compare DNS A record for HOST to this host's public IPv4 (run on the VPS).
set -euo pipefail
HOST="${1:?Usage: $0 <hostname>}"
PUB_IP="$(curl -4 -fsS --max-time 10 ifconfig.me 2>/dev/null || curl -4 -fsS --max-time 10 icanhazip.com)"
RESOLVED="$(dig +short "$HOST" A | tail -n1)"
if [[ -z "$RESOLVED" ]]; then
  echo "ERROR: no A record for $HOST"
  exit 1
fi
echo "Public IP (this host): $PUB_IP"
echo "DNS A for $HOST:       $RESOLVED"
if [[ "$RESOLVED" == "$PUB_IP" ]]; then
  echo "OK: DNS matches this host."
  exit 0
fi
echo "WARN: DNS does not match this host (propagation or wrong record)."
exit 2
