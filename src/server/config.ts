/// <reference types="node" />
// Server-only config loader.
//
// Single source of truth: a JSON file at CONFIG_PATH (default /app/config.json).
// Contains auth (username + sha256 password hash) and the list of servers /
// services to monitor. Demo mode is opt-in with DEMO=true or DEMO_MODE=true.

export interface ServiceCfg {
  type: string;
  baseUrl: string;
  apiKey?: string;
  username?: string;
  password?: string;
}

export interface ServerCfg {
  id: string;
  name: string;
  /** Glances JSON API base, e.g. http://server-a:61208/api/4 */
  glancesUrl?: string;
  services: ServiceCfg[];
}

export interface AppConfig {
  demo: boolean;
  username: string;
  passwordHash: string; // sha256 hex of password
  sessionSecret: string;
  servers: ServerCfg[];
}

interface ConfigFile {
  auth: {
    username: string;
    /** sha256 hex of the password */
    passwordHash: string;
    /** Long random string used to sign session cookies. */
    sessionSecret: string;
  };
  servers: ServerCfg[];
}

const DEMO: AppConfig = {
  demo: true,
  username: "admin",
  // sha256("demo")
  passwordHash: "2a97516c354b68848cdbd8f54a226a0a55b21ed138e207ad6c5cbb9c00aa5aea",
  sessionSecret: "lovable-homelab-demo-secret",
  servers: [
    { id: "alpha", name: "Server Alpha", services: [] },
    { id: "bravo", name: "Server Bravo", services: [] },
  ],
};

function getEnv(key: string): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (globalThis as any).process?.env as Record<string, string | undefined> | undefined;
  return env?.[key];
}

function isTruthyEnv(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").toLowerCase());
}

function configError(path: string, message: string): never {
  throw new Error(`[config] ${message}. Set DEMO=true for mock data, or mount a valid config file at ${path}.`);
}

let cached: AppConfig | undefined;
export function getConfig(): AppConfig {
  if (cached) return cached;

  const path = getEnv("CONFIG_PATH") ?? "/app/config.json";
  const demoRequested = isTruthyEnv(getEnv("DEMO")) || isTruthyEnv(getEnv("DEMO_MODE"));
  if (demoRequested) {
    cached = DEMO;
    return cached;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const fs = require("node:fs") as typeof import("node:fs");
    if (!fs.existsSync(path)) {
      configError(path, `config file not found at ${path}`);
    }
    const raw = fs.readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as ConfigFile;
    if (!parsed?.auth?.username || !parsed?.auth?.passwordHash) {
      configError(path, `${path} is missing auth.username or auth.passwordHash`);
    }
    if (!parsed.auth.sessionSecret || parsed.auth.sessionSecret.length < 32) {
      configError(path, `${path} needs auth.sessionSecret with at least 32 characters`);
    }
    if (!Array.isArray(parsed.servers)) {
      configError(path, `${path} needs a servers array`);
    }
    cached = {
      demo: false,
      username: parsed.auth.username,
      passwordHash: parsed.auth.passwordHash,
      sessionSecret: parsed.auth.sessionSecret,
      servers: parsed.servers,
    };
    return cached;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("[config]")) throw err;
    configError(path, `failed to load config from ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
