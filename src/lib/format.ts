import type { Health } from "@/lib/types";

export function healthColor(h: Health): string {
  switch (h) {
    case "up": return "bg-emerald-500";
    case "degraded": return "bg-amber-500";
    case "down": return "bg-rose-500";
    default: return "bg-zinc-500";
  }
}

export function healthLabel(h: Health): string {
  return { up: "Up", degraded: "Degraded", down: "Down", unknown: "Unknown" }[h];
}

export function formatUptime(s: number): string {
  if (!s) return "—";
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
}

export function formatBytes(gb: number): string {
  if (gb >= 1000) return `${(gb / 1024).toFixed(1)} TB`;
  return `${gb.toFixed(0)} GB`;
}
