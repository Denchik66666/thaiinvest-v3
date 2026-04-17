import { startOfDay } from "@/lib/weekly";

export type BusinessRateHistoryRow = {
  id: number;
  oldRate: number;
  newRate: number;
  effectiveDate: string;
  comment: string | null;
  createdAt: string;
  user: {
    username: string;
    role: string;
  };
};

export function ymdFromRow(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatRuDate(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("ru-RU");
}

/** Убирает повторяющиеся строки вида «тот же день, те же %». */
export function dedupeBusinessRateHistory(rows: BusinessRateHistoryRow[]): BusinessRateHistoryRow[] {
  const seen = new Set<string>();
  const out: BusinessRateHistoryRow[] = [];
  for (const r of rows) {
    const key = `${ymdFromRow(r.effectiveDate)}|${r.oldRate}|${r.newRate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

export function milestonesFromRates(rows: BusinessRateHistoryRow[]) {
  const sorted = [...rows].sort(
    (a, b) => +new Date(a.effectiveDate) - +new Date(b.effectiveDate) || +new Date(a.createdAt) - +new Date(b.createdAt)
  );
  const byDay = new Map<string, BusinessRateHistoryRow>();
  for (const r of sorted) {
    const y = ymdFromRow(r.effectiveDate);
    const prev = byDay.get(y);
    if (!prev || new Date(r.createdAt) >= new Date(prev.createdAt)) byDay.set(y, r);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, row]) => row);
}

export function pastRecentMilestones(rows: BusinessRateHistoryRow[], today: Date = new Date()) {
  const milestonesAsc = milestonesFromRates(rows);
  const t0 = startOfDay(today).getTime();
  return [...milestonesAsc]
    .filter((m) => startOfDay(new Date(m.effectiveDate)).getTime() <= t0)
    .sort((a, b) => +new Date(b.effectiveDate) - +new Date(a.effectiveDate) || +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 16);
}
