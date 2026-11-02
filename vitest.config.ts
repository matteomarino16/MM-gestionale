import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

loadEnv({ quiet: true });

const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? "";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/integration/helpers/global-setup.ts"],
          // Tutti i file condividono lo stesso database di test: esecuzione sequenziale.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
          env: { DATABASE_URL: testDatabaseUrl, NODE_ENV: "test" },
        },
      },
    ],
  },
});
