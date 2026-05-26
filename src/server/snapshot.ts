// Snapshot collector. In demo mode, returns mock data immediately.
// In configured mode, fans out to each server's services in parallel.
//
// NOTE: real fetchers below are minimal and conservative. Expand as needed.

import type { DashboardSnapshot, ServerSnapshot, ServiceStatus, HostStats } from "../lib/types";
import { buildDemoSnapshot } from "../lib/demo-data";
import { getConfig, type ServerCfg, type ServiceCfg } from "./config";

async function safeFetch(url: string, init?: RequestInit, timeoutMs = 4000): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function serviceName(type: string): string {
  const names: Record<string, string> = {
    qbittorrent: "qBittorrent",
    jellyfin: "Jellyfin",
    jellyseerr: "Jellyseerr",
    flaresolverr: "Flaresolverr",
    portainer: "Portainer",
    watchtower: "Watchtower",
    cloudflared: "Cloudflared",
    declutarr: "Declutarr",
    sonarr: "Sonarr",
    radarr: "Radarr",
    prowlarr: "Prowlarr",
  };
  return names[type] ?? type;
}

function displayName(s: ServiceCfg): string {
  return s.name?.trim() || serviceName(s.type);
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  const r = await safeFetch(url, init);
  if (!r || !r.ok) return null;
  try { return (await r.json()) as T; } catch { return null; }
}

async function fetchArrService(s: ServiceCfg, apiPath: string): Promise<ServiceStatus> {
  const baseId = s.type;
  const name = displayName(s);
  const headers = { "X-Api-Key": s.apiKey ?? "" };
  const [queue, health] = await Promise.all([
    fetchJson<{ totalCount?: number; records?: unknown[] }>(`${s.baseUrl}${apiPath}/queue?pageSize=1`, { headers }),
    fetchJson<Array<{ type: string; message: string }>>(`${s.baseUrl}${apiPath}/health`, { headers }),
  ]);
  const reachable = queue !== null || health !== null;
  const issues = (health ?? []).map((h) => ({
    level: h.type === "error" ? ("error" as const) : ("warning" as const),
    message: h.message,
  }));
  return {
    id: s.type,
    name,
    icon: s.type === "sonarr" ? "tv" : "film",
    health: !reachable ? "down" : issues.some((i) => i.level === "error") ? "degraded" : "up",
    stats: [
      { label: "Queue", value: String(queue?.totalCount ?? "?") },
      { label: "Health", value: issues.length ? `${issues.length} issue(s)` : "ok" },
    ],
    issues,
  };
}

async function fetchJellyfin(s: ServiceCfg): Promise<ServiceStatus> {
  const sessions = await fetchJson<unknown[]>(`${s.baseUrl}/Sessions`, {
    headers: { "X-Emby-Token": s.apiKey ?? "" },
  });
  const reachable = sessions !== null;
  return {
    id: "jellyfin", name: displayName(s), icon: "play-circle",
    health: reachable ? "up" : "down",
    stats: [{ label: "Streams", value: reachable ? String(sessions?.length ?? 0) : "?" }],
    issues: [],
  };
}

async function fetchJellyseerr(s: ServiceCfg): Promise<ServiceStatus> {
  const status = await fetchJson<{ version?: string; commitTag?: string }>(`${s.baseUrl}/api/v1/status`, {
    headers: { "X-Api-Key": s.apiKey ?? "" },
  });
  const reachable = status !== null;
  return {
    id: "jellyseerr", name: displayName(s), icon: "ticket",
    health: reachable ? "up" : "down",
    stats: [{ label: "Version", value: status?.version ?? "?" }],
    issues: reachable ? [] : [{ level: "error", message: "Jellyseerr API did not respond" }],
  };
}

async function fetchQbittorrent(s: ServiceCfg): Promise<ServiceStatus> {
  if (!s.username || !s.password) {
    return {
      id: "qbittorrent", name: displayName(s), icon: "download", health: "unknown",
      stats: [{ label: "Auth", value: "missing credentials" }],
      issues: [{ level: "warning", message: "qBittorrent username/password are not configured" }],
    };
  }

  const body = new URLSearchParams({ username: s.username, password: s.password });
  const login = await safeFetch(`${s.baseUrl}/api/v2/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const cookie = login?.headers.get("set-cookie")?.split(";")[0];
  if (!login?.ok || !cookie) {
    return {
      id: "qbittorrent", name: displayName(s), icon: "download", health: "down",
      stats: [{ label: "Auth", value: "failed" }],
      issues: [{ level: "error", message: "qBittorrent login failed" }],
    };
  }

  const headers = { Cookie: cookie };
  const [transfer, torrents] = await Promise.all([
    fetchJson<{ dl_info_speed?: number; up_info_speed?: number }>(`${s.baseUrl}/api/v2/transfer/info`, { headers }),
    fetchJson<Array<{ state?: string }>>(`${s.baseUrl}/api/v2/torrents/info`, { headers }),
  ]);
  const active = (torrents ?? []).filter((t) => /(downloading|uploading|stalled|queued)/i.test(t.state ?? "")).length;
  return {
    id: "qbittorrent", name: displayName(s), icon: "download",
    health: transfer || torrents ? "up" : "degraded",
    stats: [
      { label: "Torrents", value: torrents ? String(torrents.length) : "?" },
      { label: "Active", value: torrents ? String(active) : "?" },
      { label: "Speed", value: `${formatRate(transfer?.dl_info_speed)}↓ / ${formatRate(transfer?.up_info_speed)}↑` },
    ],
    issues: transfer || torrents ? [] : [{ level: "warning", message: "qBittorrent logged in but status endpoints failed" }],
  };
}

async function fetchFlaresolverr(s: ServiceCfg): Promise<ServiceStatus> {
  const r = await safeFetch(`${s.baseUrl}/health`);
  const ok = !!r && r.ok;
  return {
    id: "flaresolverr", name: displayName(s), icon: "shield",
    health: ok ? "up" : "down",
    stats: [{ label: "Endpoint", value: ok ? "responding" : "no response" }],
    issues: ok ? [] : [{ level: "error", message: "Flaresolverr did not respond" }],
  };
}

async function fetchPortainer(s: ServiceCfg): Promise<ServiceStatus> {
  const headers = s.apiKey ? { "X-API-Key": s.apiKey } : undefined;
  const [status, endpoints] = await Promise.all([
    fetchJson<{ Version?: string; InstanceID?: string }>(`${s.baseUrl}/api/status`),
    fetchJson<Array<{ Id?: number; Name?: string; Status?: number }>>(`${s.baseUrl}/api/endpoints`, { headers }),
  ]);
  const reachable = status !== null || endpoints !== null;
  const down = (endpoints ?? []).filter((e) => e.Status && e.Status !== 1);
  return {
    id: "portainer", name: displayName(s), icon: "boxes",
    health: !reachable ? "down" : down.length ? "degraded" : "up",
    stats: [
      { label: "Version", value: status?.Version ?? "?" },
      { label: "Endpoints", value: endpoints ? String(endpoints.length) : "?" },
    ],
    issues: !reachable
      ? [{ level: "error", message: "Portainer API did not respond" }]
      : down.map((e) => ({ level: "warning" as const, message: `Endpoint ${e.Name ?? e.Id ?? "unknown"} is not healthy` })),
  };
}

async function fetchCloudflared(s: ServiceCfg): Promise<ServiceStatus> {
  const r = await safeFetch(`${s.baseUrl}/metrics`);
  const text = r?.ok ? await r.text() : "";
  const connected = Number(text.match(/cloudflared_tunnel_total_requests(?:\{[^}]*\})?\s+(\d+(?:\.\d+)?)/)?.[1] ?? NaN);
  const ok = !!r && r.ok;
  return {
    id: "cloudflared", name: displayName(s), icon: "cloud",
    health: ok ? "up" : "down",
    stats: [
      { label: "Metrics", value: ok ? "responding" : "no response" },
      { label: "Requests", value: Number.isFinite(connected) ? String(connected) : "?" },
    ],
    issues: ok ? [] : [{ level: "error", message: "Cloudflared metrics endpoint did not respond" }],
  };
}

async function fetchGeneric(s: ServiceCfg): Promise<ServiceStatus> {
  const r = await safeFetch(s.baseUrl);
  const ok = !!r && (r.ok || r.status === 401);
  return {
    id: s.type, name: displayName(s), icon: "box",
    health: ok ? "up" : "down",
    stats: [{ label: "Endpoint", value: ok ? "reachable" : "no response" }],
    issues: ok ? [] : [{ level: "error", message: `${s.type} not reachable` }],
  };
}

async function fetchService(s: ServiceCfg): Promise<ServiceStatus> {
  switch (s.type) {
    case "sonarr": return fetchArrService(s, "/api/v3");
    case "radarr": return fetchArrService(s, "/api/v3");
    case "prowlarr": return fetchArrService(s, "/api/v1");
    case "jellyfin": return fetchJellyfin(s);
    case "jellyseerr": return fetchJellyseerr(s);
    case "qbittorrent": return fetchQbittorrent(s);
    case "flaresolverr": return fetchFlaresolverr(s);
    case "portainer": return fetchPortainer(s);
    case "cloudflared": return fetchCloudflared(s);
    default: return fetchGeneric(s);
  }
}

interface GlancesData {
  cpu?: { total?: number };
  mem?: { used?: number; total?: number; percent?: number };
  memswap?: { percent?: number };
  load?: { min1?: number; min5?: number; min15?: number };
  fs?: Array<{ mnt_point: string; used: number; size: number }>;
  network?: Array<{ interface_name?: string; key?: string; rx?: number; tx?: number; cumulative_rx?: number; cumulative_tx?: number }>;
  docker?: Array<{ status?: string }>;
  containers?: Array<{ status?: string }>;
  uptime?: number | string;
}

interface PortainerEndpoint {
  Id?: number;
  Name?: string;
  Status?: number;
}

interface PortainerContainer {
  Names?: string[];
  State?: string;
  Status?: string;
  Created?: number;
}

interface ContainerSummary {
  name: string;
  state: string;
  status: string;
  uptimeSeconds?: number;
}

const previousNetwork = new Map<string, { ts: number; rx: number; tx: number }>();

function formatRate(bytesPerSecond: number | undefined): string {
  if (!bytesPerSecond || bytesPerSecond < 1) return "0 B/s";
  if (bytesPerSecond < 1024 ** 2) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSecond / 1024 ** 2).toFixed(1)} MB/s`;
}

function networkMbps(glancesUrl: string, network: GlancesData["network"]): HostStats["net"] {
  const totals = (network ?? [])
    .filter((n) => !["lo", "docker0"].includes(n.interface_name ?? n.key ?? ""))
    .reduce((acc, n) => ({
      rx: acc.rx + (n.cumulative_rx ?? n.rx ?? 0),
      tx: acc.tx + (n.cumulative_tx ?? n.tx ?? 0),
    }), { rx: 0, tx: 0 });
  const now = Date.now();
  const prev = previousNetwork.get(glancesUrl);
  previousNetwork.set(glancesUrl, { ts: now, ...totals });
  if (!prev || totals.rx < prev.rx || totals.tx < prev.tx) return { rxMbps: 0, txMbps: 0 };
  const seconds = Math.max((now - prev.ts) / 1000, 1);
  return {
    rxMbps: +(((totals.rx - prev.rx) * 8) / seconds / 1_000_000).toFixed(2),
    txMbps: +(((totals.tx - prev.tx) * 8) / seconds / 1_000_000).toFixed(2),
  };
}

function containerStats(data: GlancesData): HostStats["containers"] {
  const containers = data.docker ?? data.containers ?? [];
  return {
    total: containers.length,
    running: containers.filter((c) => (c.status ?? "").toLowerCase().includes("running")).length,
    unhealthy: containers.filter((c) => (c.status ?? "").toLowerCase().includes("unhealthy")).length,
    exited: containers.filter((c) => /(exited|dead|created)/i.test(c.status ?? "")).length,
  };
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function serviceAliases(type: string): string[] {
  const aliases: Record<string, string[]> = {
    declutarr: ["declutarr", "decluttarr"],
    qbittorrent: ["qbittorrent", "qbittorrentvpn"],
    cloudflared: ["cloudflared"],
  };
  return aliases[type] ?? [type];
}

function findContainer(type: string, containers: ContainerSummary[]): ContainerSummary | undefined {
  const aliases = serviceAliases(type).map(normalizeName);
  return containers.find((container) => {
    const name = normalizeName(container.name);
    return aliases.some((alias) => name.includes(alias) || alias.includes(name));
  });
}

async function fetchPortainerContainers(cfg: ServerCfg): Promise<ContainerSummary[]> {
  const portainer = cfg.services.find((s) => s.type === "portainer" && s.apiKey);
  if (!portainer) return [];
  const headers = { "X-API-Key": portainer.apiKey ?? "" };
  const endpoints = await fetchJson<PortainerEndpoint[]>(`${portainer.baseUrl}/api/endpoints`, { headers });
  const endpointId = endpoints?.find((e) => e.Status === 1)?.Id ?? endpoints?.[0]?.Id;
  if (!endpointId) return [];
  const containers = await fetchJson<PortainerContainer[]>(
    `${portainer.baseUrl}/api/endpoints/${endpointId}/docker/containers/json?all=true`,
    { headers },
  );
  const nowSeconds = Date.now() / 1000;
  return (containers ?? []).map((container) => {
    const name = (container.Names?.[0] ?? "unknown").replace(/^\//, "");
    const created = container.Created ?? 0;
    return {
      name,
      state: container.State ?? "unknown",
      status: container.Status ?? "unknown",
      uptimeSeconds: created > 0 ? Math.max(0, Math.floor(nowSeconds - created)) : undefined,
    };
  });
}

function withContainerFallback(service: ServiceStatus, cfg: ServiceCfg, containers: ContainerSummary[]): ServiceStatus {
  const container = findContainer(cfg.type, containers);
  if (!container) return service;
  const running = container.state === "running";
  const containerStatus = {
    name: container.name,
    state: container.state,
    status: container.status,
  };
  const stats = [
    ...service.stats.filter((s) => s.label !== "Container" && s.label !== "Uptime"),
    { label: "Container", value: container.status },
  ];
  if (container.uptimeSeconds) stats.push({ label: "Uptime", value: formatUptime(container.uptimeSeconds) });
  if (service.health === "down" && running) {
    return {
      ...service,
      health: "up",
      stats,
      issues: [],
      uptimeSeconds: container.uptimeSeconds,
      container: containerStatus,
    };
  }
  if (!running) {
    return {
      ...service,
      health: "down",
      stats,
      issues: [{ level: "error", message: `Container ${container.name} is ${container.status}` }],
      uptimeSeconds: container.uptimeSeconds,
      container: containerStatus,
    };
  }
  return {
    ...service,
    stats,
    uptimeSeconds: container.uptimeSeconds,
    container: containerStatus,
  };
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h`;
  return `${Math.floor(seconds / 60)}m`;
}

function parseUptimeSeconds(value: number | string | undefined): number {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const text = value.toLowerCase();
  const dayMatch = text.match(/(\d+)\s+day/);
  const timeMatch = text.match(/(\d{1,2}):(\d{2}):(\d{2})/);
  const days = dayMatch ? Number(dayMatch[1]) : 0;
  const hours = timeMatch ? Number(timeMatch[1]) : 0;
  const minutes = timeMatch ? Number(timeMatch[2]) : 0;
  const seconds = timeMatch ? Number(timeMatch[3]) : 0;
  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

function isUsefulMount(mount: string): boolean {
  if (!mount || !mount.startsWith("/")) return false;
  if (mount.startsWith("/etc/")) return false;
  if (mount.startsWith("/proc") || mount.startsWith("/sys") || mount.startsWith("/dev")) return false;
  if (mount.startsWith("/run") || mount.startsWith("/var/run")) return false;
  if (mount === "/boot" || mount.startsWith("/boot/")) return false;
  if (mount === "/host/boot" || mount.startsWith("/host/boot/")) return false;
  return true;
}

function displayMount(mount: string): string {
  if (mount === "/host") return "/";
  if (mount.startsWith("/host/")) return mount.slice("/host".length);
  return mount;
}

async function fetchHost(glancesUrl: string): Promise<HostStats | null> {
  const data = await fetchJson<GlancesData>(`${glancesUrl}/all`);
  if (!data) return null;
  const totalB = data.mem?.total ?? 0;
  const usedB = data.mem?.used ?? 0;
  return {
    uptimeSeconds: parseUptimeSeconds(data.uptime),
    rebootRequired: null,
    cpuPercent: +(data.cpu?.total ?? 0).toFixed(1),
    memUsedGb: +(usedB / 1024 ** 3).toFixed(1),
    memTotalGb: +(totalB / 1024 ** 3).toFixed(1),
    swapPercent: +(data.memswap?.percent ?? 0).toFixed(1),
    loadAvg: [data.load?.min1 ?? 0, data.load?.min5 ?? 0, data.load?.min15 ?? 0],
    disks: (data.fs ?? []).filter((f) => isUsefulMount(f.mnt_point)).slice(0, 5).map((f) => ({
      mount: displayMount(f.mnt_point),
      usedGb: +(f.used / 1024 ** 3).toFixed(1),
      totalGb: +(f.size / 1024 ** 3).toFixed(1),
    })),
    net: networkMbps(glancesUrl, data.network),
    containers: containerStats(data),
  };
}

async function fetchServer(cfg: ServerCfg): Promise<ServerSnapshot> {
  const [host, rawServices, containers] = await Promise.all([
    cfg.glancesUrl ? fetchHost(cfg.glancesUrl) : Promise.resolve(null),
    Promise.all(cfg.services.map(fetchService)),
    fetchPortainerContainers(cfg),
  ]);
  const services = rawServices.map((service, idx) => withContainerFallback(service, cfg.services[idx], containers));
  return {
    id: cfg.id,
    name: cfg.name,
    reachable: services.some((s) => s.health !== "down"),
    host,
    services,
  };
}

export async function buildSnapshot(): Promise<DashboardSnapshot> {
  const cfg = getConfig();
  if (cfg.demo) return buildDemoSnapshot();
  const servers = await Promise.all(cfg.servers.map(fetchServer));
  return { generatedAt: new Date().toISOString(), demo: false, servers };
}
