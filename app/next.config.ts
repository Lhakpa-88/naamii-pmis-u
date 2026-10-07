import type { NextConfig } from "next";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// One .env at the repository root serves the app, the db scripts and the
// functions. Load it here (without overriding real environment variables).
for (const candidate of [resolve(__dirname, "../.env"), resolve(__dirname, ".env")]) {
  if (!existsSync(candidate)) continue;
  for (const raw of readFileSync(candidate, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
  break;
}

const nextConfig: NextConfig = {
  // This is an authenticated, per-user management dashboard: every page is
  // dynamic, so we use the classic dynamic-rendering model rather than
  // Cache Components / partial prerendering.
  cacheComponents: false,
  serverExternalPackages: ["pg"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
