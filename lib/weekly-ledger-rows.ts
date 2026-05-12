import { getNextMonday, getPreviousOrCurrentMonday, getWeekStartMonday, startOfDay } from "@/lib/weekly";
import { moneyRound2 } from "@/lib/money-round";

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

/** Принятое пополнение тела: дата вступления в расчёт — `requestDate`, иначе `decidedAt`, иначе `createdAt`. */
export type LedgerAcceptedBodyTopUp = { amount: number; effectiveAt: Date };

export function ledgerAcceptedTopUpsFromPrismaRows(
  rows: Array<{ amount: number; status: string; requestDate: Date | null; decidedAt: Date | null; createdAt: Date }>
): LedgerAcceptedBodyTopUp[] {
  return rows
    .filter((r) => r.status === "accepted_by_investor")
    .map((r) => ({
      amount: r.amount,
      effectiveAt: r.requestDate ?? r.decidedAt ?? r.createdAt,
    }))
    .sort((a, b) => a.effectiveAt.getTime() - b.effectiveAt.getTime());
}

/**
 * Недельный леджер по одному инвестору (логика совпадает с GET `/api/investors/[id]/weekly-ledger`).
 *
 * Если переданы **`acceptedBodyTopUps`** (принятые заявки на пополнение тела):
 * - стартовое тело до первого пополнения = `body` − сумма принятых пополнений + сумма завершённых выплат «тело»;
 * - в понедельник **`getNextMonday(startOfDay(effectiveAt))`**: если день пополнения не понедельник — первый понедельник **после** этой даты (тело не увеличивается «задним числом» в начале календарной недели до даты заявки);
 * - шаг недели выравнивается на понедельник от `activationDate`, чтобы сетка недель совпадала с `RateHistory` / UI.
 *
 * Если **`acceptedBodyTopUps`** нет — прежнее поведение: на все недели берётся текущее `body` (без истории пополнений).
 */
export function buildWeeklyLedgerRows(
  investor: {
    activationDate: Date;
    body: number;
    rate: number;
    isPrivate: boolean;
    payments: WeeklyLedgerPaymentInput[];
    acceptedBodyTopUps?: LedgerAcceptedBodyTopUp[];
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

  const sortedTopUps = [...(investor.acceptedBodyTopUps ?? [])].sort(
    (a, b) => a.effectiveAt.getTime() - b.effectiveAt.getTime()
  );

  const completedBodyPaidTotal = moneyRound2(
    investor.payments
      .filter((p) => p.status === "completed" && p.type === "body")
      .reduce((s, p) => s + p.amount, 0)
  );

  const sumTopUps = moneyRound2(sortedTopUps.reduce((s, t) => s + t.amount, 0));

  let initialBaseBody = moneyRound2(investor.body - sumTopUps + completedBodyPaidTotal);
  if (initialBaseBody < 0) initialBaseBody = 0;

  const topUpByWeekMonday = new Map<number, number>();
  for (const t of sortedTopUps) {
    const bumpWeekStart = getNextMonday(startOfDay(t.effectiveAt));
    const wk = bumpWeekStart.getTime();
    topUpByWeekMonday.set(wk, moneyRound2((topUpByWeekMonday.get(wk) ?? 0) + t.amount));
  }

  let cursor = new Date(investor.activationDate);
  cursor.setHours(0, 0, 0, 0);
  if (sortedTopUps.length > 0) {
    cursor = getWeekStartMonday(startOfDay(investor.activationDate));
  }

  let runningBody = sortedTopUps.length > 0 ? initialBaseBody : investor.body;
  let accrued = 0;
  const rows: WeeklyLedgerRow[] = [];

  while (cursor.getTime() < lastClosedWeekStart.getTime()) {
    const weekStart = new Date(cursor);
    const weekEnd = new Date(cursor.getTime() + oneWeekMs);

    const weekMondayTs = getWeekStartMonday(startOfDay(weekStart)).getTime();
    const bump = topUpByWeekMonday.get(weekMondayTs);
    if (bump != null && bump !== 0) {
      runningBody = moneyRound2(runningBody + bump);
      topUpByWeekMonday.delete(weekMondayTs);
    }

    const businessRate = resolveBusinessRateForWeek(weekStart);
    const appliedRate = investor.isPrivate ? businessRate / 2 : businessRate;
    const weeklyRatePercent = appliedRate / 4;
    const accruedAdded = moneyRound2(runningBody * (weeklyRatePercent / 100));

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

    accrued = moneyRound2(accrued + accruedAdded);
    accrued = Math.max(moneyRound2(accrued - interestPaid), 0);
    if (bodyPaid > 0) runningBody = Math.max(moneyRound2(runningBody - bodyPaid), 0);
    if (closingPaid > 0) {
      accrued = 0;
      runningBody = 0;
    }

    rows.push({
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      bodyStart: moneyRound2(runningBody + bodyPaid),
      weeklyRatePercent,
      networkRatePercent: businessRate,
      accruedAdded,
      interestPaid,
      bodyPaid,
      closingPaid,
      accruedEnd: accrued,
      bodyEnd: runningBody,
    });

    cursor = weekEnd;
  }

  const currentWeekStart = new Date(lastClosedWeekStart);
  const currentWeekEnd = new Date(currentWeekStart.getTime() + oneWeekMs);

  const curMondayTs = getWeekStartMonday(startOfDay(currentWeekStart)).getTime();
  const bumpOpen = topUpByWeekMonday.get(curMondayTs);
  if (bumpOpen != null && bumpOpen !== 0) {
    runningBody = moneyRound2(runningBody + bumpOpen);
    topUpByWeekMonday.delete(curMondayTs);
  }

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

    accrued = Math.max(moneyRound2(accrued - interestPaid), 0);
    if (bodyPaid > 0) runningBody = Math.max(moneyRound2(runningBody - bodyPaid), 0);
    if (closingPaid > 0) {
      accrued = 0;
      runningBody = 0;
    }

    rows.push({
      weekStart: currentWeekStart.toISOString(),
      weekEnd: currentWeekEnd.toISOString(),
      bodyStart: moneyRound2(runningBody + bodyPaid),
      weeklyRatePercent: currentWeeklyRatePercent,
      networkRatePercent: currentBusinessRate,
      accruedAdded: 0,
      interestPaid,
      bodyPaid,
      closingPaid,
      accruedEnd: accrued,
      bodyEnd: runningBody,
    });
  }

  return rows;
}
