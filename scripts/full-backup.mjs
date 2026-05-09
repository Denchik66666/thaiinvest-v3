/**
 * Полный локальный бэкап:
 * 1) git bundle --all → backups/thaiinvest-restore-<slug>.bundle
 * 2) при наличии pg_dump в PATH и DIRECT_URL в .env → custom-format дамп БД
 *
 * Запуск: node scripts/full-backup.mjs
 * Опции: BACKUP_SLUG=my-label (иначе дата UTC YYYY-MM-DDTHH-mm-ss)
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

dotenv.config({ path: path.join(root, ".env") });
dotenv.config({ path: path.join(root, ".env.local"), override: true });

const slug =
  (process.env.BACKUP_SLUG && String(process.env.BACKUP_SLUG).replace(/[^\w.-]+/g, "-").slice(0, 80)) ||
  new Date().toISOString().replace(/[:]/g, "-").replace(/\..+/, "");

const backupsDir = path.join(root, "backups");
fs.mkdirSync(backupsDir, { recursive: true });

const bundlePath = path.join(backupsDir, `thaiinvest-restore-${slug}.bundle`);
const memoryPath = path.join(backupsDir, `MEMORY_BACKUP_${slug}.txt`);

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: "utf8", shell: false, ...opts });
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

console.log("→ git bundle create ( --all ) …");
const gb = run("git", ["bundle", "create", bundlePath, "--all"]);
if (gb.status !== 0) {
  console.error(gb.stderr || gb.stdout);
  process.exit(gb.status);
}
const verify = run("git", ["bundle", "verify", bundlePath]);
if (verify.status !== 0) {
  console.error("bundle verify failed:", verify.stderr);
  process.exit(verify.status);
}
console.log("OK bundle:", bundlePath);

let dbDumpPath = null;
const directUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
const pgDump = process.env.PG_DUMP_PATH || "pg_dump";

if (!directUrl) {
  console.warn("Нет DIRECT_URL / DATABASE_URL — дамп БД пропущен.");
} else {
  const which = run(pgDump, ["-V"]);
  if (which.status !== 0) {
    console.warn("pg_dump не найден (установите PostgreSQL client tools или PG_DUMP_PATH) — дамп БД пропущен.");
  } else {
    dbDumpPath = path.join(backupsDir, `db-${slug}.dump`);
    const d = run(pgDump, ["--dbname", directUrl, "-Fc", "-f", dbDumpPath, "--no-owner", "--no-acl"]);
    if (d.status !== 0) {
      console.error("pg_dump failed:", d.stderr || d.stdout);
      try {
        fs.unlinkSync(dbDumpPath);
      } catch {
        /* ignore */
      }
      process.exit(d.status);
    }
    console.log("OK pg_dump:", dbDumpPath);
  }
}

const mem = [
  `THAIINVEST — полный бэкап (запись для памяти)`,
  `Создано (UTC): ${new Date().toISOString()}`,
  ``,
  `1) Код и вся история git (все refs):`,
  `   Файл: ${path.relative(root, bundlePath)}`,
  `   Проверка: git bundle verify ${path.relative(root, bundlePath)}`,
  `   Клон: git clone ${path.relative(root, bundlePath)} restored-repo`,
  ``,
  dbDumpPath
    ? [
        `2) База PostgreSQL (custom format, pg_restore):`,
        `   Файл: ${path.relative(root, dbDumpPath)}`,
        `   Восстановление (пример, целевая БД должна быть пустой/новой):`,
        `   pg_restore --dbname "postgresql://…" --clean --if-exists "${path.relative(root, dbDumpPath)}"`,
        ``,
      ].join("\n")
    : `2) Дамп БД: не создан (нет URL или pg_dump).`,
  ``,
  `Контекст работ (2026-05-08 и рядом):`,
  `• Производительность БД: индексы npm run db:apply-dashboard-indexes`,
  `  (в т.ч. prisma/migrations/20260508223000_rate_history_investor_perf_indexes).`,
  `• SUPER_ADMIN network=all: лимит позиций + meta (types/operations-finance-api.ts),`,
  `  заголовок X-Thaiinvest-Investor-Selection-Partial, UI FinanceInvestorSelectionTruncationNotice.`,
  `• API-тесты: tests/e2e/api-operations-history-roles.spec.ts`,
  `• Prisma: один Pool в lib/prisma.ts; withDbRetry на DELETE платежей.`,
  `• .env не входит в bundle (gitignore) — храните секреты отдельно.`,
  ``,
  `Подробнее см. backups/README_RESTORE.txt`,
  ``,
].join("\n");

fs.writeFileSync(memoryPath, mem, "utf8");
console.log("OK memory:", path.relative(root, memoryPath));
