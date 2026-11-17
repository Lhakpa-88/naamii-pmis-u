import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests for the data-entry layer. They run the real import and
// write code against a real PostgreSQL (npm run db:start && npm run db:reset).
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: { include: ["test/**/*.test.ts"], testTimeout: 30000, fileParallelism: false },
});
