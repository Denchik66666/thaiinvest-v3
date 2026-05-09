/**
 * Индексы для дашборда (обходит P1017 migrate deploy на части хостов Supabase).
 * После успеха (если доступен CLI): npx prisma migrate resolve --applied <имя_папки>
 */
import fs from "fs";
import path from "path";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });

const rawUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!rawUrl) {
  console.error("Нет DIRECT_URL или DATABASE_URL в .env");
  process.exit(1);
}

function connectionStringForPg(u) {
  try {
    const normalized = u.replace(/^postgresql:/i, "http:");
    const parsed = new URL(normalized);
    parsed.searchParams.delete("sslmode");
    return parsed.toString().replace(/^http:/i, "postgresql:");
  } catch {
    return u.split("?")[0];
  }
}

const url = connectionStringForPg(rawUrl);

const migrationFiles = [
  "prisma/migrations/20260508213000_payment_investor_dashboard_indexes/migration.sql",
  "prisma/migrations/20260508214500_audit_payment_timeline_indexes/migration.sql",
  "prisma/migrations/20260508220000_body_topup_investor_created_idx/migration.sql",
  "prisma/migrations/20260508223000_rate_history_investor_perf_indexes/migration.sql",
];

function newClient() {
  return new pg.Client({
    connectionString: url,
    ssl: rawUrl.includes("supabase.com") ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 90_000,
  });
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runSqlFile(rel) {
  const sqlPath = path.join(process.cwd(), rel);
  const sql = fs.readFileSync(sqlPath, "utf8");
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const client = newClient();
    try {
      await client.connect();
      await client.query(sql);
      await client.end();
      console.log("OK:", rel);
      return;
    } catch (e) {
      lastErr = e;
      await client.end().catch(() => {});
      if (attempt < 3) {
        console.warn(`Повтор ${attempt}/3 после ошибки:`, e.code ?? e.message);
        await sleep(1200 * attempt);
      }
    }
  }
  throw lastErr;
}

async function main() {
  for (const rel of migrationFiles) {
    await runSqlFile(rel);
  }
  console.log("Все SQL dashboard-indexes выполнены (IF NOT EXISTS — идемпотентно).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
