/**
 * Записать PLAYWRIGHT_SUPERADMIN_USER / PLAYWRIGHT_SUPERADMIN_PASSWORD в Vercel
 * (Production + Preview). Пароль — из .env/.env.local (PLAYWRIGHT_SUPERADMIN_PASSWORD
 * или PLAYWRIGHT_LOGIN_PASSWORD), проверка bcrypt на прод-БД для username SUPER_ADMIN.
 *
 * node scripts/set-vercel-playwright-superadmin-env.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import pg from "pg";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(name) {
  const fp = path.join(root, name);
  if (!fs.existsSync(fp)) return {};
  return dotenv.parse(fs.readFileSync(fp, "utf8"));
}

const prodOnly = loadEnvFile(".env");
for (const [k, v] of Object.entries(prodOnly)) process.env[k] = v;

const local = loadEnvFile(".env.local");
const password =
  local.PLAYWRIGHT_SUPERADMIN_PASSWORD?.trim() ||
  local.PLAYWRIGHT_LOGIN_PASSWORD?.trim() ||
  prodOnly.PLAYWRIGHT_SUPERADMIN_PASSWORD?.trim() ||
  prodOnly.PLAYWRIGHT_LOGIN_PASSWORD?.trim();

if (!password) {
  console.error("Задайте PLAYWRIGHT_LOGIN_PASSWORD или PLAYWRIGHT_SUPERADMIN_PASSWORD в .env.local");
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!dbUrl) {
  console.error("Нет DATABASE_URL в .env");
  process.exit(1);
}

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();
const { rows } = await client.query(
  `SELECT id, username, password FROM "User" WHERE role = 'SUPER_ADMIN' AND "isArchived" = false LIMIT 1`
);
await client.end();

if (rows.length === 0) {
  console.error("SUPER_ADMIN не найден в прод-БД");
  process.exit(1);
}

const superUser = rows[0];
if (!bcrypt.compareSync(password, superUser.password)) {
  console.error(
    `Пароль из .env.local не совпадает с хешем пользователя "${superUser.username}" в прод-БД.`
  );
  process.exit(1);
}

const username = superUser.username;
console.log(`SUPER_ADMIN в проде: username="${username}" (id=${superUser.id})`);
console.log("Обновление Vercel env (значения не выводятся)…");

function upsertEnv(name, value, environment) {
  console.log(`→ ${name} [${environment}]`);
  let r = spawnSync("npx", ["vercel", "env", "update", name, environment, "--yes"], {
    cwd: root,
    input: value,
    encoding: "utf8",
    stdio: ["pipe", "inherit", "inherit"],
    shell: true,
  });
  if ((r.status ?? 1) !== 0) {
    r = spawnSync("npx", ["vercel", "env", "add", name, environment, "--yes"], {
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

upsertEnv("PLAYWRIGHT_SUPERADMIN_USER", username, "production");
upsertEnv("PLAYWRIGHT_SUPERADMIN_PASSWORD", password, "production");

console.log(
  "Готово: PLAYWRIGHT_SUPERADMIN_USER и PLAYWRIGHT_SUPERADMIN_PASSWORD в Production.\n" +
    "Preview: в UI Vercel → Environment Variables → Preview → те же имена (CLI часто просит ветку)."
);
