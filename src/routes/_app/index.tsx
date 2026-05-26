import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Boxes, Clock, Cpu, HardDrive, MemoryStick, Network, RotateCw, ServerIcon } from "lucide-react";

import { getSnapshot } from "@/server-fns";
import type { DashboardSnapshot, ServerSnapshot, ServiceIssue, ServiceStatus } from "@/lib/types";
import { healthColor, formatUptime, formatBytes } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
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

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading snapshot...</p>;
  if (!q.data || !q.data.authed) return <p className="text-sm text-rose-500">Not authorized.</p>;
  const snap = q.data.snapshot;
  const allIssues = snap.servers.flatMap((server) =>
    server.services.flatMap((service) =>
      service.issues.map((issue) => ({ ...issue, server: server.name, service: service.name })),
    ),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-xs text-muted-foreground">Updated {new Date(snap.generatedAt).toLocaleTimeString()}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {snap.servers.map((server) => <ServerBlock key={server.id} server={server} />)}
      </div>

      <IssuesLog issues={allIssues} serverCount={snap.servers.length} />
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
      <CardContent className="space-y-5">
        <SystemHealth server={server} />
        <div className="grid gap-2 sm:grid-cols-2">
          {server.services.map((service) => <ServiceMini key={service.id} svc={service} />)}
        </div>
      </CardContent>
    </Card>
  );
}

function SystemHealth({ server }: { server: ServerSnapshot }) {
  const host = server.host;
  if (!host) {
    const running = server.services.filter((s) => s.container?.state === "running").length;
    const total = server.services.filter((s) => s.container).length;
    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">System health</h2>
          <Badge variant="outline" className="border-amber-500/40 text-amber-600">host metrics not configured</Badge>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Tile icon={<Boxes className="h-3.5 w-3.5" />} label="Containers" value={total ? `${running}/${total} running` : "unknown"} />
          <Tile icon={<RotateCw className="h-3.5 w-3.5" />} label="Restart" value="unknown" />
          <Tile icon={<Clock className="h-3.5 w-3.5" />} label="Uptime" value="unknown" />
        </div>
      </section>
    );
  }
  const memPct = host.memTotalGb ? (host.memUsedGb / host.memTotalGb) * 100 : 0;
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">System health</h2>
        <Badge
          variant="outline"
          className={
            host.rebootRequired
              ? "border-amber-500/40 text-amber-600"
              : "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
          }
        >
          {host.rebootRequired ? "restart required" : "restart ok"}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile icon={<Cpu className="h-3.5 w-3.5" />} label="CPU" value={`${host.cpuPercent.toFixed(0)}%`} progress={host.cpuPercent} />
        <Tile icon={<MemoryStick className="h-3.5 w-3.5" />} label="Memory" value={`${host.memUsedGb}/${host.memTotalGb} GB`} progress={memPct} />
        <Tile icon={<Clock className="h-3.5 w-3.5" />} label="Uptime" value={formatUptime(host.uptimeSeconds)} />
        <Tile icon={<Network className="h-3.5 w-3.5" />} label="Network" value={`${host.net.rxMbps.toFixed(0)}↓ / ${host.net.txMbps.toFixed(0)}↑ Mbps`} />
        <Tile icon={<Boxes className="h-3.5 w-3.5" />} label="Containers" value={`${host.containers.running}/${host.containers.total} running`} />
      </div>
      <div className="space-y-1">
        {host.disks.map((disk) => {
          const usedPct = disk.totalGb ? (disk.usedGb / disk.totalGb) * 100 : 0;
          const freeGb = Math.max(disk.totalGb - disk.usedGb, 0);
          return (
            <div key={disk.mount} className="flex items-center gap-2 text-xs">
              <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="w-28 truncate text-muted-foreground">{disk.mount}</span>
              <Progress value={usedPct} className="h-1.5 flex-1" />
              <span className="w-32 text-right text-muted-foreground">{formatBytes(freeGb)} free</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Tile({ icon, label, value, progress }: { icon: React.ReactNode; label: string; value: string; progress?: number }) {
  return (
    <div className="rounded-md border bg-card p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground">
        {icon}{label}
      </div>
      <div className="mt-0.5 truncate text-sm font-medium">{value}</div>
      {typeof progress === "number" && <Progress value={progress} className="mt-1.5 h-1" />}
    </div>
  );
}

function ServiceMini({ svc }: { svc: ServiceStatus }) {
  const issueCount = svc.issues.length;
  return (
    <div className="flex min-h-16 items-center justify-between gap-3 rounded-md border bg-card px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${healthColor(svc.health)}`} />
          <span className="truncate text-sm font-medium">{svc.name}</span>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {svc.uptimeSeconds && <span>up {formatUptime(svc.uptimeSeconds)}</span>}
          {svc.stats.slice(0, 2).map((stat) => <span key={stat.label}>{stat.label}: {stat.value}</span>)}
        </div>
      </div>
      {issueCount > 0 && (
        <IssueBadge count={issueCount} issues={svc.issues} />
      )}
    </div>
  );
}

function IssueBadge({ count, issues }: { count: number; issues: ServiceIssue[] }) {
  return (
    <HoverCard openDelay={120}>
      <HoverCardTrigger asChild>
        <Badge variant="outline" className="shrink-0 cursor-help border-amber-500/40 text-amber-600 dark:text-amber-400">
          {count}
        </Badge>
      </HoverCardTrigger>
      <HoverCardContent className="w-80">
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Fault summary</h3>
          {issues.map((issue, idx) => (
            <div key={idx} className="flex gap-2 text-sm">
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${issue.level === "error" ? "bg-rose-500" : "bg-amber-500"}`} />
              <span className="text-muted-foreground">{issue.message}</span>
            </div>
          ))}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function IssuesLog({
  issues,
  serverCount,
}: {
  issues: Array<ServiceIssue & { server: string; service: string }>;
  serverCount: number;
}) {
  if (issues.length === 0) {
    return (
      <Card className="border-emerald-500/20 bg-emerald-500/5">
        <CardContent className="flex items-center gap-2 py-4 text-sm">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          All systems nominal across {serverCount} server{serverCount === 1 ? "" : "s"}.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="border-amber-500/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Issues and recent events
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {issues.map((issue, idx) => (
          <div key={idx} className="flex items-start gap-2 text-sm">
            <span className={`mt-1.5 h-1.5 w-1.5 rounded-full ${issue.level === "error" ? "bg-rose-500" : "bg-amber-500"}`} />
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground">{issue.server} · {issue.service}</span> — {issue.message}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
