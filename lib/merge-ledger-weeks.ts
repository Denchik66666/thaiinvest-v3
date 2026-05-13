import type { WeeklyLedgerRow } from "@/lib/weekly-ledger-rows";

/** Агрегат по всем позициям за одну weekStart (как на странице «Финансы»). */
export type MergedHistoryWeek = {
  weekStart: string;
  weekEnd: string;
  accrued: number;
  paid: number;
  paidInterest: number;
  paidBody: number;
  paidClose: number;
  networkRatePercent?: number;
  /** Строка текущей открытой недели, добавленная только для ленты операций. */
  isSyntheticOpenRow?: boolean;
};

type Acc = MergedHistoryWeek & { _sumWR?: number; _sumA?: number };

/**
 * Объединяет недельные строки леджера нескольких инвесторов в одну шкалу по weekStart.
 */
export function mergeLedgerWeeks(rowSets: WeeklyLedgerRow[][]): MergedHistoryWeek[] {
  const map = new Map<string, Acc>();
  for (const rows of rowSets) {
    if (!rows?.length) continue;
    for (const r of rows) {
      const paid = r.interestPaid + r.bodyPaid + r.closingPaid;
      const prev = map.get(r.weekStart);
      const nw = r.networkRatePercent;
      const nwOk = nw != null && !Number.isNaN(nw);
      if (!prev) {
        map.set(r.weekStart, {
          weekStart: r.weekStart,
          weekEnd: r.weekEnd,
          accrued: r.accruedAdded,
          paid,
          paidInterest: r.interestPaid,
          paidBody: r.bodyPaid,
          paidClose: r.closingPaid,
          networkRatePercent: nwOk ? nw : undefined,
          _sumWR: r.accruedAdded > 0 && nwOk ? nw * r.accruedAdded : undefined,
          _sumA: r.accruedAdded > 0 ? r.accruedAdded : undefined,
        });
      } else {
        prev.accrued += r.accruedAdded;
        prev.paid += paid;
        prev.paidInterest += r.interestPaid;
        prev.paidBody += r.bodyPaid;
        prev.paidClose += r.closingPaid;
        if (prev.networkRatePercent == null && nwOk) prev.networkRatePercent = nw;
        if (r.accruedAdded > 0 && nwOk) {
          prev._sumWR = (prev._sumWR ?? 0) + nw * r.accruedAdded;
          prev._sumA = (prev._sumA ?? 0) + r.accruedAdded;
        }
      }
    }
  }
  return Array.from(map.values())
    .map(({ _sumWR, _sumA, ...rest }) => {
      const blended =
        _sumA != null && _sumA > 0 && _sumWR != null ? _sumWR / _sumA : rest.networkRatePercent;
      return { ...rest, networkRatePercent: blended };
    })
    .sort((a, b) => new Date(b.weekStart).getTime() - new Date(a.weekStart).getTime());
}
