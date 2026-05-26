import type { DashboardSnapshot, HostStats, ServerSnapshot, ServiceStatus, LogEvent } from "./types";

function jitter(base: number, spread = 0.15) {
  const delta = base * spread;
  return base + (Math.random() * 2 - 1) * delta;
}

function makeHost(seed: number): HostStats {
  const totalGb = seed === 1 ? 64 : 32;
  const usedGb = +(jitter(seed === 1 ? 28 : 19, 0.1)).toFixed(1);
  return {
    uptimeSeconds: 60 * 60 * 24 * (seed === 1 ? 47 : 12) + Math.floor(Math.random() * 3600),
    cpuPercent: +jitter(seed === 1 ? 18 : 34, 0.3).toFixed(1),
    memUsedGb: usedGb,
    memTotalGb: totalGb,
    swapPercent: +jitter(seed === 1 ? 2 : 6, 0.4).toFixed(1),
    loadAvg: [
      +jitter(seed === 1 ? 0.8 : 1.4).toFixed(2),
      +jitter(seed === 1 ? 0.9 : 1.6).toFixed(2),
      +jitter(seed === 1 ? 1.1 : 1.8).toFixed(2),
    ],
    disks: seed === 1
      ? [
          { mount: "/", usedGb: 38, totalGb: 120 },
          { mount: "/mnt/media", usedGb: 14200, totalGb: 22000 },
          { mount: "/mnt/downloads", usedGb: 380, totalGb: 2000 },
        ]
      : [
          { mount: "/", usedGb: 22, totalGb: 80 },
          { mount: "/mnt/media", usedGb: 9800, totalGb: 16000 },
        ],
    net: { rxMbps: +jitter(seed === 1 ? 42 : 18, 0.5).toFixed(1), txMbps: +jitter(seed === 1 ? 8 : 4, 0.5).toFixed(1) },
    containers: seed === 1
      ? { total: 14, running: 13, unhealthy: 0, exited: 1 }
      : { total: 12, running: 11, unhealthy: 1, exited: 0 },
  };
}

function svc(id: string, name: string, icon: string, health: ServiceStatus["health"], stats: ServiceStatus["stats"], issues: ServiceStatus["issues"] = []): ServiceStatus {
  return { id, name, icon, health, stats, issues, responseMs: Math.floor(20 + Math.random() * 180) };
}

function makeServices(seed: number): ServiceStatus[] {
  const queueA = Math.floor(jitter(seed === 1 ? 6 : 3, 0.5));
  const queueB = Math.floor(jitter(seed === 1 ? 2 : 4, 0.5));
  return [
    svc("sonarr", "Sonarr", "tv", "up", [
      { label: "Queue", value: `${queueA}` },
      { label: "Missing", value: seed === 1 ? "284" : "97" },
      { label: "Last RSS", value: "2 min ago" },
    ], queueA > 5 ? [{ level: "warning", message: `Queue building up (${queueA} items)` }] : []),
    svc("radarr", "Radarr", "film", "up", [
      { label: "Queue", value: `${queueB}` },
      { label: "Missing", value: seed === 1 ? "53" : "21" },
      { label: "Last RSS", value: "4 min ago" },
    ]),
    svc("prowlarr", "Prowlarr", "search", seed === 2 ? "degraded" : "up", [
      { label: "Indexers", value: seed === 2 ? "11 / 14 ok" : "14 / 14 ok" },
      { label: "Apps synced", value: "4" },
    ], seed === 2 ? [{ level: "warning", message: "3 indexers failing (Cloudflare challenge)" }] : []),
    svc("qbittorrent", "qBittorrent", "download", "up", [
      { label: "Active", value: seed === 1 ? "4 ↓ / 22 ⇡" : "2 ↓ / 18 ⇡" },
      { label: "Speed", value: seed === 1 ? "38.2 MB/s ↓" : "12.4 MB/s ↓" },
      { label: "Free", value: seed === 1 ? "1.62 TB" : "612 GB" },
    ]),
    svc("jellyfin", "Jellyfin", "play-circle", "up", [
      { label: "Streams", value: seed === 1 ? "2 (1 transcode)" : "1 (direct)" },
      { label: "Last scan", value: seed === 1 ? "1h ago" : "6h ago" },
      { label: "Version", value: "10.10.3" },
    ]),
    svc("jellyseerr", "Jellyseerr", "inbox", "up", [
      { label: "Pending", value: seed === 1 ? "3" : "0" },
      { label: "Failed", value: "0" },
    ]),
    svc("declutarr", "Declutarr", "trash-2", "up", [
      { label: "Last run", value: "23 min ago" },
      { label: "Removed", value: seed === 1 ? "7 items" : "2 items" },
    ]),
    svc("flaresolverr", "Flaresolverr", "shield", "up", [
      { label: "Version", value: "3.3.21" },
      { label: "Sessions", value: "1" },
    ]),
    svc("portainer", "Portainer", "boxes", "up", [
      { label: "Endpoints", value: "1" },
      { label: "Containers", value: seed === 1 ? "13 up / 1 stopped" : "11 up / 1 unhealthy" },
    ], seed === 2 ? [{ level: "error", message: "Container 'bazarr' marked unhealthy" }] : []),
    svc("watchtower", "Watchtower", "refresh-cw", "up", [
      { label: "Last scan", value: "3h ago" },
      { label: "Updates", value: seed === 1 ? "0 pending" : "2 pending" },
    ]),
    svc("cloudflared", "Cloudflared", "cloud", "up", [
      { label: "Tunnel", value: "connected" },
      { label: "Connectors", value: "4" },
    ]),
  ];
}

export function buildDemoSnapshot(): DashboardSnapshot {
  const servers: ServerSnapshot[] = [
    { id: "alpha", name: "Server Alpha", reachable: true, host: makeHost(1), services: makeServices(1) },
    { id: "bravo", name: "Server Bravo", reachable: true, host: makeHost(2), services: makeServices(2) },
  ];
  return { generatedAt: new Date().toISOString(), demo: true, servers };
}

const sampleLogs: Omit<LogEvent, "id" | "ts">[] = [
  { serverId: "bravo", serviceId: "portainer", level: "error", message: "Container 'bazarr' marked unhealthy (healthcheck timeout)" },
  { serverId: "bravo", serviceId: "prowlarr", level: "warning", message: "Indexer 'TorrentLeech' failed: Cloudflare challenge" },
  { serverId: "alpha", serviceId: "sonarr", level: "warning", message: "Queue grew past threshold (6 items)" },
  { serverId: "alpha", serviceId: "watchtower", level: "info", message: "Scanned 14 containers, 0 updates pending" },
  { serverId: "alpha", serviceId: "jellyfin", level: "info", message: "Library scan completed (Movies: +12, Shows: +3 episodes)" },
  { serverId: "bravo", serviceId: "qbittorrent", level: "info", message: "Reannounced 4 stalled torrents" },
  { serverId: "alpha", serviceId: "declutarr", level: "info", message: "Removed 7 stale items from queue" },
];

export function buildDemoLogs(): LogEvent[] {
  const now = Date.now();
  return sampleLogs.map((e, i) => ({
    ...e,
    id: `demo-${i}`,
    ts: new Date(now - i * 1000 * 60 * (7 + i * 3)).toISOString(),
  }));
}
