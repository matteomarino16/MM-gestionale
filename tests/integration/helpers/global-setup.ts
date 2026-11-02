import { execFileSync } from "node:child_process";
import { config as loadEnv } from "dotenv";
import { requireTestDatabaseUrl } from "./test-db-url";

export default function setup() {
  loadEnv({ quiet: true });
  const url = requireTestDatabaseUrl();
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: ["ignore", "ignore", "inherit"],
  });
}
