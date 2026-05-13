/**
 * Usage: node scripts/run-prisma-migrate-with-env.mjs <path-to-env-file>
 * Parses the file with dotenv, merges over process.env, runs prisma migrate deploy.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/run-prisma-migrate-with-env.mjs <path-to-env-file>");
  process.exit(1);
}
const abs = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
if (!fs.existsSync(abs)) {
  console.error("File not found:", abs);
  process.exit(1);
}
const parsed = dotenv.parse(fs.readFileSync(abs, "utf8"));
const env = {
  ...process.env,
  ...parsed,
  // prisma.config.ts читает только этот путь и не трогает .env.local
  THAIINVEST_MIGRATE_ENV_FILE: abs,
};
const r = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  shell: true,
  env,
});
process.exit(r.status ?? 1);
