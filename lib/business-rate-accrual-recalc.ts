import { prisma } from "@/lib/prisma";
import { getPreviousOrCurrentMonday, startOfDay } from "@/lib/weekly";
import { withDbRetry } from "@/lib/db-retry";
import {
  computeInvestorAccruedEndFromLedger,
  computeInvestorPaidCompletedTotal,
  toWeeklyLedgerPayments,
} from "@/lib/investor-accrued-ledger";

/**
 * Пересчитывает **`Investor.accrued`** и **`Investor.paid`** для всех незакрытых позиций
 * через **`buildWeeklyLedgerRows`** (см. **`lib/investor-accrued-ledger.ts`**).
 * Вызывается после изменений **`RateHistory`** и из очереди пересчёта.
 */
export async function recalculateInvestorAccruedFromRateHistory(): Promise<void> {
  const now = new Date();
  const lastClosedWeekStart = getPreviousOrCurrentMonday(now);

  const [rateHistory, investors] = await Promise.all([
    withDbRetry(() =>
      prisma.rateHistory.findMany({
        orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }],
        select: { effectiveDate: true, newRate: true },
      })
    ),
    withDbRetry(() =>
      prisma.investor.findMany({
        where: {
          status: { not: "closed" },
          activationDate: { lte: lastClosedWeekStart },
        },
        select: {
          id: true,
          body: true,
          activationDate: true,
          isPrivate: true,
          rate: true,
          accrued: true,
          paid: true,
          payments: {
            where: { status: "completed" },
            select: {
              id: true,
              investorId: true,
              type: true,
              amount: true,
              createdAt: true,
              approvedAt: true,
              acceptedAt: true,
              status: true,
            },
          },
        },
      })
    ),
  ]);

  const investorIds = investors.map((i) => i.id);
  const allTopUps =
    investorIds.length > 0
      ? await withDbRetry(() =>
          prisma.bodyTopUpRequest.findMany({
            where: { investorId: { in: investorIds } },
            select: {
              investorId: true,
              amount: true,
              status: true,
              requestDate: true,
              decidedAt: true,
              createdAt: true,
            },
          })
        )
      : [];

  const topByInv = new Map<number, typeof allTopUps>();
  for (const t of allTopUps) {
    const list = topByInv.get(t.investorId) ?? [];
    list.push(t);
    topByInv.set(t.investorId, list);
  }

  const eps = 0.00001;
  for (const inv of investors) {
    const topRows = (topByInv.get(inv.id) ?? []).map((t) => ({
      amount: t.amount,
      status: t.status,
      requestDate: t.requestDate,
      decidedAt: t.decidedAt,
      createdAt: t.createdAt,
    }));

    const accrued = computeInvestorAccruedEndFromLedger({
      activationDate: inv.activationDate,
      body: inv.body,
      rate: inv.rate,
      isPrivate: inv.isPrivate,
      payments: toWeeklyLedgerPayments(inv.payments),
      bodyTopUpRows: topRows,
      rateHistory,
      now,
    });
    const paid = computeInvestorPaidCompletedTotal(inv.payments);

    if (Math.abs((inv.accrued ?? 0) - accrued) > eps || Math.abs((inv.paid ?? 0) - paid) > eps) {
      await withDbRetry(() =>
        prisma.investor.update({
          where: { id: inv.id },
          data: { accrued, paid },
        })
      );
    }
  }
}

/** Ставка сети на конец календарного дня перед понедельником вступления (для поля `oldRate`). */
export async function getBusinessRateBeforeEffectiveMonday(
  effectiveMonday: Date,
  excludeRateHistoryId?: number
): Promise<number | null> {
  const before = startOfDay(effectiveMonday);
  before.setDate(before.getDate() - 1);

  const row = await withDbRetry(() =>
    prisma.rateHistory.findFirst({
      where: {
        effectiveDate: { lte: before },
        ...(excludeRateHistoryId != null ? { id: { not: excludeRateHistoryId } } : {}),
      },
      orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
      select: { newRate: true },
    })
  );
  return row?.newRate ?? null;
}

export function isStrictlyFutureEffectiveDate(effectiveDate: Date, now: Date = new Date()): boolean {
  return startOfDay(effectiveDate).getTime() > startOfDay(now).getTime();
}
