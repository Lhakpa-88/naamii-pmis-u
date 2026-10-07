// Shared helpers for the database scripts (Node 20+, pg).
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
export const DB_DIR = resolve(here, "..");
export const REPO_ROOT = resolve(DB_DIR, "..");

// Load .env from the repo root if present (never commit real values).
export function loadEnv() {
  const envPath = resolve(REPO_ROOT, ".env");
  if (!existsSync(envPath)) return;
  for (const raw of readFileSync(envPath, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export const DEFAULT_PORT = process.env.PMIS_PGPORT || "5433";
export const DEFAULT_DB = "naamii_pmis";

export function adminUrl(database = DEFAULT_DB) {
  const base = process.env.DATABASE_ADMIN_URL || `postgres://postgres@127.0.0.1:${DEFAULT_PORT}/${DEFAULT_DB}`;
  const u = new URL(base);
  u.pathname = `/${database}`;
  return u.toString();
}

export function appUrl() {
  return process.env.DATABASE_URL || `postgres://pmis_app@127.0.0.1:${DEFAULT_PORT}/${DEFAULT_DB}`;
}

export async function withClient(connectionString, fn) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function ensureDatabase() {
  const target = new URL(adminUrl()).pathname.slice(1);
  await withClient(adminUrl("postgres"), async (c) => {
    const { rowCount } = await c.query("SELECT 1 FROM pg_database WHERE datname = $1", [target]);
    if (!rowCount) {
      await c.query(`CREATE DATABASE ${quoteIdent(target)} ENCODING 'UTF8' TEMPLATE template0`);
      console.log(`Created database ${target}`);
    }
  });
}

export async function dropDatabase() {
  const target = new URL(adminUrl()).pathname.slice(1);
  await withClient(adminUrl("postgres"), async (c) => {
    await c.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [target]
    );
    await c.query(`DROP DATABASE IF EXISTS ${quoteIdent(target)}`);
    console.log(`Dropped database ${target}`);
  });
}

export function listMigrations() {
  const dir = resolve(DB_DIR, "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ name: f, sql: readFileSync(resolve(dir, f), "utf8") }));
}

export async function migrate() {
  await ensureDatabase();
  await withClient(adminUrl(), async (c) => {
    await c.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const applied = new Set((await c.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
    for (const m of listMigrations()) {
      if (applied.has(m.name)) continue;
      process.stdout.write(`Applying ${m.name} ... `);
      await c.query("BEGIN");
      try {
        await c.query(m.sql);
        await c.query("INSERT INTO schema_migrations(name) VALUES ($1)", [m.name]);
        await c.query("COMMIT");
        console.log("ok");
      } catch (err) {
        await c.query("ROLLBACK");
        console.log("FAILED");
        throw err;
      }
    }
    // Optional passwords for the service roles (used on Azure; local dev uses trust auth).
    if (process.env.PMIS_APP_PASSWORD) {
      await c.query(`ALTER ROLE pmis_app WITH PASSWORD '${process.env.PMIS_APP_PASSWORD.replace(/'/g, "''")}'`);
    }
    if (process.env.PMIS_ETL_PASSWORD) {
      await c.query(`ALTER ROLE pmis_etl WITH PASSWORD '${process.env.PMIS_ETL_PASSWORD.replace(/'/g, "''")}'`);
    }
  });
}

export async function seed() {
  const sql = readFileSync(resolve(DB_DIR, "seed", "demo.sql"), "utf8");
  await withClient(adminUrl(), async (c) => {
    await c.query("BEGIN");
    try {
      await c.query(sql);
      await c.query("COMMIT");
      console.log("Demo data seeded (clearly labelled DEMO — not real NAAMII figures).");
    } catch (err) {
      await c.query("ROLLBACK");
      throw err;
    }
  });
}

function quoteIdent(s) {
  return '"' + String(s).replace(/"/g, '""') + '"';
}
