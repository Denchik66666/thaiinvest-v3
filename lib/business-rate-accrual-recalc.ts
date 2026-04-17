import { prisma } from "@/lib/prisma";
import { getPreviousOrCurrentMonday, startOfDay } from "@/lib/weekly";

/**
 * Пересчитывает `Investor.accrued` по полной истории `RateHistory`
 * (копия логики POST `/api/system/business-rate` после любого изменения истории).
 */
export async function recalculateInvestorAccruedFromRateHistory(): Promise<void> {
  const now = new Date();
  const lastClosedWeekStart = getPreviousOrCurrentMonday(now);
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

  const rateHistory = await prisma.rateHistory.findMany({
    orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }],
    select: { effectiveDate: true, newRate: true },
  });

  const investors = await prisma.investor.findMany({
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
  });

  const resolveBusinessRateAt = (weekStart: Date, pointer: { idx: number }) => {
    if (!rateHistory.length) return undefined;
    while (
      pointer.idx + 1 < rateHistory.length &&
      rateHistory[pointer.idx + 1].effectiveDate.getTime() <= weekStart.getTime()
    ) {
      pointer.idx += 1;
    }
    return rateHistory[pointer.idx]?.newRate;
  };

  const eps = 0.00001;
  for (const inv of investors) {
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

    const resolveRate = (weekStart: Date) => {
      if (!rateHistory.length) return inv.isPrivate ? inv.rate * 2 : inv.rate;
      const rate = resolveBusinessRateAt(weekStart, pointer);
      return typeof rate === "number" ? rate : 0;
    };

    while (cursor.getTime() < lastClosedWeekStart.getTime()) {
      const weekStart = new Date(cursor);
      const weekEnd = new Date(cursor.getTime() + oneWeekMs);

      const businessRate = resolveRate(weekStart);
      const appliedRate = inv.isPrivate ? businessRate / 2 : businessRate;
      const weeklyRatePercent = appliedRate / 4;
      const accruedAdded = body * (weeklyRatePercent / 100);

      const completedPaymentsInWeek = inv.payments.filter((payment) => {
        const eventDate = payment.acceptedAt ?? payment.approvedAt ?? payment.createdAt;
        return eventDate >= weekStart && eventDate < weekEnd;
      });

      const interestPaid = completedPaymentsInWeek.filter((p) => p.type === "interest").reduce((sum, p) => sum + p.amount, 0);
      const bodyPaid = completedPaymentsInWeek.filter((p) => p.type === "body").reduce((sum, p) => sum + p.amount, 0);
      const closingPaid = completedPaymentsInWeek.filter((p) => p.type === "close").reduce((sum, p) => sum + p.amount, 0);

      accrued += accruedAdded;
      accrued = Math.max(accrued - interestPaid, 0);

      if (bodyPaid > 0) body = Math.max(body - bodyPaid, 0);
      if (closingPaid > 0) {
        accrued = 0;
        body = 0;
      }

      cursor = weekEnd;
    }

    const currentWeekStart = new Date(lastClosedWeekStart);
    const currentWeekPayments = inv.payments.filter((payment) => {
      const eventDate = payment.acceptedAt ?? payment.approvedAt ?? payment.createdAt;
      return eventDate >= currentWeekStart && eventDate <= now;
    });

    if (currentWeekPayments.length > 0) {
      const interestPaid = currentWeekPayments.filter((p) => p.type === "interest").reduce((sum, p) => sum + p.amount, 0);
      const bodyPaid = currentWeekPayments.filter((p) => p.type === "body").reduce((sum, p) => sum + p.amount, 0);
      const closingPaid = currentWeekPayments.filter((p) => p.type === "close").reduce((sum, p) => sum + p.amount, 0);

      accrued = Math.max(accrued - interestPaid, 0);
      if (bodyPaid > 0) body = Math.max(body - bodyPaid, 0);
      if (closingPaid > 0) {
        accrued = 0;
        body = 0;
      }
    }

    if (Math.abs((inv.accrued ?? 0) - accrued) > eps) {
      await prisma.investor.update({ where: { id: inv.id }, data: { accrued } });
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

  const row = await prisma.rateHistory.findFirst({
    where: {
      effectiveDate: { lte: before },
      ...(excludeRateHistoryId != null ? { id: { not: excludeRateHistoryId } } : {}),
    },
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
    select: { newRate: true },
  });
  return row?.newRate ?? null;
}

export function isStrictlyFutureEffectiveDate(effectiveDate: Date, now: Date = new Date()): boolean {
  return startOfDay(effectiveDate).getTime() > startOfDay(now).getTime();
}
