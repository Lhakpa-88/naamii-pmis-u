import { loadEnv, migrate } from "./lib.mjs";
loadEnv();
migrate().catch((e) => { console.error(e); process.exit(1); });
