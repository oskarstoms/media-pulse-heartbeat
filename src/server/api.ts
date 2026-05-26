import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";

import { buildSnapshot } from "./snapshot";
import { buildDemoLogs } from "../lib/demo-data";
import { getConfig } from "./config";
import { buildSetCookie, checkPassword, COOKIE_NAME, makeSessionToken, parseCookie, verifySessionToken } from "./auth";

async function isAuthed(): Promise<boolean> {
  const cfg = getConfig();
  if (cfg.demo) return true; // demo mode: no auth required
  const req = getWebRequest();
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
  return { authed: true as const, logs: buildDemoLogs() };
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
        baseUrl: maskUrl(sv.baseUrl),
        hasApiKey: !!sv.apiKey,
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

export const login = createServerFn({ method: "POST" })
  .inputValidator(z.object({ password: z.string().min(1).max(256) }))
  .handler(async ({ data }) => {
    const ok = await checkPassword(data.password);
    if (!ok) return { ok: false as const, error: "Incorrect password" };
    const token = await makeSessionToken();
    setResponseHeader("Set-Cookie", buildSetCookie(token, 7 * 24 * 60 * 60));
    return { ok: true as const };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  setResponseHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return { ok: true as const };
});
