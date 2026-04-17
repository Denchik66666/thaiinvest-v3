/**
 * Отчёт по схеме public в Postgres (Supabase): таблицы, колонки ключевых таблиц, риски для Prisma.
 * Только чтение. Запуск: в .env указан DIRECT_URL или DATABASE_URL на нужный проект.
 */
import "dotenv/config";
import pg from "pg";

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Нет DIRECT_URL и DATABASE_URL в .env");
  process.exit(1);
}

const APP_TABLES = [
  "User",
  "Investor",
  "Payment",
  "Accrual",
  "RateHistory",
  "AuditLog",
  "BodyTopUpRequest",
  "ChatMessage",
];

async function main() {
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const tables = await client.query(
    `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  );
  const set = new Set(tables.rows.map((r) => r.tablename));

  console.log("=== Supabase / Postgres: отчёт только чтение ===\n");
  console.log("Всего таблиц в public:", set.size);
  console.log("");

  for (const t of APP_TABLES) {
    if (!set.has(t)) {
      console.log(`[ОТСУТСТВУЕТ] ${t} — приложение ожидает эту таблицу`);
      continue;
    }
    const cols = await client.query(
      `SELECT column_name, data_type, udt_name, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [t]
    );
    console.log(`\n--- Таблица "${t}" (${cols.rows.length} колонок) ---`);
    for (const c of cols.rows) {
      console.log(`  ${c.column_name}: ${c.data_type} (${c.udt_name}) null=${c.is_nullable}`);
    }

    const est = await client.query(
      `SELECT reltuples::bigint AS est FROM pg_class WHERE oid = $1::regclass`,
      [`public."${t}"`]
    );
    const n = est.rows[0]?.est;
    if (n != null && n >= 0) console.log(`  ~строк (оценка): ${n}`);
    else if (n != null) console.log(`  ~строк: статистика не собрана (ANALYZE)`);
  }

  console.log("\n=== Проверки совместимости с Prisma (ожидание Int id у User) ===\n");

  if (set.has("User")) {
    const u = await client.query(
      `SELECT data_type, udt_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'User' AND column_name = 'id'`
    );
    const row = u.rows[0];
    if (row) {
      const ok = row.data_type === "integer" || row.udt_name === "int4";
      console.log(`User.id тип: ${row.data_type} (${row.udt_name}) → ${ok ? "OK для Prisma Int" : "РИСК: Prisma ожидает Int, миграции/чат могут ломаться"}`);
    }
  }

  if (set.has("ChatMessage")) {
    const fk = await client.query(
      `SELECT conname FROM pg_constraint
       WHERE conrelid = 'public."ChatMessage"'::regclass AND contype = 'f'`
    );
    console.log(`ChatMessage FK: ${fk.rows.length ? fk.rows.map((r) => r.conname).join(", ") : "НЕТ — риск целостности"}`);
  } else {
    console.log("ChatMessage: нет таблицы — чат в приложении не заработает до миграции/создания таблицы");
  }

  const fkeys = await client.query(
    `SELECT COUNT(*)::int AS n FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace`
  );
  console.log(`\nВсего внешних ключей в public: ${fkeys.rows[0].n}`);

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
