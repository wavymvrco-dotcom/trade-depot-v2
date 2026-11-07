# Deploying Trade Depot to a VPS

One small Linux server runs two always-on services:

| Service | Runs | Command |
|---|---|---|
| `trade-depot-web` | API + website (port 5000, behind Caddy for HTTPS) | `node dist/index.cjs` with `RUN_WORKERS=false` |
| `trade-depot-worker` | auto-trade, alerts, signal outcomes, push digest, job queue | `node dist/worker.cjs` |

The database stays on Neon (us-west-2, Oregon), so pick a VPS region close to it (US West).
Any provider works (Hetzner, DigitalOcean, Vultr, Linode…). 2 vCPU / 4 GB RAM is plenty for Phase 0–1;
the Lab's training runs are CPU-heavy, so size up later if runs queue.

## One-time setup (Ubuntu 24.04)

```bash
# 1. Node 22 LTS (pg-boss needs ≥ 22.12), git, Caddy
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git caddy

# 2. A user for the app, and the code
sudo useradd --system --create-home --shell /bin/bash tradedepot
sudo mkdir -p /opt/trade-depot && sudo chown tradedepot: /opt/trade-depot
sudo -u tradedepot git clone https://github.com/wavymvrco-dotcom/trade-depot-v2.git /opt/trade-depot
#   (private repo: add a read-only deploy key for the tradedepot user first)

# 3. Secrets — copy .env.example's keys into /etc/trade-depot.env and fill them in
sudo install -m 600 -o tradedepot /dev/null /etc/trade-depot.env
sudo nano /etc/trade-depot.env

# 4. Services
sudo cp /opt/trade-depot/deploy/trade-depot-*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable trade-depot-web trade-depot-worker

# 5. HTTPS: point your domain's A record at the server, edit the domain in the Caddyfile, then
sudo cp /opt/trade-depot/deploy/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy

# 6. Let the app user restart its own services (used by deploy.sh)
echo 'tradedepot ALL=(root) NOPASSWD: /usr/bin/systemctl restart trade-depot-worker trade-depot-web' | sudo tee /etc/sudoers.d/trade-depot

# 7. First deploy
sudo -u tradedepot /opt/trade-depot/deploy/deploy.sh

# 8. Firewall: only SSH and HTTPS from outside
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable
```

## Every later deploy

```bash
sudo -u tradedepot /opt/trade-depot/deploy/deploy.sh
```

## Checking on it

```bash
systemctl status trade-depot-web trade-depot-worker
journalctl -u trade-depot-worker -f
```

Jobs survive restarts: anything queued while the worker is down waits in Postgres (pg-boss), and a job
interrupted mid-run is retried after it expires.

## Required environment (`/etc/trade-depot.env`)

See `.env.example`. At minimum: `DATABASE_URL` (Neon pooled), `DATABASE_URL_UNPOOLED` (Neon direct, used by
the job queue and migrations), `SESSION_SECRET`, `ENCRYPTION_KEY` (never change once set), `APP_URL`,
`TWELVE_DATA_API_KEY`. Do not set `RUN_WORKERS` here; the service files set it per process.
