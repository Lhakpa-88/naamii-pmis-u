import { loadEnv, seed } from "./lib.mjs";
loadEnv();
seed().catch((e) => { console.error(e); process.exit(1); });
