/**
 * Аудит + пересчёт accrued/paid на проде (DATABASE_URL только из `.env`).
 *
 *   npx tsx scripts/reconcile-all-investors-prod.ts              — dry-run + аудит + сравнение с локалью
 *   npx tsx scripts/reconcile-all-investors-prod.ts --apply      — записать в БД
 *   npx tsx scripts/reconcile-all-investors-prod.ts --no-compare — без сравнения с .env.local
 *
 * Канон: `reconcileAllInvestorsAccruedAndPaidFromLedger` → `computeInvestorAccruedEndFromLedger` +
 * `computeInvestorPaidCompletedTotal` (внутри — `buildWeeklyLedgerRows`).
 */
import "./load-prod-env-only";
import { prisma } from "@/lib/prisma";
import { reconcileAllInvestorsAccruedAndPaidFromLedger } from "@/lib/business-rate-accrual-recalc";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const apply = process.argv.includes("--apply");
const compareLocal = !process.argv.includes("--no-compare");
const timeline = process.argv.includes("--timeline");

function parseEnvFile(rel: string): Record<string, string> {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return {};
  return dotenv.parse(fs.readFileSync(p, "utf8"));
}

async function explainSegaPaidMismatch(): Promise<void> {
  const seg = await prisma.investor.findFirst({
    where: { OR: [{ handle: { contains: "Sega", mode: "insensitive" } }, { name: { contains: "Sega", mode: "insensitive" } }] },
    select: { id: true, name: true, handle: true, paid: true, accrued: true, status: true },
  });
  if (!seg) {
    console.log("\n--- Sega: инвестор не найден по handle/name ---\n");
    return;
  }
  const iid = seg.id;
  const [payments, audits] = await Promise.all([
    prisma.payment.findMany({
      where: { investorId: iid },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.auditLog.findMany({
      where: { entityType: "Investor", entityId: iid, action: "UPDATE_INVESTOR" },
      orderBy: { createdAt: "asc" },
      select: { id: true, userId: true, createdAt: true, oldValue: true, newValue: true },
    }),
  ]);
  const sumCompleted = payments.filter((p) => p.status === "completed").reduce((s, p) => s + p.amount, 0);

  console.log("\n========== 1) ПРИЧИНА: Sega и поле paid ==========\n");
  console.log(
    "Вывод: вторая выплата в таблице Payment **не существует**. " +
      "Значение paid=10000 могло появиться только из **ручного правки** (SUPER_ADMIN PUT с полем paid), " +
      "из **дампа со старым paid** при отличном наборе Payment, или если **фоновый пересчёт** " +
      "(`recalculateInvestorAccruedFromRateHistory`) **не дошёл** до этой строки (ошибка, serverless, позиция была `closed` и исключена из выборки).\n"
  );
  console.log("Инвестор:", JSON.stringify(seg, null, 2));
  console.log("Payment (все статусы), count=", payments.length, "sum completed=", sumCompleted);
  console.log(JSON.stringify(payments, null, 2));
  console.log("\nAuditLog UPDATE_INVESTOR (все записи; paid из JSON):");
  for (const a of audits) {
    let oldPaid: unknown = null;
    let newPaid: unknown = null;
    try {
      const o = a.oldValue ? (JSON.parse(a.oldValue) as { paid?: unknown }) : {};
      const n = a.newValue ? (JSON.parse(a.newValue) as { paid?: unknown }) : {};
      oldPaid = o.paid;
      newPaid = n.paid;
    } catch {
      oldPaid = newPaid = "parse_error";
    }
    console.log(
      `  ${a.createdAt.toISOString()}  audit#${a.id} user=${a.userId}  paid: ${JSON.stringify(oldPaid)} → ${JSON.stringify(newPaid)}`
    );
  }
  if (audits.length === 0) {
    console.log("  (нет записей UPDATE_INVESTOR — ручное правление могло быть вне аудита или до внедрения лога.)");
  }
  console.log("");
}

type Snap = { id: number; handle: string | null; body: number; accrued: number; paid: number };

async function snapshotInvestors(url: string, label: string): Promise<Snap[]> {
  const ssl = url.includes("supabase") ? { rejectUnauthorized: false as const } : undefined;
  const c = new pg.Client({ connectionString: url, ssl });
  await c.connect();
  const r = await c.query(
    `SELECT id, handle, body, accrued, paid FROM "Investor" ORDER BY id`
  );
  await c.end();
  return r.rows.map((row) => ({
    id: row.id,
    handle: row.handle,
    body: Number(row.body),
    accrued: Number(row.accrued),
    paid: Number(row.paid),
  }));
}

async function printTimeline(): Promise<void> {
  const investors = await prisma.investor.findMany({
    orderBy: { id: "asc" },
    select: { id: true, name: true, handle: true, createdAt: true, entryDate: true, activationDate: true },
  });
  for (const inv of investors) {
    const [topUps, payments, accruals, creates] = await Promise.all([
      prisma.bodyTopUpRequest.findMany({
        where: { investorId: inv.id },
        orderBy: { id: "asc" },
        select: { id: true, amount: true, status: true, requestDate: true, createdAt: true, decidedAt: true },
      }),
      prisma.payment.findMany({
        where: { investorId: inv.id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, type: true, amount: true, status: true, createdAt: true },
      }),
      prisma.accrual.findMany({
        where: { investorId: inv.id },
        orderBy: { cycleStart: "asc" },
        select: { id: true, amount: true, status: true, cycleStart: true, cycleEnd: true, createdAt: true },
      }),
      prisma.auditLog.findMany({
        where: { entityType: "Investor", entityId: inv.id, action: "CREATE_INVESTOR" },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
    ]);

    type Ev = { at: string; kind: string; detail: string };
    const events: Ev[] = [];
    for (const c of creates) {
      events.push({ at: c.createdAt.toISOString(), kind: "create_position", detail: "AuditLog CREATE_INVESTOR" });
    }
    events.push({
      at: inv.createdAt.toISOString(),
      kind: "investor_row",
      detail: `row createdAt entry=${inv.entryDate.toISOString()} act=${inv.activationDate.toISOString()}`,
    });
    for (const t of topUps) {
      events.push({
        at: (t.requestDate ?? t.createdAt).toISOString(),
        kind: "body_topup",
        detail: `id=${t.id} amt=${t.amount} st=${t.status} created=${t.createdAt.toISOString()}`,
      });
    }
    for (const p of payments) {
      events.push({
        at: p.createdAt.toISOString(),
        kind: "payment",
        detail: `id=${p.id} ${p.type} amt=${p.amount} st=${p.status}`,
      });
    }
    for (const a of accruals) {
      events.push({
        at: a.createdAt.toISOString(),
        kind: "accrual_row",
        detail: `id=${a.id} amt=${a.amount} st=${a.status} cycle=${a.cycleStart.toISOString()}–${a.cycleEnd.toISOString()}`,
      });
    }
    events.sort((x, y) => x.at.localeCompare(y.at));
    console.log(
      `\n--- Timeline id=${inv.id} ${inv.handle ?? ""} ${inv.name} ---\n` +
        events.map((e) => `  ${e.at}  ${e.kind.padEnd(16)} ${e.detail}`).join("\n")
    );
  }
}

async function main() {
  await explainSegaPaidMismatch();

  if (timeline) {
    console.log("\n========== 2) Хронология по всем инвесторам (сырые даты БД) ==========\n");
    await printTimeline();
  }

  console.log("\n========== 3) Пересчёт accrued / paid (канон леджера) ==========\n");
  console.log("apply =", apply, "(без --apply только расчёт и отчёт)\n");

  const rows = await reconcileAllInvestorsAccruedAndPaidFromLedger({ apply });
  const drift = rows.filter(
    (r) => Math.abs(r.beforeAccrued - r.afterAccrued) > 0.5 || Math.abs(r.beforePaid - r.afterPaid) > 0.5
  );
  console.log("Всего инвесторов:", rows.length, "| с расхождением до правки:", drift.length);
  if (drift.length) {
    console.log(
      drift
        .map(
          (r) =>
            `  id=${r.id} ${r.handle ?? r.name}  accrued ${r.beforeAccrued}→${r.afterAccrued}  paid ${r.beforePaid}→${r.afterPaid} (sum completed payments=${r.sumPaymentCompleted})`
        )
        .join("\n")
    );
  }

  if (!compareLocal) {
    await prisma.$disconnect();
    return;
  }

  const localEnv = parseEnvFile(".env.local");
  const localUrl = localEnv.DATABASE_URL || localEnv.DIRECT_URL;
  if (!localUrl) {
    console.log("\n(Сравнение пропущено: нет DATABASE_URL в .env.local)\n");
    await prisma.$disconnect();
    return;
  }

  console.log("\n========== 4) Сравнение прод vs локаль (после пересчёта на проде, если был --apply) ==========\n");
  const prodUrl = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!prodUrl) {
    console.log("Нет DATABASE_URL после load-prod-env-only");
    await prisma.$disconnect();
    return;
  }

  const [prodSnaps, localSnaps] = await Promise.all([
    snapshotInvestors(prodUrl, "prod"),
    snapshotInvestors(localUrl, "local"),
  ]);
  const localById = new Map(localSnaps.map((s) => [s.id, s]));
  let mism = 0;
  for (const p of prodSnaps) {
    const l = localById.get(p.id);
    if (!l) {
      console.log(`  id=${p.id}: есть на проде, нет локально`);
      mism++;
      continue;
    }
    const same =
      Math.abs(p.accrued - l.accrued) < 0.5 &&
      Math.abs(p.paid - l.paid) < 0.5 &&
      Math.abs(p.body - l.body) < 0.5;
    if (!same) {
      mism++;
      console.log(
        `  id=${p.id} ${p.handle ?? ""}: prod body/acc/paid=${p.body}/${p.accrued}/${p.paid}  local=${l.body}/${l.accrued}/${l.paid}`
      );
    }
  }
  for (const l of localSnaps) {
    if (!prodSnaps.some((p) => p.id === l.id)) {
      console.log(`  id=${l.id}: есть локально, нет на проде`);
      mism++;
    }
  }
  if (mism === 0) {
    console.log("Все id: body, accrued, paid совпадают между продом и локалью.");
  } else {
    console.log("\nИтого расхождений:", mism, "— разные дампы, разный now() или локаль не обновлена после правок на проде.");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
