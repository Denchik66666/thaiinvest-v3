import { prisma } from "@/lib/prisma";

export type RateHistoryLedgerRow = { effectiveDate: Date; newRate: number };

let mem: { expiresAt: number; rows: RateHistoryLedgerRow[] } | null = null;
const TTL_MS = 300_000;

/** Сброс после изменения ставки (иначе до 2 мин устаревшие строки в ленте/сводках). */
export function invalidateRateHistoryRowsCache(): void {
  mem = null;
}

/** Одна и та же выборка для weekly-логики; без кэша дергается на каждый GET operations-history / summary. */
export async function getRateHistoryRowsForLedger(): Promise<RateHistoryLedgerRow[]> {
  const now = Date.now();
  if (mem && mem.expiresAt > now) return mem.rows;
  const rows = await prisma.rateHistory.findMany({
    orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }],
    select: { effectiveDate: true, newRate: true },
  });
  mem = { expiresAt: now + TTL_MS, rows };
  return rows;
}
