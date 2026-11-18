# Deployment

Open Workouts is **one process with one SQLite file**. Pick whichever platform you already run. The deployment options are equivalent, and the data moves between them by copying `/data`.

| Option | Best for | Effort |
|---|---|---|
| [Docker / Compose](#docker--compose) | Most homelabs, NAS (Synology, Unraid, TrueNAS), a VPS | ⭐ easiest |
| [Kubernetes](#kubernetes) | k3s / Talos / existing clusters | ⭐⭐ |
| [Proxmox](#proxmox) | Proxmox VE hosts: an LXC with no Docker, or a VM running Docker | ⭐⭐ |

**Recommendation if you're unsure:** Docker Compose, either inside a small Proxmox LXC/VM or on whatever box already runs your containers. It has the fewest moving parts, and upgrades are just `docker compose pull && docker compose up -d`.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `DATA_DIR` | `/data` (in the image) | Location of `open-workouts.db` |
| `DATABASE_FILE` | `$DATA_DIR/open-workouts.db` | Overrides the DB path |
| `WEB_DIR` | `/app/web` (in the image) | Built web UI; unset = API only |
| `ALLOW_REGISTRATION` | `false` | The **first** account can always be created and becomes admin. Set to `true` to let others sign up |
| `TRUST_PROXY` | `false` | Set to `true` behind a reverse proxy, so rate limiting sees real client IPs |
| `CORS_ORIGINS` | *(any)* | Comma-separated allow-list, if you host the web UI on another origin |
| `LOG_LEVEL` | `info` | `silent`, `error`, `warn`, `info` or `debug` |
| `LLM_PROVIDER` | *(unset)* | `anthropic` (Claude) or `openai` (any OpenAI-compatible endpoint, e.g. Ollama). Enables AI insights; see [AI_INSIGHTS.md](AI_INSIGHTS.md) |
| `LLM_MODEL`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_EFFORT` | | Model settings. `ANTHROPIC_API_KEY` also works for Claude |
| `INSIGHTS_SCHEDULER` / `INSIGHTS_ALLOW_WEBHOOKS` | `true` / `true` | Scheduled weekly reports; user-configured notification URLs |
| `TZ` | `UTC` | Time zone used for scheduled weekly reports |

## Docker / Compose

```bash
git clone https://github.com/ernest-it/open-workouts.git
cd open-workouts
docker compose up -d          # builds the image the first time
open http://localhost:8080    # create your account (the first one becomes admin)
```

Once CI publishes images, replace `build: .` with `image: ghcr.io/ernest-it/open-workouts:latest` in `docker-compose.yml`. The images are multi-arch (amd64 and arm64), so they also run on a Raspberry Pi 4/5.

**Image details:**
- Debian slim + Node 22.
- Runs as the non-root `node` user (uid 1000).
- Healthcheck on `/api/v1/health`.
- A single volume at `/data`.

### Reverse proxy and HTTPS

The mobile app works over plain HTTP on your LAN. HTTPS is strongly recommended as soon as the server is reachable from outside your network. Example `Caddyfile`:

```
workouts.example.com {
    reverse_proxy open-workouts:8080
}
```

Set `TRUST_PROXY=true`. Traefik and nginx-proxy-manager work the same way: proxy everything to port 8080, including `/mcp` for AI assistants; no websockets are needed.

**Remote access without opening ports:** Tailscale or a Cloudflare Tunnel in front of the container works well. Point the app at the tailnet or tunnel hostname.

## Kubernetes

```bash
# edit the image tag, the Ingress host and ingressClassName first
kubectl apply -k deploy/k8s
```

`deploy/k8s/open-workouts.yaml` contains:
- Namespace
- PVC (1 Gi)
- ConfigMap
- Deployment
- Service
- Ingress

**Important:** SQLite means **exactly one replica**. The Deployment uses `strategy: Recreate` and a `ReadWriteOnce` volume. That's plenty: a single instance easily serves a family or a whole gym.

**The pod is hardened:**
- non-root user
- read-only root filesystem
- all capabilities dropped
- no privilege escalation

For TLS, add a `tls:` block to the Ingress (cert-manager), or use your cluster's default certificate.

## Proxmox

### Option A: LXC without Docker (lightest)

On the Proxmox host:

```bash
pveam update && pveam available | grep debian-12    # find the template name
pveam download local debian-12-standard_12.7-1_amd64.tar.zst
pct create 210 local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst \
  --hostname open-workouts --cores 1 --memory 512 --rootfs local-lvm:4 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp --unprivileged 1
pct start 210
pct push 210 deploy/proxmox/install-lxc.sh /root/install-lxc.sh
pct exec 210 -- bash /root/install-lxc.sh
```

**What the script does:**
1. Installs Node 22.
2. Clones and builds the repo into `/opt/open-workouts`.
3. Stores data in `/var/lib/open-workouts`.
4. Runs the server as a hardened systemd service on port 8080.

Re-run the script to upgrade. Put extra settings in `/etc/default/open-workouts`, e.g. `ALLOW_REGISTRATION=true`.

**Backups:** a Proxmox `vzdump` of the container covers everything.

### Option B: VM or LXC running Docker

Install Docker in a Debian VM, or in an LXC with `--features nesting=1,keyctl=1`, then follow the [Compose](#docker--compose) steps.

## Backups

All state lives in **one SQLite database** in `/data`. Any of these work:

```bash
# consistent online backup (works while the server runs)
docker exec open-workouts node -e "require('better-sqlite3')('/data/open-workouts.db').backup('/data/backup.db').then(()=>console.log('ok'))"

# or: stop the container and copy the volume
docker compose stop && docker run --rm -v open-workouts_open-workouts-data:/data -v "$PWD":/b debian cp /data/open-workouts.db /b/ && docker compose start
```

Each user can also download a **full JSON backup** or a **Strong-format CSV** from Settings in the web UI.

## Upgrading

- Database migrations are additive and run automatically on start.
- Before a major version, back up `/data`.
