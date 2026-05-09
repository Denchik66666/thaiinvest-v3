/**
 * Создаёт таблицу PaymentCorrectionProposal напрямую через pg (обходит нестабильный prisma migrate на некоторых Supabase pooler).
 * После успеха выполните: npx prisma migrate resolve --applied 20260508180000_payment_correction_proposals
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

/** Убираем sslmode из строки — иначе pg v8 может требовать полную цепочку сертификатов и падать SELF_SIGNED_CERT_IN_CHAIN. */
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

const sqlPath = path.join(
  process.cwd(),
  "prisma/migrations/20260508180000_payment_correction_proposals/migration.sql"
);
const sql = fs.readFileSync(sqlPath, "utf8");

const client = new pg.Client({
  connectionString: url,
  ssl: rawUrl.includes("supabase.com") ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 90_000,
});

async function main() {
  await client.connect();

  const exists = await client.query(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'PaymentCorrectionProposal'
    ) AS ok`
  );
  if (exists.rows[0]?.ok) {
    console.log("Таблица PaymentCorrectionProposal уже есть.");
    return;
  }

  await client.query(sql);
  console.log("SQL миграции PaymentCorrectionProposal выполнен.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => client.end().catch(() => {}));
