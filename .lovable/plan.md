# Homelab Media Dashboard — Plan

A single self-hosted web app you run in Docker on one of your two servers. It logs into each app's API on both machines, shows health/queues/errors at a glance, and surfaces high-level Ubuntu host stats. One password to get in. No subscriptions, no third-party cloud.

## Architecture

Because the dashboard runs in a browser but needs to call services on your LAN (`http://sonarr:8989`, `http://jellyfin:8096`, etc.), **all API calls must go through a server-side proxy** — browsers can't call those directly (CORS + API keys would leak). So this is a full-stack app, not a static site.

```text
 Browser (you)
      |
      v
 Dashboard container  (Node server + React UI)
   - /api/* server routes proxy to each service
   - holds API keys (never sent to browser)
   - single-user login (bcrypt password + JWT cookie)
      |
      +--> Server A: sonarr, radarr, prowlarr, qbit, jellyfin,
      |             jellyseerr, declutarr, flaresolverr,
      |             portainer, watchtower, cloudflared
      +--> Server B: same stack
      +--> Host stats on A & B (see below)
```

Important note on hosting: Lovable builds and previews the app here, but to actually reach your LAN services it has to run **on your network**. Workflow: build it here → push to GitHub → `docker compose up` on Server A. The Lovable preview won't be able to talk to your real services (that's expected); we'll ship a small "demo mode" with mock data so the preview is still useful.

## Tech choices

- TanStack Start (React + server routes in one process) — fits Lovable's web_app artifact and gives us the proxy backend we need.
- Tailwind + shadcn/ui for the UI.
- TanStack Query for polling (refresh every 10–30s per widget).
- `jose` for JWT, `bcryptjs` for password hash.
- Config via a single `config.yaml` mounted into the container — lists both servers, each service's base URL + API key, and your password hash.
- Dockerfile + `docker-compose.yml` included.

## Services & what we show

Per server, one card per service with status pill (up / degraded / down) and key signals:

- **Sonarr / Radarr** — queue size, stuck/failed downloads, missing count, last RSS sync, health-check warnings (`/api/v3/health`).
- **Prowlarr** — indexer failures, last sync, app sync status.
- **qBittorrent** — active/seeding/error torrents, DL/UL speed, connection status, free space.
- **Jellyfin** — server up, active streams (with user + title), transcodes, last library scan.
- **Jellyseerr** — pending requests, failed requests.
- **Declutarr** — last run, items cleaned (log tail via its API if exposed, otherwise container log).
- **Flaresolverr** — `/health` ping + version.
- **Portainer** — list of containers per endpoint with state (running/exited/unhealthy), restart counts, image age.
- **Watchtower** — last scan time, pending updates (via its metrics endpoint).
- **Cloudflared** — tunnel up/down + connector count (via its `/metrics` or `/ready` endpoint).

A top "Errors" strip aggregates anything currently red across both servers so you see problems immediately on load.

## Host (Ubuntu) health

Lightweight, no agent install required: deploy a tiny **Glances** container (`docker run glances -w`) on each server. Glances exposes a JSON API the dashboard reads for CPU %, RAM, swap, load, disk usage per mount, network throughput, uptime, and Docker container stats. One extra container per host, no subscription, no account.

If you'd rather not run Glances, fallback is reading the Docker socket directly (mounted read-only) for container stats and `/proc` via a small endpoint — but Glances is simpler and gives nicer host metrics. We'll go with Glances unless you say otherwise.

## Auth

Single login. On first boot, container prints a CLI hint to generate a bcrypt hash; you paste it into `config.yaml` as `auth.passwordHash`. Login form sets an httpOnly JWT cookie (7-day expiry). All `/api/*` routes require the cookie. No signup, no password reset UI (you edit the config file).

## Pages

1. **Overview** — both servers side-by-side, error strip on top, host stat tiles, service status grid.
2. **Server detail** (`/server/:id`) — expanded per-service panels with queues, streams, container lists.
3. **Logs** (`/logs`) — last N health events the dashboard has seen (kept in memory + small SQLite file for persistence across restarts).
4. **Settings** (`/settings`) — read-only view of loaded config so you can verify what's wired up; link to docs on editing `config.yaml`.

## Deliverables

- Full TanStack Start app with the pages above.
- Server routes under `/api/proxy/:server/:service/*` that inject the right API key and forward to the upstream.
- `config.example.yaml` documenting every field.
- `Dockerfile` (multi-stage, slim runtime) + `docker-compose.yml` showing the dashboard + two Glances services.
- README with: how to generate the password hash, how to fill in `config.yaml`, how to run, how to add a new service later.
- Demo/mock mode (`DEMO=1`) so the Lovable preview shows realistic fake data.

## Out of scope (call out if you want them)

- Alerting (email/Discord/ntfy on errors) — easy to add later.
- Historical metrics graphs (would need a time-series store).
- Editing config from the UI (kept file-based for safety).
- Reverse proxy / TLS (assume you already have Cloudflared or Caddy in front).

## Open questions before I build

1. Glances on each host OK, or do you want Docker-socket-only?
2. Both servers reachable from the dashboard container via DNS names or IPs? (I'll assume yes and you'll fill `config.yaml`.)
3. Any service above you'd rather drop from v1?
