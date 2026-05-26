// Lightweight session helpers using Web Crypto. No bcrypt/JWT deps.
import { getConfig } from "./config";

const enc = new TextEncoder();

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function checkCredentials(username: string, password: string): Promise<boolean> {
  const cfg = getConfig();
  if (username !== cfg.username) return false;
  const h = await sha256Hex(password);
  return h === cfg.passwordHash.toLowerCase();
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Returns "<expiresAtMs>.<hmac>" */
export async function makeSessionToken(): Promise<string> {
  const cfg = getConfig();
  const exp = (Date.now() + SESSION_TTL_MS).toString();
  const sig = await hmacHex(cfg.sessionSecret, exp);
  return `${exp}.${sig}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig) return false;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Date.now()) return false;
  const cfg = getConfig();
  const expected = await hmacHex(cfg.sessionSecret, exp);
  return expected === sig;
}

export const COOKIE_NAME = "homelab_session";

export function parseCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export function buildSetCookie(token: string, maxAgeSeconds: number): string {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  return parts.join("; ");
}
