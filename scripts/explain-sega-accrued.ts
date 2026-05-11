/**
 * Разбор начислений по неделям для инвестора (по умолчанию id=1, Sega).
 * Логика совпадает с `recalculateInvestorAccruedFromRateHistory`: только закрытые недели
 * в начислении, затем выплаты текущей недели, итог — `Math.round(accrued)`.
 *
 * npx tsx scripts/explain-sega-accrued.ts [investorId]
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { getPreviousOrCurrentMonday } from "@/lib/weekly";
import { moneyRound2 } from "@/lib/money-round";

const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

async function main() {
  const investorId = Number(process.argv[2]) || 1;
  const inv = await prisma.investor.findUnique({
    where: { id: investorId },
    include: {
      payments: {
        where: { status: "completed" },
        orderBy: { createdAt: "asc" },
        select: { type: true, amount: true, createdAt: true, status: true },
      },
    },
  });
  if (!inv) {
    console.log("investor not found");
    return;
  }

  const rateHistory = await prisma.rateHistory.findMany({
    orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }],
    select: { id: true, effectiveDate: true, newRate: true, oldRate: true },
  });

  const now = new Date();
  const lastClosedWeekStart = getPreviousOrCurrentMonday(now);

  console.log("=== Инвестор ===");
  console.log({
    id: inv.id,
    name: inv.name,
    handle: inv.handle,
    body: inv.body,
    rateCard: inv.rate,
    isPrivate: inv.isPrivate,
    status: inv.status,
    activationDate: inv.activationDate.toISOString(),
    accruedInDb: inv.accrued,
  });

  console.log("\n=== История ставок (RateHistory) ===");
  for (const r of rateHistory) {
    console.log(
      `${r.effectiveDate.toISOString().slice(0, 10)}  newRate=${r.newRate}%  oldRate=${r.oldRate}%  id=${r.id}`
    );
  }

  const resolveBusinessRateAt = (weekStart: Date, pointer: { idx: number }) => {
    if (!rateHistory.length) return inv.isPrivate ? inv.rate * 2 : inv.rate;
    while (
      pointer.idx + 1 < rateHistory.length &&
      rateHistory[pointer.idx + 1].effectiveDate.getTime() <= weekStart.getTime()
    ) {
      pointer.idx += 1;
    }
    const rate = rateHistory[pointer.idx]?.newRate;
    return typeof rate === "number" ? rate : 0;
  };

  let cursor = new Date(inv.activationDate);
  cursor.setHours(0, 0, 0, 0);
  let body = inv.body;
  let accrued = 0;
  const pointer = { idx: 0 };
  if (rateHistory.length) {
    while (
      pointer.idx + 1 < rateHistory.length &&
      rateHistory[pointer.idx + 1].effectiveDate.getTime() <= cursor.getTime()
    ) {
      pointer.idx += 1;
    }
  }

  const weeks: Array<{
    weekStart: string;
    weekEnd: string;
    businessRate: number;
    appliedRate: number;
    weeklyPct: number;
    accruedAdded: number;
    interestPaid: number;
    bodyPaid: number;
    closingPaid: number;
    bodyAfter: number;
    accruedAfter: number;
  }> = [];

  while (cursor.getTime() < lastClosedWeekStart.getTime()) {
    const weekStart = new Date(cursor);
    const weekEnd = new Date(cursor.getTime() + oneWeekMs);
    const businessRate = resolveBusinessRateAt(weekStart, pointer);
    const appliedRate = inv.isPrivate ? businessRate / 2 : businessRate;
    const weeklyRatePercent = appliedRate / 4;
    const accruedAdded = body * (weeklyRatePercent / 100);

    const completedPaymentsInWeek = inv.payments.filter((payment) => {
      const eventDate = payment.createdAt;
      return eventDate >= weekStart && eventDate < weekEnd;
    });
    const interestPaid = completedPaymentsInWeek
      .filter((p) => p.type === "interest")
      .reduce((s, p) => s + p.amount, 0);
    const bodyPaid = completedPaymentsInWeek.filter((p) => p.type === "body").reduce((s, p) => s + p.amount, 0);
    const closingPaid = completedPaymentsInWeek.filter((p) => p.type === "close").reduce((s, p) => s + p.amount, 0);

    accrued += accruedAdded;
    accrued = Math.max(accrued - interestPaid, 0);
    if (bodyPaid > 0) body = Math.max(body - bodyPaid, 0);
    if (closingPaid > 0) {
      accrued = 0;
      body = 0;
    }

    weeks.push({
      weekStart: weekStart.toISOString().slice(0, 10),
      weekEnd: weekEnd.toISOString().slice(0, 10),
      businessRate,
      appliedRate,
      weeklyPct: weeklyRatePercent,
      accruedAdded: moneyRound2(accruedAdded),
      interestPaid: moneyRound2(interestPaid),
      bodyPaid: moneyRound2(bodyPaid),
      closingPaid: moneyRound2(closingPaid),
      bodyAfter: moneyRound2(body),
      accruedAfter: moneyRound2(accrued),
    });

    cursor = weekEnd;
  }

  const currentWeekStart = new Date(lastClosedWeekStart);

  const currentWeekPayments = inv.payments.filter((payment) => {
    if (payment.status !== "completed") return false;
    const eventDate = payment.createdAt;
    return eventDate >= currentWeekStart && eventDate <= now;
  });
  let openInterest = 0;
  let openBody = 0;
  let openClose = 0;
  if (currentWeekPayments.length > 0) {
    openInterest = currentWeekPayments.filter((p) => p.type === "interest").reduce((s, p) => s + p.amount, 0);
    openBody = currentWeekPayments.filter((p) => p.type === "body").reduce((s, p) => s + p.amount, 0);
    openClose = currentWeekPayments.filter((p) => p.type === "close").reduce((s, p) => s + p.amount, 0);
    accrued = Math.max(accrued - openInterest, 0);
    if (openBody > 0) body = Math.max(body - openBody, 0);
    if (openClose > 0) {
      accrued = 0;
      body = 0;
    }
  }

  const accruedBeforeRound = accrued;
  accrued = Math.round(accrued);

  console.log("\n=== Закрытые недели (как в recalculate) ===");
  console.log(`Всего закрытых недель в цикле: ${weeks.length}`);
  const show = weeks.slice(0, 5);
  console.log("(первые 5 недель)");
  console.log(JSON.stringify(show, null, 2));
  if (weeks.length > 5) {
    console.log("...");
    console.log("(последние 3 недели)");
    console.log(JSON.stringify(weeks.slice(-3), null, 2));
  }

  console.log("\n=== Текущая неделя (только выплаты; процент за неделю в accrued не начисляется) ===");
  console.log({
    currentWeekStart: currentWeekStart.toISOString().slice(0, 10),
    openInterestPaid: moneyRound2(openInterest),
    openBodyPaid: moneyRound2(openBody),
    openClosePaid: moneyRound2(openClose),
    bodyAfter: moneyRound2(body),
    accruedAfterPaymentsBeforeRound: moneyRound2(accruedBeforeRound),
  });

  console.log("\n=== Итог модели ===");
  console.log({
    accruedRounded: accrued,
    accruedInDb: inv.accrued,
  });

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
