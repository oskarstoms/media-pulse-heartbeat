import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import * as React from "react";

import { getConfigPublic, updateServiceConfig } from "@/server-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_app/settings")({ component: SettingsPage });

interface CfgResp {
  authed: true;
  demo: boolean;
  servers: {
    id: string;
    name: string;
    glancesUrl: string | null;
    services: {
      type: string;
      name: string | null;
      baseUrl: string;
      hasApiKey: boolean;
      hasCredentials: boolean;
    }[];
  }[];
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
          Service names, addresses, and credentials are saved to the mounted config file.
        </p>
      </div>
      {cfg.demo && (
        <Card className="border-amber-500/30">
          <CardHeader>
            <CardTitle className="text-base">Demo mode</CardTitle>
            <CardDescription>Settings are read-only while mock data is enabled.</CardDescription>
          </CardHeader>
        </Card>
      )}
      {cfg.servers.map((server) => (
        <Card key={server.id}>
          <CardHeader>
            <CardTitle className="text-base">
              {server.name} <span className="text-xs font-normal text-muted-foreground">({server.id})</span>
            </CardTitle>
            {server.glancesUrl && <CardDescription>Glances: {server.glancesUrl}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-3">
            {server.services.length === 0 && <p className="text-sm text-muted-foreground">No services configured.</p>}
            {server.services.map((service) => (
              <ServiceEditor key={service.type} serverId={server.id} service={service} disabled={cfg.demo} />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ServiceEditor({
  serverId,
  service,
  disabled,
}: {
  serverId: string;
  service: CfgResp["servers"][number]["services"][number];
  disabled: boolean;
}) {
  const qc = useQueryClient();
  const [name, setName] = React.useState(service.name ?? "");
  const [baseUrl, setBaseUrl] = React.useState(service.baseUrl);
  const [apiKey, setApiKey] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const mut = useMutation({
    mutationFn: () => updateServiceConfig({
      data: {
        serverId,
        type: service.type,
        name,
        baseUrl,
        apiKey,
        username,
        password,
      },
    }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["cfg"] }),
        qc.invalidateQueries({ queryKey: ["snapshot"] }),
      ]);
      setApiKey("");
      setPassword("");
    },
  });
  const configured = service.hasApiKey || service.hasCredentials || noAuthNeeded(service.type);
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{service.name || service.type}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{service.type}</span>
        </div>
        {configured ? (
          <Badge variant="outline">{noAuthNeeded(service.type) ? "no credentials needed" : "configured"}</Badge>
        ) : (
          <Badge variant="outline" className="border-amber-500/40 text-amber-600">not configured</Badge>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_1.6fr]">
        <Field label="Service name">
          <Input value={name} placeholder={service.type} disabled={disabled} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Address">
          <Input value={baseUrl} disabled={disabled} onChange={(e) => setBaseUrl(e.target.value)} />
        </Field>
        <Field label="API key">
          <Input
            value={apiKey}
            placeholder={service.hasApiKey ? "saved - type to replace" : "not configured"}
            disabled={disabled || noAuthNeeded(service.type)}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Username">
            <Input
              value={username}
              placeholder={service.hasCredentials ? "saved" : "not configured"}
              disabled={disabled || noAuthNeeded(service.type)}
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={password}
              placeholder={service.hasCredentials ? "saved - type to replace" : "not configured"}
              disabled={disabled || noAuthNeeded(service.type)}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-3">
        {mut.data?.authed && !mut.data.ok && <span className="text-xs text-rose-500">{mut.data.error}</span>}
        {mut.data?.authed && mut.data.ok && <span className="text-xs text-emerald-500">Saved</span>}
        <Button size="sm" disabled={disabled || mut.isPending} onClick={() => mut.mutate()}>
          <Save className="h-4 w-4" /> Save
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1 text-xs text-muted-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}

function noAuthNeeded(type: string): boolean {
  return ["flaresolverr", "watchtower", "cloudflared", "declutarr"].includes(type);
}
