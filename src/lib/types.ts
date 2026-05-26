export type Health = "up" | "degraded" | "down" | "unknown";

export interface ServiceIssue {
  level: "warning" | "error";
  message: string;
}

export interface ServiceStatus {
  /** stable id, e.g. "sonarr" */
  id: string;
  /** display name, e.g. "Sonarr" */
  name: string;
  /** icon key (lucide-style) */
  icon: string;
  health: Health;
  /** key/value lines shown on the service card */
  stats: { label: string; value: string }[];
  /** active problems aggregated into the top error strip */
  issues: ServiceIssue[];
  /** ms */
  responseMs?: number;
  uptimeSeconds?: number;
  container?: {
    name: string;
    state: string;
    status: string;
  };
}

export interface HostStats {
  uptimeSeconds: number;
  rebootRequired?: boolean | null;
  cpuPercent: number;
  memUsedGb: number;
  memTotalGb: number;
  swapPercent: number;
  loadAvg: [number, number, number];
  disks: { mount: string; usedGb: number; totalGb: number }[];
  net: { rxMbps: number; txMbps: number };
  containers: { total: number; running: number; unhealthy: number; exited: number };
}

export interface ServerSnapshot {
  id: string;
  name: string;
  reachable: boolean;
  host: HostStats | null;
  services: ServiceStatus[];
}

export interface DashboardSnapshot {
  generatedAt: string;
  demo: boolean;
  servers: ServerSnapshot[];
}

export interface LogEvent {
  id: string;
  ts: string;
  serverId: string;
  serviceId: string;
  level: "info" | "warning" | "error";
  message: string;
}
