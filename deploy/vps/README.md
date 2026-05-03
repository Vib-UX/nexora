# VPS: Nitro + nginx + TLS (`nexorapq.in`)

This directory holds configs and scripts referenced in the repo’s blockchain deployment plan.

## Prerequisites

- Debian/Ubuntu VPS with `sudo`
- **Docker** on `PATH` (`docker …`). If you see `docker: command not found`, install either:
  - `sudo bash deploy/vps/install-docker-debian.sh` (packages `docker.io` + `docker-compose`), then run **`docker-compose`** (hyphen) as shown in that script; or
  - official engine: `curl -fsSL https://get.docker.com | sh` (includes Compose v2 → **`docker compose`** with a space).
- **Permission denied** on `/var/run/docker.sock`: your user must be in the `docker` group (`install-docker-debian.sh` does this when run with `sudo`) — then **log out and back in** or run `newgrp docker`. Quick workaround: `sudo docker-compose -f chain/docker-compose.yml up -d`.
- DNS: see [DNS.md](./DNS.md)
- **Security**: The default Nitro `--dev` chain documents a **known private key**. Do not expose that setup to untrusted users. For public RPC, use a properly secured chain and keys.

## Quick setup

From the repository root on the VPS:

```bash
sudo bash deploy/vps/install.sh
```

**Already have nginx** (e.g. another site like `paysats-api` on the same host): install only Nexora snippets + virtual host — no second nginx, same ports 80/443 after certbot:

```bash
sudo bash deploy/vps/apply-nginx.sh
```

That copies [`nexora-websocket-upgrade.map.conf`](./nginx/nexora-websocket-upgrade.map.conf) and [`blockchain.nexorapq.in.servers.conf`](./nginx/blockchain.nexorapq.in.servers.conf) into `/etc/nginx/snippets/`, enables [`nexora-blockchain`](./nginx/blockchain.nexorapq.in.conf) in `sites-enabled`, then reloads nginx.

Then obtain certificates (after DNS resolves to this server). Add the **`ws.blockchain`** A record first (see [DNS.md](./DNS.md)), or start with only the RPC host:

```bash
sudo certbot --nginx -d blockchain.nexorapq.in -d ws.blockchain.nexorapq.in
# If ws.* is not in DNS yet:
# sudo certbot --nginx -d blockchain.nexorapq.in
# (add ws DNS, extend cert later: sudo certbot certonly --nginx -d ... --expand)
```

## Frontend / SDK environment

After TLS is live, point the dashboard (and other apps) at:

| Variable | Example |
|----------|---------|
| `NEXT_PUBLIC_NEXORA_RPC_URL` | `https://blockchain.nexorapq.in` |
| `NEXT_PUBLIC_NEXORA_WS_URL` | `wss://ws.blockchain.nexorapq.in` |

See [dashboard/.env.production.example](../../dashboard/.env.production.example).

## Existing nginx already on port 80 / 443

Only one process can bind to `:80` and `:443`. If nginx (or another reverse proxy) is already serving other sites, **do not** start a second nginx that tries to listen on the same ports.

**Preferred:** keep **one** nginx and add Nexora as extra virtual hosts.

1. Install Nitro (Docker) as usual: `docker compose -f chain/docker-compose.yml up -d`.
2. Copy the snippet files from [`deploy/vps/nginx/`](./nginx/) to `/etc/nginx/snippets/` on the server (or use `install.sh`, which copies them there and enables the site):
   - [`nexora-websocket-upgrade.map.conf`](./nginx/nexora-websocket-upgrade.map.conf) — WebSocket `Connection` header map (include **once** in `http` context).
   - [`blockchain.nexorapq.in.servers.conf`](./nginx/blockchain.nexorapq.in.servers.conf) — `server` blocks for `blockchain` and `ws.blockchain` hostnames.
3. **`map` deduplication:** if you already have `map $http_upgrade $connection_upgrade { ... }` anywhere under `http { }`, **skip** including `nexora-websocket-upgrade.map.conf` and only add the `server` blocks (or only `include .../blockchain.nexorapq.in.servers.conf`). Two maps with the same name will make `nginx -t` fail.
4. Wire includes from `http` context. The stock Debian layout includes files under `sites-enabled/` inside `http { }`, so you can add a small site file that only contains:

   ```nginx
   include /etc/nginx/snippets/nexora-websocket-upgrade.map.conf;
   include /etc/nginx/snippets/blockchain.nexorapq.in.servers.conf;
   ```

   Or paste/include **only** `blockchain.nexorapq.in.servers.conf` if the map already exists.
5. Run `sudo nginx -t && sudo systemctl reload nginx`.
6. Issue certs against **this** nginx: `sudo certbot --nginx -d blockchain.nexorapq.in -d ws.blockchain.nexorapq.in`. Certbot adds TLS only to these `server_name`s; other sites stay unchanged.

If your edge proxy is **not** nginx (Caddy, Traefik, etc.), add equivalent routes for those hostnames to `127.0.0.1:8547` (HTTP JSON-RPC) and `127.0.0.1:8548` (WebSocket with `Upgrade` headers).

**Fallback:** if you cannot change the main proxy, you can run a **separate** nginx (or the same snippets) on **non-default** ports (e.g. `8443`), with URLs like `https://blockchain.nexorapq.in:8443`. Prefer fixing the shared proxy when possible; non-443 HTTPS is often blocked on restrictive networks.

## Operations

- **Chain logs**: `docker logs -f nexora-nitro`
- **Compose**: `docker compose -f chain/docker-compose.yml …` from repo root
- **Nginx test**: `sudo nginx -t && sudo systemctl reload nginx`

## Optional: relayer

If you expose the relayer (`relayer`, default port `8787`), add another `server_name` block or subdomain in nginx (not included here).
