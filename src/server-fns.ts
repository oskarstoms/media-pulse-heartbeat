import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";

import { buildSnapshot } from "./server/snapshot";
import { buildDemoLogs } from "./lib/demo-data";
import type { LogEvent } from "./lib/types";
import { getConfig, getConfigPath, resetConfigCache } from "./server/config";
import { buildSetCookie, checkCredentials, COOKIE_NAME, makeSessionToken, parseCookie, verifySessionToken } from "./server/auth";

async function isAuthed(): Promise<boolean> {
  const cfg = getConfig();
  if (cfg.demo) return true; // demo mode: no auth required
  const req = getRequest();
  const cookie = req?.headers.get("cookie");
  const token = parseCookie(cookie, COOKIE_NAME);
  return await verifySessionToken(token);
}

export const getAuthState = createServerFn({ method: "GET" }).handler(async () => {
  const cfg = getConfig();
  return { demo: cfg.demo, authed: await isAuthed() };
});

export const getSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  if (!(await isAuthed())) return { authed: false as const };
  const snap = await buildSnapshot();
  return { authed: true as const, snapshot: snap };
});

export const getLogs = createServerFn({ method: "GET" }).handler(async () => {
  if (!(await isAuthed())) return { authed: false as const };
  const cfg = getConfig();
  if (cfg.demo) return { authed: true as const, logs: buildDemoLogs() };
  const snap = await buildSnapshot();
  const logs: LogEvent[] = snap.servers.flatMap((server) =>
    server.services.flatMap((service) =>
      service.issues.map((issue, idx) => ({
        id: `${server.id}-${service.id}-${idx}`,
        ts: snap.generatedAt,
        serverId: server.id,
        serviceId: service.id,
        level: issue.level,
        message: issue.message,
      })),
    ),
  );
  return { authed: true as const, logs };
});

export const getConfigPublic = createServerFn({ method: "GET" }).handler(async () => {
  if (!(await isAuthed())) return { authed: false as const };
  const cfg = getConfig();
  return {
    authed: true as const,
    demo: cfg.demo,
    servers: cfg.servers.map((s) => ({
      id: s.id,
      name: s.name,
      glancesUrl: s.glancesUrl ? maskUrl(s.glancesUrl) : null,
      services: s.services.map((sv) => ({
        type: sv.type,
        name: sv.name ?? null,
        baseUrl: maskUrl(sv.baseUrl),
        hasApiKey: !!sv.apiKey,
        hasCredentials: !!sv.username || !!sv.password,
      })),
    })),
  };
});

function maskUrl(u: string) {
  try {
    const url = new URL(u);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch { return u; }
}

const serviceUpdateSchema = z.object({
  serverId: z.string().min(1),
  type: z.string().min(1),
  name: z.string().max(128).optional(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
});

interface ConfigFile {
  auth: {
    username: string;
    passwordHash: string;
    sessionSecret: string;
  };
  servers: Array<{
    id: string;
    name: string;
    glancesUrl?: string;
    services: Array<{
      type: string;
      baseUrl: string;
      name?: string;
      apiKey?: string;
      username?: string;
      password?: string;
    }>;
  }>;
}

function readConfigFile(): ConfigFile {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const fs = require("node:fs") as typeof import("node:fs");
  const path = getConfigPath();
  return JSON.parse(fs.readFileSync(path, "utf8")) as ConfigFile;
}

function writeConfigFile(config: ConfigFile) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const fs = require("node:fs") as typeof import("node:fs");
  fs.writeFileSync(getConfigPath(), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  resetConfigCache();
}

export const updateServiceConfig = createServerFn({ method: "POST" })
  .inputValidator(serviceUpdateSchema)
  .handler(async ({ data }) => {
    if (!(await isAuthed())) return { authed: false as const };
    const cfg = getConfig();
    if (cfg.demo) return { authed: true as const, ok: false as const, error: "Settings are read-only in demo mode" };
    const file = readConfigFile();
    const server = file.servers.find((s) => s.id === data.serverId);
    const service = server?.services.find((s) => s.type === data.type);
    if (!service) return { authed: true as const, ok: false as const, error: "Service not found" };
    if (data.name !== undefined) service.name = data.name.trim() || undefined;
    if (data.baseUrl !== undefined) service.baseUrl = data.baseUrl.trim();
    if (data.apiKey !== undefined && data.apiKey.trim()) service.apiKey = data.apiKey.trim();
    if (data.username !== undefined && data.username.trim()) service.username = data.username.trim();
    if (data.password !== undefined && data.password) service.password = data.password;
    writeConfigFile(file);
    return { authed: true as const, ok: true as const };
  });

export const login = createServerFn({ method: "POST" })
  .inputValidator(z.object({ username: z.string().min(1).max(128), password: z.string().min(1).max(256) }))
  .handler(async ({ data }) => {
    const ok = await checkCredentials(data.username, data.password);
    if (!ok) return { ok: false as const, error: "Incorrect username or password" };
    const token = await makeSessionToken();
    setResponseHeader("Set-Cookie", buildSetCookie(token, 7 * 24 * 60 * 60));
    return { ok: true as const };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  setResponseHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return { ok: true as const };
});
