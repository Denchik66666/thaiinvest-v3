/**
 * Восстанавливает backups/local-snapshot.dump (pg_dump -Fc с локального Docker)
 * в Supabase из DIRECT_URL в корневом `.env`.
 *
 * Docker на Windows часто не ходит на db.*.supabase.co (только IPv6) — используем
 * pooler :5432 (IPv4) + перед restore сбрасываем public schema через psql.
 *
 * Запуск: COPY_LOCAL_TO_CLOUD=1 node scripts/restore-local-snapshot-to-supabase.mjs
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

if (process.env.COPY_LOCAL_TO_CLOUD !== "1") {
  console.error("Установите COPY_LOCAL_TO_CLOUD=1 и повторите (операция перезапишет облачную БД).");
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dumpPath = path.join(root, "backups", "local-snapshot.dump");
const envPath = path.join(root, ".env");

dotenv.config({ path: envPath });
const directUrl = process.env.DIRECT_URL;
if (!directUrl || !String(directUrl).trim()) {
  console.error("В .env нет DIRECT_URL.");
  process.exit(1);
}

const u0 = new URL(directUrl);
const restoreHost = u0.hostname;
const restorePort = String(u0.port || "5432");
const restoreUser = u0.username;
const restorePass = u0.password;
const restoreDb = (u0.pathname || "/postgres").replace(/^\//, "") || "postgres";

if (!fs.existsSync(dumpPath)) {
  console.error("Нет файла", dumpPath);
  process.exit(1);
}

const absBackups = path.resolve(dumpPath, "..");
const winPath = absBackups.replace(/\\/g, "/");

function dockerPostgres(args, extraDocker = []) {
  const cmd = [
    "run",
    "--rm",
    "--dns",
    "8.8.8.8",
    "-e",
    `PGPASSWORD=${restorePass}`,
    "-e",
    "PGSSLMODE=require",
    "-v",
    `${winPath}:/bk`,
    ...extraDocker,
    "postgres:16-alpine",
    ...args,
  ];
  return spawnSync("docker", cmd, { stdio: "inherit", cwd: root, shell: false });
}

console.log("→ psql: сброс schema public на", restoreHost, "…");
const sql =
  "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public;";
const psql = dockerPostgres([
  "psql",
  "-h",
  restoreHost,
  "-p",
  restorePort,
  "-U",
  restoreUser,
  "-d",
  restoreDb,
  "-v",
  "ON_ERROR_STOP=1",
  "-c",
  sql,
]);
if ((psql.status ?? 1) !== 0) {
  process.exit(psql.status ?? 1);
}

console.log("→ pg_restore (без --clean, схема уже пустая) …");
const pg = dockerPostgres([
  "pg_restore",
  "-h",
  restoreHost,
  "-p",
  restorePort,
  "-U",
  restoreUser,
  "-d",
  restoreDb,
  "--no-owner",
  "--no-acl",
  "/bk/local-snapshot.dump",
]);
process.exit(pg.status ?? 1);
