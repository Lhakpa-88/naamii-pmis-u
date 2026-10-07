// Drop, recreate, migrate and seed the LOCAL database. Refuses to run against
// anything that does not look like a local/dev server.
import { loadEnv, adminUrl, dropDatabase, migrate, seed } from "./lib.mjs";
loadEnv();
const host = new URL(adminUrl()).hostname;
if (!["127.0.0.1", "localhost"].includes(host) && !process.env.PMIS_ALLOW_REMOTE_RESET) {
  console.error(`Refusing to reset a non-local database (${host}). Set PMIS_ALLOW_REMOTE_RESET=1 to override.`);
  process.exit(2);
}
await dropDatabase();
await migrate();
await seed();
