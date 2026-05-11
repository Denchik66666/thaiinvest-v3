import { getPreviousOrCurrentMonday } from "@/lib/weekly";

export type WeeklyLedgerRow = {
  weekStart: string;
  weekEnd: string;
  bodyStart: number;
  weeklyRatePercent: number;
  networkRatePercent: number;
  accruedAdded: number;
  interestPaid: number;
  bodyPaid: number;
  closingPaid: number;
  accruedEnd: number;
  bodyEnd: number;
};

/** Вход платежей для недельного леджера (совместимо с select Payment в Prisma). */
export type WeeklyLedgerPaymentInput = {
  status: string;
  type: string;
  amount: number;
  createdAt: Date;
  approvedAt: Date | null;
  acceptedAt: Date | null;
};

type RateHistoryRow = { effectiveDate: Date; newRate: number };

/**
 * Недельный леджер по одному инвестору (логика совпадает с GET `/api/investors/[id]/weekly-ledger`).
 */
export function buildWeeklyLedgerRows(
  investor: {
    activationDate: Date;
    body: number;
    rate: number;
    isPrivate: boolean;
    payments: WeeklyLedgerPaymentInput[];
  },
  rateHistory: RateHistoryRow[],
  now: Date = new Date()
): WeeklyLedgerRow[] {
  const lastClosedWeekStart = getPreviousOrCurrentMonday(now);

  const resolveBusinessRateForWeek = (weekStart: Date) => {
    if (!rateHistory.length) return investor.rate;
    let idx = 0;
    while (idx + 1 < rateHistory.length && rateHistory[idx + 1].effectiveDate.getTime() <= weekStart.getTime()) {
      idx += 1;
    }
    return rateHistory[idx].newRate;
  };

  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

  let cursor = new Date(investor.activationDate);
  cursor.setHours(0, 0, 0, 0);

  let body = investor.body;
  let accrued = 0;
  const rows: WeeklyLedgerRow[] = [];

  while (cursor.getTime() < lastClosedWeekStart.getTime()) {
    const weekStart = new Date(cursor);
    const weekEnd = new Date(cursor.getTime() + oneWeekMs);

    const businessRate = resolveBusinessRateForWeek(weekStart);
    const appliedRate = investor.isPrivate ? businessRate / 2 : businessRate;
    const weeklyRatePercent = appliedRate / 4;
    const accruedAdded = body * (weeklyRatePercent / 100);

    const completedPayments = investor.payments.filter((payment) => {
      if (payment.status !== "completed") return false;
      const eventDate = payment.createdAt;
      return eventDate >= weekStart && eventDate < weekEnd;
    });

    const interestPaid = completedPayments
      .filter((payment) => payment.type === "interest")
      .reduce((sum, payment) => sum + payment.amount, 0);
    const bodyPaid = completedPayments
      .filter((payment) => payment.type === "body")
      .reduce((sum, payment) => sum + payment.amount, 0);
    const closingPaid = completedPayments
      .filter((payment) => payment.type === "close")
      .reduce((sum, payment) => sum + payment.amount, 0);

    accrued += accruedAdded;
    accrued = Math.max(accrued - interestPaid, 0);
    if (bodyPaid > 0) body = Math.max(body - bodyPaid, 0);
    if (closingPaid > 0) {
      accrued = 0;
      body = 0;
    }

    rows.push({
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      bodyStart: body + bodyPaid,
      weeklyRatePercent,
      networkRatePercent: businessRate,
      accruedAdded,
      interestPaid,
      bodyPaid,
      closingPaid,
      accruedEnd: accrued,
      bodyEnd: body,
    });

    cursor = weekEnd;
  }

  const currentWeekStart = new Date(lastClosedWeekStart);
  const currentWeekEnd = new Date(currentWeekStart.getTime() + oneWeekMs);

  const currentBusinessRate = resolveBusinessRateForWeek(currentWeekStart);
  const currentAppliedRate = investor.isPrivate ? currentBusinessRate / 2 : currentBusinessRate;
  const currentWeeklyRatePercent = currentAppliedRate / 4;

  const currentWeekPayments = investor.payments.filter((payment) => {
    if (payment.status !== "completed") return false;
    const eventDate = payment.createdAt;
    return eventDate >= currentWeekStart && eventDate <= now;
  });

  if (currentWeekPayments.length > 0) {
    const interestPaid = currentWeekPayments
      .filter((payment) => payment.type === "interest")
      .reduce((sum, payment) => sum + payment.amount, 0);
    const bodyPaid = currentWeekPayments
      .filter((payment) => payment.type === "body")
      .reduce((sum, payment) => sum + payment.amount, 0);
    const closingPaid = currentWeekPayments
      .filter((payment) => payment.type === "close")
      .reduce((sum, payment) => sum + payment.amount, 0);

    accrued = Math.max(accrued - interestPaid, 0);
    if (bodyPaid > 0) body = Math.max(body - bodyPaid, 0);
    if (closingPaid > 0) {
      accrued = 0;
      body = 0;
    }

    rows.push({
      weekStart: currentWeekStart.toISOString(),
      weekEnd: currentWeekEnd.toISOString(),
      bodyStart: body + bodyPaid,
      weeklyRatePercent: currentWeeklyRatePercent,
      networkRatePercent: currentBusinessRate,
      accruedAdded: 0,
      interestPaid,
      bodyPaid,
      closingPaid,
      accruedEnd: accrued,
      bodyEnd: body,
    });
  }

  if (rows.length) {
    const last = rows[rows.length - 1];
    last.accruedEnd = Math.round(accrued);
  }

  return rows;
}
