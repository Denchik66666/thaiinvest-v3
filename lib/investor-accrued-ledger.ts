import { moneyRound2 } from "@/lib/money-round";
import {
  buildWeeklyLedgerRows,
  ledgerAcceptedTopUpsFromPrismaRows,
  type WeeklyLedgerPaymentInput,
} from "@/lib/weekly-ledger-rows";

export type InvestorLedgerRateHistoryRow = { effectiveDate: Date; newRate: number };

/** Строки `BodyTopUpRequest` для `ledgerAcceptedTopUpsFromPrismaRows`. */
export type BodyTopUpLedgerRow = {
  amount: number;
  status: string;
  requestDate: Date | null;
  decidedAt: Date | null;
  createdAt: Date;
};

export function toWeeklyLedgerPayments(
  rows: Array<{
    status: string;
    type: string;
    amount: number;
    createdAt: Date;
    approvedAt: Date | null;
    acceptedAt: Date | null;
  }>
): WeeklyLedgerPaymentInput[] {
  return rows.map((p) => ({
    status: p.status,
    type: p.type,
    amount: p.amount,
    createdAt: p.createdAt,
    approvedAt: p.approvedAt,
    acceptedAt: p.acceptedAt,
  }));
}

/**
 * Единственный расчёт **`Investor.accrued`** в продукте: последний `accruedEnd` из **`buildWeeklyLedgerRows`**
 * (только закрытые недели дают прирост; открытая неделя — корректировки выплатами; округление до целого бата).
 */
export function computeInvestorAccruedEndFromLedger(input: {
  activationDate: Date;
  body: number;
  rate: number;
  isPrivate: boolean;
  payments: WeeklyLedgerPaymentInput[];
  bodyTopUpRows: BodyTopUpLedgerRow[];
  rateHistory: InvestorLedgerRateHistoryRow[];
  now?: Date;
}): number {
  const rows = buildWeeklyLedgerRows(
    {
      activationDate: input.activationDate,
      body: input.body,
      rate: input.rate,
      isPrivate: input.isPrivate,
      payments: input.payments,
      acceptedBodyTopUps: ledgerAcceptedTopUpsFromPrismaRows(input.bodyTopUpRows),
    },
    input.rateHistory,
    input.now ?? new Date()
  );
  if (!rows.length) return 0;
  return Math.round(moneyRound2(rows[rows.length - 1]!.accruedEnd));
}

/** Сумма **`Payment.amount`** по всем завершённым выплатам (все типы). */
export function computeInvestorPaidCompletedTotal(
  payments: Array<{ status: string; amount: number }>
): number {
  return moneyRound2(
    payments.filter((p) => p.status === "completed").reduce((s, p) => s + p.amount, 0)
  );
}
