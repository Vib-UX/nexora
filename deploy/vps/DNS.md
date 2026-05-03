# DNS for `nexorapq.in` (VPS deployment)

Add these records at your DNS provider (values use your server’s **public** IP, e.g. from `curl -4 ifconfig.me` on the VPS).

## Required (pattern A: separate RPC and WebSocket hostnames)

| Type | Name / host        | Value        | TTL |
|------|--------------------|-------------|-----|
| A    | `blockchain`       | `<VPS IPv4>` | 300 |
| A    | `ws.blockchain`    | `<VPS IPv4>` | 300 |

Optional if you use IPv6:

| Type | Name / host        | Value        |
|------|--------------------|-------------|
| AAAA | `blockchain`       | `<VPS IPv6>` |
| AAAA | `ws.blockchain`    | `<VPS IPv6>` |

Resulting hostnames:

- `blockchain.nexorapq.in` → HTTPS JSON-RPC (nginx → Nitro `8547`)
- `ws.blockchain.nexorapq.in` → WSS (nginx → Nitro `8548`)

## Verify

After DNS propagates (often a few minutes):

```bash
./deploy/vps/verify-dns.sh blockchain.nexorapq.in
./deploy/vps/verify-dns.sh ws.blockchain.nexorapq.in
```

Each script compares the resolved A record to this machine’s public IP (when run on the VPS).
