import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getLogs } from "@/server-fns";
import type { LogEvent } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_app/logs")({ component: LogsPage });

function LogsPage() {
  const q = useQuery({
    queryKey: ["logs"],
    queryFn: () => getLogs() as Promise<{ authed: true; logs: LogEvent[] } | { authed: false }>,
    refetchInterval: 30_000,
  });
  if (!q.data || !q.data.authed) return null;
  return (
    <Card>
      <CardHeader><CardTitle>Recent events</CardTitle></CardHeader>
      <CardContent className="divide-y">
        {q.data.logs.map((l) => (
          <div key={l.id} className="flex items-start gap-3 py-2 text-sm">
            <span className="w-32 shrink-0 text-xs text-muted-foreground">{new Date(l.ts).toLocaleString()}</span>
            <span className={
              l.level === "error" ? "w-16 text-xs font-medium text-rose-500" :
              l.level === "warning" ? "w-16 text-xs font-medium text-amber-500" :
              "w-16 text-xs font-medium text-muted-foreground"
            }>{l.level}</span>
            <span className="w-32 shrink-0 text-xs text-muted-foreground">{l.serverId} · {l.serviceId}</span>
            <span className="flex-1">{l.message}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
