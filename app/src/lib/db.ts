import "server-only";
import { Pool, types, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { env } from "./env";

// Return NUMERIC and BIGINT as JavaScript numbers (dashboard precision is
// sufficient for NPR amounts) and DATE as plain 'YYYY-MM-DD' strings so no
// timezone shifts a month boundary.
types.setTypeParser(1700, (v) => parseFloat(v));
types.setTypeParser(20, (v) => parseInt(v, 10));
types.setTypeParser(1082, (v) => v);

declare global {
  var __pmisPool: Pool | undefined;
}

/** One pool per process, connected as the low-privilege application role. */
function pool(): Pool {
  if (!globalThis.__pmisPool) {
    globalThis.__pmisPool = new Pool({ connectionString: env.databaseUrl, max: 10, idleTimeoutMillis: 30_000 });
  }
  return globalThis.__pmisPool;
}

export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<R>>;
}

/**
 * Run `fn` inside a transaction that carries the signed-in user's identity.
 * Row Level Security policies read app.user_id, so every query inside sees
 * only the rows that user is entitled to — whatever the query asks for.
 */
export async function withUser<T>(userId: string, fn: (q: Queryable) => Promise<T>): Promise<T> {
  const client: PoolClient = await pool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Queries that legitimately run before a user is identified (sign-in lookup,
 * demo account list). Only SECURITY DEFINER helper functions are reachable
 * this way — RLS denies every table by default without app.user_id.
 */
export async function anonymousQuery<R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<R>> {
  return pool().query<R>(text, params);
}
