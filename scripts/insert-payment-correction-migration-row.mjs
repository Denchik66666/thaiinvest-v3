/**
 * Регистрирует миграцию 20260508180000_payment_correction_proposals в _prisma_migrations
 * (если prisma migrate resolve недоступен из‑за P1017 на CLI).
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });

const MIGRATION_NAME = "20260508180000_payment_correction_proposals";

const rawUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
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

const sqlPath = path.join(process.cwd(), `prisma/migrations/${MIGRATION_NAME}/migration.sql`);
const migrationSql = fs.readFileSync(sqlPath, "utf8");
const checksum = crypto.createHash("sha256").update(migrationSql).digest("hex");

const client = new pg.Client({
  connectionString: connectionStringForPg(rawUrl),
  ssl: rawUrl.includes("supabase.com") ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 90_000,
});

async function main() {
  await client.connect();

  const dup = await client.query(`SELECT 1 FROM "_prisma_migrations" WHERE migration_name = $1`, [
    MIGRATION_NAME,
  ]);
  if (dup.rowCount > 0) {
    console.log("Запись миграции уже есть в _prisma_migrations.");
    return;
  }

  const id = crypto.randomUUID();

  await client.query(
    `INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
     VALUES ($1, $2, NOW(), $3, NULL, NULL, NOW(), 1)`,
    [id, checksum, MIGRATION_NAME]
  );
  console.log("Добавлена запись _prisma_migrations для", MIGRATION_NAME);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => client.end().catch(() => {}));
