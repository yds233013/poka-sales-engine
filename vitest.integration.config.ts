import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Integration tests run the real orchestrator against a real PostgreSQL
 * database, seeded from scratch. They are slower than the unit suite and kept
 * in a separate project so `npm run test:unit` stays instant.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["./tests/support/global-setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // The suite shares one seeded database; parallel files would race on it.
    fileParallelism: false,
  },
});
