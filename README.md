# Homelab Dashboard

Single-pane dashboard for two Ubuntu media servers running Sonarr, Radarr,
Prowlarr, qBittorrent, Jellyfin, Jellyseerr, Declutarr, Flaresolverr,
Portainer, Watchtower, and Cloudflared — talking to everything over Tailscale.

Set `DEMO=true` for mock data — log in with `admin` / `demo`.

---

## Hosting it (5 minutes)

**Prerequisites:** Docker + Docker Compose, Tailscale running on both servers.
Pick one server to host the dashboard.

### 1. Clone the repo on the host server

```bash
git clone <this-repo> homelab-dashboard
cd homelab-dashboard
```

### 2. Create `config.json`

```bash
cp config.example.json config.json
```

Open `config.json` and fill in:

- **`auth.username`** — whatever you want.
- **`auth.passwordHash`** — `echo -n 'your-password' | sha256sum | cut -d' ' -f1`
- **`auth.sessionSecret`** — `openssl rand -hex 32`
- **`servers[].services[]`** — each service's `baseUrl` and `apiKey`. Use
  Tailscale hostnames so both local and remote services are reachable, e.g.
  `http://server-alpha:8989` or `http://100.x.y.z:8989`.

### 3. Start it

```bash
docker compose up -d --build
```

Open `http://<host-server>:3000` and log in.

If `config.json` is missing or invalid, the production container now fails
instead of silently showing fake data. Use `DEMO=true` only when you explicitly
want the mock dashboard.

### 4. (Optional) Host metrics

To show CPU / RAM / disk, run the bundled `glances` service **on each server
you want to monitor** (it ships in `docker-compose.yml`), then set
`glancesUrl` in `config.json` to that server's Tailscale URL, e.g.
`http://server-bravo:61208/api/4`.

Network rates are calculated after the second refresh because they need two
Glances samples.

---

## What is checked

- Sonarr / Radarr / Prowlarr: queue and health APIs.
- qBittorrent: login, torrent count, active count, transfer speed.
- Jellyfin: active sessions.
- Jellyseerr: status API.
- Flaresolverr: health endpoint.
- Portainer: status and endpoint health when an API key is supplied.
- Cloudflared: `/metrics` endpoint.
- Watchtower / Declutarr / unknown services: basic HTTP reachability unless
  you expose a richer endpoint and add a service fetcher.

---

## Updating

Edit `config.json` and `docker compose restart dashboard`. No rebuild needed.

To pull new app code: `git pull && docker compose up -d --build`.

---

## Where to get each API key

| Service | Where |
|---|---|
| Sonarr / Radarr / Prowlarr / Jellyseerr | Settings → General → API Key |
| Jellyfin | Dashboard → API Keys → New |
| Portainer | User menu → My account → Access tokens |
| qBittorrent | uses Web UI username + password |
| Flaresolverr / Watchtower / Cloudflared | no auth needed |

---

## Security notes

- All API keys live in `config.json` on the host. The browser never sees them —
  every upstream call is proxied through the dashboard.
- Session is a 7-day HttpOnly cookie signed with `auth.sessionSecret`.
- Designed for LAN / tailnet only. Don't expose port 3000 to the public
  internet without putting it behind your existing Cloudflare Tunnel or
  reverse proxy with TLS.
