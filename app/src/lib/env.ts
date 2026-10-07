import "server-only";

/** Typed access to server-side settings. Values come from the root .env (see next.config.ts). */
export type AuthMode = "demo" | "entra";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}. See .env.example.`);
  return v;
}

export const env = {
  get databaseUrl(): string {
    return required("DATABASE_URL");
  },
  get authMode(): AuthMode {
    const m = (process.env.PMIS_AUTH_MODE ?? "demo").toLowerCase();
    if (m !== "demo" && m !== "entra") throw new Error(`PMIS_AUTH_MODE must be 'demo' or 'entra' (got '${m}')`);
    return m;
  },
  get sessionSecret(): string {
    return required("SESSION_SECRET");
  },
  get demoBanner(): boolean {
    return (process.env.PMIS_DEMO_BANNER ?? "true").toLowerCase() !== "false";
  },
  get isProduction(): boolean {
    return process.env.NODE_ENV === "production";
  },
};
