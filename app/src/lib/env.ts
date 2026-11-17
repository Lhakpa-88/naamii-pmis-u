import "server-only";

/** Typed access to server-side settings. Values come from the root .env (see next.config.ts). */
export type AuthMode = "password" | "dev" | "demo" | "entra";

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
    const m = (process.env.PMIS_AUTH_MODE ?? "password").toLowerCase();
    if (m !== "password" && m !== "dev" && m !== "demo" && m !== "entra") throw new Error(`PMIS_AUTH_MODE must be 'password', 'dev', 'demo' or 'entra' (got '${m}')`);
    // Sign-in without a password must never reach a real installation.
    if ((m === "dev" || m === "demo") && process.env.NODE_ENV === "production" && process.env.PMIS_ALLOW_INSECURE_LOGIN !== "true") {
      throw new Error(`PMIS_AUTH_MODE='${m}' signs people in without a password and is refused in production. Use 'password' or 'entra'.`);
    }
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
