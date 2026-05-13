/**
 * Читает только корневой `.env` (без `.env.local`), обновляет в Vercel Production
 * переменные из списка через stdin — значения не печатаются.
 *
 * Usage: node scripts/sync-dotenv-to-vercel-production.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env");

if (!fs.existsSync(envPath)) {
  console.error("Нет файла .env в корне проекта.");
  process.exit(1);
}

const parsed = dotenv.parse(fs.readFileSync(envPath, "utf8"));
const names = ["DATABASE_URL", "DIRECT_URL", "JWT_SECRET"];

for (const name of names) {
  const value = parsed[name];
  if (!value || !String(value).trim()) {
    console.error(`В .env отсутствует или пусто: ${name}`);
    process.exit(1);
  }
  const u = String(value);
  if (name !== "JWT_SECRET" && /localhost|127\.0\.0\.1/i.test(u)) {
    console.error(`${name} указывает на localhost — в Vercel Production так выкатывать нельзя.`);
    process.exit(1);
  }
}

for (const name of names) {
  const value = parsed[name];
  console.log(`→ vercel env update ${name} production …`);
  let r = spawnSync("npx", ["vercel", "env", "update", name, "production", "--yes"], {
    cwd: root,
    input: value,
    encoding: "utf8",
    stdio: ["pipe", "inherit", "inherit"],
    shell: true,
  });
  if ((r.status ?? 1) !== 0) {
    console.log(`   update не сработал, пробуем add …`);
    r = spawnSync("npx", ["vercel", "env", "add", name, "production", "--yes"], {
      cwd: root,
      input: value,
      encoding: "utf8",
      stdio: ["pipe", "inherit", "inherit"],
      shell: true,
    });
  }
  if ((r.status ?? 1) !== 0) {
    process.exit(r.status ?? 1);
  }
}

console.log("→ vercel deploy --prod …");
const deploy = spawnSync("npx", ["vercel", "deploy", "--prod", "--yes"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});
process.exit(deploy.status ?? 1);
