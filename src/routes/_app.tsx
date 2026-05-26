import { Link, Outlet, redirect, createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Activity, FileText, Settings as SettingsIcon, LayoutDashboard, LogOut } from "lucide-react";

import { getAuthState, logout } from "@/server-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const state = await getAuthState();
    if (!state.authed) throw redirect({ to: "/login" });
  },
  component: AppLayout,
});

function AppLayout() {
  const router = useRouter();
  const auth = useQuery({ queryKey: ["auth"], queryFn: () => getAuthState() });
  const demo = auth.data?.demo ?? false;
  const logoutMut = useMutation({
    mutationFn: () => logout(),
    onSuccess: () => router.navigate({ to: "/login" }),
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
          <div className="flex items-center gap-2 font-semibold">
            <Activity className="h-5 w-5 text-emerald-500" />
            <span>Homelab</span>
          </div>
          <nav className="flex items-center gap-1 text-sm">
            <NavItem to="/" icon={<LayoutDashboard className="h-4 w-4" />} label="Overview" exact />
            <NavItem to="/logs" icon={<FileText className="h-4 w-4" />} label="Logs" />
            <NavItem to="/settings" icon={<SettingsIcon className="h-4 w-4" />} label="Settings" />
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {demo && (
              <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">
                Demo mode
              </Badge>
            )}
            {!demo && (
              <Button size="sm" variant="ghost" onClick={() => logoutMut.mutate(undefined)}>
                <LogOut className="h-4 w-4" /> Logout
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, icon, label, exact }: { to: string; icon: React.ReactNode; label: string; exact?: boolean }) {
  return (
    <Link
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      to={to as any}
      className="flex items-center gap-2 rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&.active]:bg-accent [&.active]:text-foreground"
      activeOptions={{ exact: !!exact }}
    >
      {icon}
      {label}
    </Link>
  );
}
