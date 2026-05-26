import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { getSnapshot } from "@/server-fns";
import type { DashboardSnapshot } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { healthColor, healthLabel } from "@/lib/format";

export const Route = createFileRoute("/_app/server/$id")({
  component: ServerDetail,
});

function ServerDetail() {
  const { id } = Route.useParams();
  const q = useQuery({
    queryKey: ["snapshot"],
    queryFn: () => getSnapshot() as Promise<{ authed: true; snapshot: DashboardSnapshot } | { authed: false }>,
    refetchInterval: 15_000,
  });
  if (!q.data || !q.data.authed) return null;
  const server = q.data.snapshot.servers.find((s) => s.id === id);
  if (!server) return <p>Server not found.</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{server.name}</h1>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {server.services.map((sv) => (
          <Card key={sv.id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${healthColor(sv.health)}`} />
                  {sv.name}
                </span>
                <Badge variant="outline" className="text-xs">{healthLabel(sv.health)}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              {sv.stats.map((s) => (
                <div key={s.label} className="flex justify-between">
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className="font-medium">{s.value}</span>
                </div>
              ))}
              {sv.issues.length > 0 && (
                <div className="mt-2 space-y-1 border-t pt-2">
                  {sv.issues.map((i, idx) => (
                    <p key={idx} className={i.level === "error" ? "text-rose-500" : "text-amber-500"}>
                      {i.message}
                    </p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
