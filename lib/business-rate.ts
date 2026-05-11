import { prisma } from "@/lib/prisma";
import { getPreviousOrCurrentMonday, startOfDay } from "@/lib/weekly";
import { withDbRetry } from "@/lib/db-retry";
import { invalidateRateHistoryRowsCache } from "@/lib/rate-history-rows-cache";

export interface BusinessRateSnapshot {
  rate: number;
  effectiveDate: Date;
}

/** YYYY-MM-DD по UTC-инстанту (как в БД для «календарного» дня). */
export function dateToUtcCalendarYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Ставка сети на календарный день `YYYY-MM-DD` без сдвига из‑за TZ сервера
 * (для `?at=` в API и даты входа из формы).
 */
export async function getCurrentBusinessRateForCalendarYmd(ymd: string): Promise<BusinessRateSnapshot | null> {
  const m = ymd.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const target = new Date(Date.UTC(y, mo - 1, d, 23, 59, 59, 999));
  const row = await withDbRetry(() =>
    prisma.rateHistory.findFirst({
      where: {
        effectiveDate: {
          lte: target,
        },
      },
      orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
    })
  );

  if (!row) return null;

  return {
    rate: row.newRate,
    effectiveDate: row.effectiveDate,
  };
}

export async function getCurrentBusinessRate(atDate: Date = new Date()): Promise<BusinessRateSnapshot | null> {
  const target = startOfDay(atDate);
  const row = await withDbRetry(() =>
    prisma.rateHistory.findFirst({
      where: {
        effectiveDate: {
          lte: target,
        },
      },
      orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
    })
  );

  if (!row) return null;

  return {
    rate: row.newRate,
    effectiveDate: row.effectiveDate,
  };
}

export async function upsertBusinessRate(params: {
  changedBy: number;
  newRate: number;
  effectiveDate?: Date;
  comment?: string;
}) {
  const effective = getPreviousOrCurrentMonday(params.effectiveDate ?? new Date());
  const current = await getCurrentBusinessRate(effective);
  const oldRate = current?.rate ?? params.newRate;

  const row = await withDbRetry(() =>
    prisma.rateHistory.create({
      data: {
        changedBy: params.changedBy,
        oldRate,
        newRate: params.newRate,
        effectiveDate: effective,
        comment: params.comment ?? null,
      },
    })
  );
  invalidateRateHistoryRowsCache();
  return row;
}
