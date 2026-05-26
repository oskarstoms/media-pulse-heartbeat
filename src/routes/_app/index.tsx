import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Cpu, HardDrive, MemoryStick, Network, ServerIcon } from "lucide-react";

import { getSnapshot } from "@/server-fns";
import type { DashboardSnapshot, ServerSnapshot, ServiceStatus } from "@/lib/types";
import { healthColor, healthLabel, formatUptime, formatBytes } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_app/")({
  component: Overview,
});

function Overview() {
  const q = useQuery({
    queryKey: ["snapshot"],
    queryFn: () => getSnapshot() as Promise<{ authed: true; snapshot: DashboardSnapshot } | { authed: false }>,
    refetchInterval: 15_000,
  });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading snapshot…</p>;
  if (!q.data || !q.data.authed) return <p className="text-sm text-rose-500">Not authorized.</p>;
  const snap = q.data.snapshot;

  const allIssues = snap.servers.flatMap((s) =>
    s.services.flatMap((sv) => sv.issues.map((i) => ({ ...i, server: s.name, service: sv.name }))),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-xs text-muted-foreground">
          Updated {new Date(snap.generatedAt).toLocaleTimeString()}
        </p>
      </div>

      {allIssues.length > 0 ? (
        <Card className="border-amber-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              {allIssues.length} active {allIssues.length === 1 ? "issue" : "issues"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {allIssues.map((i, idx) => (
              <div key={idx} className="flex items-start gap-2 text-sm">
                <span className={`mt-1.5 h-1.5 w-1.5 rounded-full ${i.level === "error" ? "bg-rose-500" : "bg-amber-500"}`} />
                <span className="text-muted-foreground">
                  <span className="font-medium text-foreground">{i.server} · {i.service}</span> — {i.message}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="flex items-center gap-2 py-4 text-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            All systems nominal across {snap.servers.length} server{snap.servers.length === 1 ? "" : "s"}.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {snap.servers.map((s) => <ServerBlock key={s.id} server={s} />)}
      </div>
    </div>
  );
}

function ServerBlock({ server }: { server: ServerSnapshot }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <ServerIcon className="h-4 w-4 text-muted-foreground" />
            {server.name}
          </span>
          <Link to="/server/$id" params={{ id: server.id }} className="text-xs font-normal text-muted-foreground hover:underline">
            Details →
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {server.host && <HostTiles host={server.host} />}
        <div className="grid gap-2 sm:grid-cols-2">
          {server.services.map((sv) => <ServiceMini key={sv.id} svc={sv} />)}
        </div>
      </CardContent>
    </Card>
  );
}

function HostTiles({ host }: { host: NonNullable<ServerSnapshot["host"]> }) {
  const memPct = host.memTotalGb ? (host.memUsedGb / host.memTotalGb) * 100 : 0;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Tile icon={<Cpu className="h-3.5 w-3.5" />} label="CPU" value={`${host.cpuPercent.toFixed(0)}%`} progress={host.cpuPercent} />
      <Tile icon={<MemoryStick className="h-3.5 w-3.5" />} label="Memory" value={`${host.memUsedGb}/${host.memTotalGb} GB`} progress={memPct} />
      <Tile icon={<HardDrive className="h-3.5 w-3.5" />} label="Uptime" value={formatUptime(host.uptimeSeconds)} />
      <Tile icon={<Network className="h-3.5 w-3.5" />} label="Network" value={`${host.net.rxMbps.toFixed(0)}↓ / ${host.net.txMbps.toFixed(0)}↑ Mbps`} />
      <div className="col-span-2 sm:col-span-4 space-y-1">
        {host.disks.map((d) => (
          <div key={d.mount} className="flex items-center gap-2 text-xs">
            <span className="w-32 truncate text-muted-foreground">{d.mount}</span>
            <Progress value={(d.usedGb / d.totalGb) * 100} className="h-1.5 flex-1" />
            <span className="w-28 text-right text-muted-foreground">{formatBytes(d.usedGb)} / {formatBytes(d.totalGb)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Tile({ icon, label, value, progress }: { icon: React.ReactNode; label: string; value: string; progress?: number }) {
  return (
    <div className="rounded-lg border bg-card p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}{label}
      </div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
      {typeof progress === "number" && <Progress value={progress} className="mt-1.5 h-1" />}
    </div>
  );
}

function ServiceMini({ svc }: { svc: ServiceStatus }) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-card px-3 py-2">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${healthColor(svc.health)}`} />
        <span className="text-sm font-medium">{svc.name}</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {svc.stats[0] && <span>{svc.stats[0].value}</span>}
        {svc.issues.length > 0 && (
          <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">
            {svc.issues.length}
          </Badge>
        )}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _h = healthLabel; // suppress unused warning while keeping export usable
