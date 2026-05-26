# Homelab Dashboard

Self-hosted single-page dashboard for monitoring two Ubuntu media servers
running Sonarr, Radarr, Prowlarr, qBittorrent, Jellyfin, Jellyseerr, Declutarr,
Flaresolverr, Portainer, Watchtower, and Cloudflared.

The Lovable preview runs in **demo mode** with mock data — log in with password
`demo`. To wire it up to your real servers, follow the steps below.

## Quick start

1. Clone this repo onto Server A (the one that can reach both servers' Docker
   networks).
2. Copy `config.example.json` and fill in each service's base URL and API key:
   ```bash
   cp config.example.json config.json
   $EDITOR config.json
   ```
3. Generate a password hash:
   ```bash
   echo -n 'your-password' | sha256sum | cut -d' ' -f1
   ```
4. Create a `.env` file next to `docker-compose.yml`:
   ```
   APP_PASSWORD_HASH=<sha256 hash from step 3>
   SESSION_SECRET=<long random string, e.g. `openssl rand -hex 32`>
   CONFIG_JSON=<paste the entire contents of config.json on one line>
   ```
   (or use `CONFIG_JSON="$(cat config.json)"` in your shell)
5. Bring it up:
   ```bash
   docker compose up -d --build
   ```
6. Open `http://server-a:3000` and log in.

## Host metrics

`docker-compose.yml` includes a `glances-a` service that exposes host stats
on port 61208. Add a `glances-b` for Server B in the same compose file (or run
Glances directly on Server B) and reference both via the `glancesUrl` field in
`config.json`.

## How API keys are obtained

- **Sonarr / Radarr / Prowlarr / Jellyseerr** — Settings → General → API Key
- **Jellyfin** — Dashboard → API Keys → New
- **Portainer** — User menu → My account → Access tokens
- **qBittorrent** — uses Web UI username/password
- **Flaresolverr / Watchtower / Cloudflared** — no auth needed for the
  endpoints we read

## Adding a new service

1. Add it to `config.json` under the right server.
2. If it's an *arr-style API, no code changes are needed.
3. For something custom, add a fetcher in `src/server/snapshot.ts` and wire it
   into the `switch` in `fetchService`.

## Security notes

- The dashboard holds all API keys server-side; the browser never sees them.
- Session is a 7-day HttpOnly cookie signed with `SESSION_SECRET` (HMAC-SHA256).
- Designed to run behind your existing reverse proxy / Cloudflare Tunnel.
  Do **not** expose port 3000 directly to the public internet.

## Architecture

```
Browser ── /api/* ──▶ Dashboard container (Bun + TanStack Start SSR)
                         │
                         ├─▶ Sonarr / Radarr / Prowlarr / Jellyfin / …  (per-server APIs)
                         └─▶ Glances on each host                       (host stats)
```

All upstream calls are made server-side from the dashboard container, so the
browser only talks to the dashboard.

## Not included (yet)

- Alerting (email / Discord / ntfy)
- Historical metric graphs
- Editing config from the UI (file-based by design)
