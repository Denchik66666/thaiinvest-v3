/**
 * Список таблиц в public — проверка, что .env смотрит на «настоящую» базу приложения.
 */
import "dotenv/config";
import pg from "pg";

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Нет DIRECT_URL и DATABASE_URL в .env");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  const res = await client.query(
    `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  );
  const names = res.rows.map((r) => r.tablename);
  console.log("Таблицы в public:", names.length);
  console.log(names.join("\n"));
  const expected = ["Investor", "Payment", "User"];
  const missing = expected.filter((t) => !names.includes(t));
  if (missing.length) {
    console.error("\nВНИМАНИЕ: не хватает таблиц:", missing.join(", "));
    console.error("Скорее всего .env указывает НЕ на ту базу, что на Vercel.");
    process.exit(2);
  }
  if (names.length < 5) {
    console.error("\nВНИМАНИЕ: таблиц очень мало — возможно пустой/тестовый проект Supabase.");
    process.exit(3);
  }
} finally {
  await client.end().catch(() => {});
}
