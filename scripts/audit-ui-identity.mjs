/**
 * Быстрый аудит: остатки «сырого» ника (@ + handle) и напоминание про канон.
 * Запуск: `npm run audit:ui-identity`
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "coverage", "playwright-report"]);

/** @param {string} dir */
function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(ent.name)) out.push(p);
  }
}

const files = [];
walk(path.join(root, "app"), files);
walk(path.join(root, "components"), files);
walk(path.join(root, "lib"), files);

const patterns = [
  {
    name: "Префикс @ у handle в JSX (обычно ошибка)",
    re: /\{`\s*@\s*\$\{/,
  },
  {
    name: "Строка @{ в JSX",
    re: /@\{/,
  },
];

let hits = 0;
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, "/");
  if (rel.includes("scripts/")) continue;
  const text = fs.readFileSync(file, "utf8");
  for (const { name, re } of patterns) {
    re.lastIndex = 0;
    if (!re.test(text)) continue;
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      if (!re.test(line)) return;
      hits++;
      console.log(`${name}\n  ${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
}

console.log("\n--- Канон публичного ника позиции ---");
console.log("  lib/investor-display-handle.ts  →  investorDisplayHandle()");
console.log("  (канон полей — см. комментарий в lib/investor-display-handle.ts)");
console.log("\nКалендарь: FinanceMonthCalendar + DatePicker + HistoryPeriodPopover (см. finance-calendar-popover-skin.ts).");
console.log("\nЛента операций: DashboardOperationsHistory + GET /api/investors/operations-history\n");

if (hits > 0) {
  console.error(`Итого совпадений (проверьте вручную): ${hits}`);
  process.exit(1);
}
console.log("Явных следов «@{…handle» в .ts/.tsx не найдено.");
process.exit(0);
