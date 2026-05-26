/// <reference types="node" />
// Server-only config loader. Reads env vars at startup. If APP_PASSWORD_HASH
// is not set, the dashboard runs in DEMO mode with mock data and a default
// password of "demo".

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
  passwordHash: string; // sha256 hex of password
  sessionSecret: string;
  servers: ServerCfg[];
}

function getEnv(key: string): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (globalThis as any).process?.env as Record<string, string | undefined> | undefined;
  return env?.[key];
}

/**
 * Returns the active config. In real deployment, mount /app/config.json into
 * the container and set CONFIG_PATH; we read JSON for simplicity.
 *
 * For the Lovable preview (and any unconfigured run), we ship demo mode.
 */
let cached: AppConfig | undefined;
export function getConfig(): AppConfig {
  if (cached) return cached;

  const passwordHash = getEnv("APP_PASSWORD_HASH");
  const sessionSecret = getEnv("SESSION_SECRET") ?? "lovable-homelab-dev-secret-change-me";
  const configJson = getEnv("CONFIG_JSON");

  if (!passwordHash || !configJson) {
    // Demo mode: default password is "demo" → sha256
    cached = {
      demo: true,
      passwordHash: "2a97516c354b68848cdbd8f54a226a0a55b21ed138e207ad6c5cbb9c00aa5aea",
      sessionSecret,
      servers: [
        { id: "alpha", name: "Server Alpha", services: [] },
        { id: "bravo", name: "Server Bravo", services: [] },
      ],
    };
    return cached;
  }

  const parsed = JSON.parse(configJson) as { servers: ServerCfg[] };
  cached = {
    demo: false,
    passwordHash,
    sessionSecret,
    servers: parsed.servers ?? [],
  };
  return cached;
}
