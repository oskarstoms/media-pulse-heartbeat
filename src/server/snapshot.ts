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

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  const r = await safeFetch(url, init);
  if (!r || !r.ok) return null;
  try { return (await r.json()) as T; } catch { return null; }
}

async function fetchArrService(s: ServiceCfg, apiPath: string): Promise<ServiceStatus> {
  const baseId = s.type;
  const name = baseId[0].toUpperCase() + baseId.slice(1);
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
    id: "jellyfin", name: "Jellyfin", icon: "play-circle",
    health: reachable ? "up" : "down",
    stats: [{ label: "Streams", value: reachable ? String(sessions?.length ?? 0) : "?" }],
    issues: [],
  };
}

async function fetchFlaresolverr(s: ServiceCfg): Promise<ServiceStatus> {
  const r = await safeFetch(`${s.baseUrl}/health`);
  const ok = !!r && r.ok;
  return {
    id: "flaresolverr", name: "Flaresolverr", icon: "shield",
    health: ok ? "up" : "down",
    stats: [{ label: "Endpoint", value: ok ? "responding" : "no response" }],
    issues: ok ? [] : [{ level: "error", message: "Flaresolverr did not respond" }],
  };
}

async function fetchGeneric(s: ServiceCfg): Promise<ServiceStatus> {
  const r = await safeFetch(s.baseUrl);
  const ok = !!r && (r.ok || r.status === 401);
  return {
    id: s.type, name: s.type, icon: "box",
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
    case "flaresolverr": return fetchFlaresolverr(s);
    default: return fetchGeneric(s);
  }
}

interface GlancesData {
  cpu?: { total?: number };
  mem?: { used?: number; total?: number; percent?: number };
  memswap?: { percent?: number };
  load?: { min1?: number; min5?: number; min15?: number };
  fs?: Array<{ mnt_point: string; used: number; size: number }>;
  network?: Array<{ rx: number; tx: number }>;
  uptime?: number | string;
}

async function fetchHost(glancesUrl: string): Promise<HostStats | null> {
  const data = await fetchJson<GlancesData>(`${glancesUrl}/all`);
  if (!data) return null;
  const totalB = data.mem?.total ?? 0;
  const usedB = data.mem?.used ?? 0;
  return {
    uptimeSeconds: typeof data.uptime === "number" ? data.uptime : 0,
    cpuPercent: +(data.cpu?.total ?? 0).toFixed(1),
    memUsedGb: +(usedB / 1024 ** 3).toFixed(1),
    memTotalGb: +(totalB / 1024 ** 3).toFixed(1),
    swapPercent: +(data.memswap?.percent ?? 0).toFixed(1),
    loadAvg: [data.load?.min1 ?? 0, data.load?.min5 ?? 0, data.load?.min15 ?? 0],
    disks: (data.fs ?? []).slice(0, 5).map((f) => ({
      mount: f.mnt_point,
      usedGb: +(f.used / 1024 ** 3).toFixed(1),
      totalGb: +(f.size / 1024 ** 3).toFixed(1),
    })),
    net: { rxMbps: 0, txMbps: 0 },
    containers: { total: 0, running: 0, unhealthy: 0, exited: 0 },
  };
}

async function fetchServer(cfg: ServerCfg): Promise<ServerSnapshot> {
  const [host, services] = await Promise.all([
    cfg.glancesUrl ? fetchHost(cfg.glancesUrl) : Promise.resolve(null),
    Promise.all(cfg.services.map(fetchService)),
  ]);
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
