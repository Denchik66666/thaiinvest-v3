/**
 * Предохранитель: запрещает запуск "опасных" команд на НЕ-локальной БД.
 *
 * Проверяет DATABASE_URL / DIRECT_URL (если есть) и валит процесс, если хост не локальный.
 *
 * Разрешённые хосты по умолчанию:
 * - localhost / 127.0.0.1 / ::1
 * - docker compose service names: db / postgres
 *
 * Bypass (только если прям надо): ALLOW_REMOTE_DB=1
 */
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });

const allowRemote = process.env.ALLOW_REMOTE_DB === "1";
if (allowRemote) process.exit(0);

const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "db", "postgres"]);

function parseHost(url) {
  if (!url) return null;
  try {
    // URL требует протокол; prisma+postgres:// тоже ок.
    const u = new URL(url);
    return u.hostname || null;
  } catch {
    return null;
  }
}

const urls = [
  ["DATABASE_URL", process.env.DATABASE_URL],
  ["DIRECT_URL", process.env.DIRECT_URL],
];

const offenders = [];
for (const [name, value] of urls) {
  if (!value) continue;
  const host = parseHost(String(value));
  if (!host) continue;
  if (!allowedHosts.has(host)) offenders.push({ name, host });
}

if (offenders.length) {
  const lines = offenders.map((o) => `- ${o.name}: host=${o.host}`).join("\n");
  console.error(
    [
      "⛔ Запрещено: команда пытается работать с НЕ-локальной БД.",
      "Обновите .env/.env.local на локальные URL (localhost / db / postgres).",
      "Для явного обхода установите ALLOW_REMOTE_DB=1.",
      "",
      "Найдено:",
      lines,
    ].join("\n")
  );
  process.exit(2);
}

process.exit(0);

