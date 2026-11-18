# Security

## Reporting a vulnerability

Please **don't open a public issue** for security problems. Use GitHub's private vulnerability reporting instead: the **Security** tab of this repository → **Report a vulnerability**. Include steps to reproduce and the version or commit. You'll get an acknowledgement as soon as possible.

## Running a server safely

- **Create your account right after the first start.** The first account on a fresh server becomes the admin, and afterwards registration closes unless `ALLOW_REGISTRATION=true`. Don't expose a fresh server to the internet before you've signed up.
- **Use HTTPS for anything reachable from outside your network.** Put a reverse proxy in front (Caddy, Traefik, nginx), or use Tailscale or a Cloudflare Tunnel. The app allows plain `http://` only so it works on a home LAN.
- **Set `TRUST_PROXY=true` only when a reverse proxy is actually in front.** Otherwise clients can fake their IP address and get around rate limiting.
- **API tokens** (Settings → Devices & tokens) give full access to your data, including over MCP. Store them like passwords and revoke any you no longer use.
- **AI insights:**
  - With `LLM_PROVIDER=anthropic`, users' training summaries are sent to Anthropic.
  - Requests are capped per user (`INSIGHTS_AI_REQUESTS_PER_HOUR`, default 30) to bound API costs.
  - Webhook URLs can't target loopback, link-local or cloud metadata addresses, and redirects aren't followed. Private LAN addresses are allowed, so a self-hosted ntfy works. On a server with untrusted users, set `INSIGHTS_ALLOW_WEBHOOKS=false`.
- **Keep the image updated:** `docker compose pull && docker compose up -d`.

## Built-in protections

- **Passwords** are hashed with scrypt.
- **API tokens** are random 256-bit values; only their SHA-256 hash is stored.
- **Logins and sign-ups are rate-limited** per IP. Changing your password signs out your other devices.
- **Authentication runs before any request body is read.** Anonymous requests are limited to 1 MB; only signed-in sync and import requests may be larger.
- **Users are isolated:** every row is keyed by its user, and sync rejects writes to built-in data and timestamps far in the future.
- **The web UI sends security headers:** a strict Content-Security-Policy, no framing, `nosniff`, and no referrer.
- **Deleting an account requires the password,** not just a token.
- **The container runs as a non-root user.** The Kubernetes manifest also drops all capabilities and uses a read-only root filesystem.
