import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getConfigPublic } from "@/server-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/settings")({ component: SettingsPage });

interface CfgResp {
  authed: true;
  demo: boolean;
  servers: { id: string; name: string; glancesUrl: string | null; services: { type: string; baseUrl: string; hasApiKey: boolean; hasCredentials: boolean }[] }[];
}

function SettingsPage() {
  const q = useQuery({
    queryKey: ["cfg"],
    queryFn: () => getConfigPublic() as Promise<CfgResp | { authed: false }>,
  });
  if (!q.data || !q.data.authed) return null;
  const cfg = q.data;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Read-only view of loaded configuration. Edit <code className="rounded bg-muted px-1">config.json</code> and restart the container to change.
        </p>
      </div>
      {cfg.demo && (
        <Card className="border-amber-500/30">
          <CardHeader>
            <CardTitle className="text-base">Demo mode</CardTitle>
            <CardDescription>
              Mock data is enabled with <code>DEMO=true</code>. Mount <code>config.json</code> at <code>/app/config.json</code> for real servers.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
      {cfg.servers.map((s) => (
        <Card key={s.id}>
          <CardHeader>
            <CardTitle className="text-base">{s.name} <span className="text-xs font-normal text-muted-foreground">({s.id})</span></CardTitle>
            {s.glancesUrl && <CardDescription>Glances: {s.glancesUrl}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-1.5">
            {s.services.length === 0 && <p className="text-sm text-muted-foreground">No services configured.</p>}
            {s.services.map((sv) => (
              <div key={sv.type} className="flex items-center gap-3 text-sm">
                <span className="w-32 font-medium">{sv.type}</span>
                <span className="flex-1 truncate text-muted-foreground">{sv.baseUrl}</span>
                {sv.hasApiKey ? (
                  <Badge variant="outline">API key</Badge>
                ) : sv.hasCredentials ? (
                  <Badge variant="outline">credentials</Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-500/40 text-amber-600">no auth</Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
