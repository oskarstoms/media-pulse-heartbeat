import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Activity } from "lucide-react";

import { getAuthState, login } from "@/server-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const s = await getAuthState();
    if (s.authed) throw redirect({ to: "/" });
  },
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const mut = useMutation({
    mutationFn: (vars: { username: string; password: string }) =>
      login({ data: vars }) as Promise<{ ok: boolean; error?: string }>,
    onSuccess: (res) => {
      if (res.ok) router.navigate({ to: "/" });
    },
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
            <Activity className="h-5 w-5 text-emerald-500" />
          </div>
          <CardTitle className="mt-2">Homelab Dashboard</CardTitle>
          <CardDescription>Sign in to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); mut.mutate({ username, password }); }}
          >
            <div className="space-y-2">
              <Label htmlFor="user">Username</Label>
              <Input
                id="user"
                type="text"
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw">Password</Label>
              <Input
                id="pw"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            {mut.data && !mut.data.ok && (
              <p className="text-sm text-rose-500">{mut.data.error}</p>
            )}
            <Button type="submit" className="w-full" disabled={mut.isPending || !username || !password}>
              {mut.isPending ? "Signing in…" : "Sign in"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Demo credentials: <code className="rounded bg-muted px-1">admin</code> / <code className="rounded bg-muted px-1">demo</code>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
