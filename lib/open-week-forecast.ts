import { getPreviousOrCurrentMonday, startOfDay } from "@/lib/weekly";

/** Доля текущей открытой недели (как в `lib/business-rate-accrual-recalc.ts`). */
export function openWeekDayProgress(now = new Date()) {
  const weekStart = getPreviousOrCurrentMonday(now);
  const weekMonSod = startOfDay(weekStart);
  const todaySod = startOfDay(now);
  let daySpan =
    Math.floor((todaySod.getTime() - weekMonSod.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  if (daySpan < 1) daySpan = 1;
  if (daySpan > 7) daySpan = 7;
  return { weekStart, daySpan, frac: daySpan / 7 };
}

/**
 * Грязное прогнозное начисление за текущую открытую неделю (до вычета выплат за неделю),
 * по той же схеме, что и пересчёт: body × (applied/4)% × (день/7).
 */
export function sumExpectedOpenWeekAccrualGross(
  positions: { body: number; isPrivate: boolean }[],
  networkWeeklyPercent: number | null,
  now = new Date()
): number | null {
  if (networkWeeklyPercent == null || !Number.isFinite(networkWeeklyPercent)) return null;
  const { frac } = openWeekDayProgress(now);
  let sum = 0;
  for (const p of positions) {
    const body = p.body || 0;
    if (body <= 0) continue;
    const applied = p.isPrivate ? networkWeeklyPercent / 2 : networkWeeklyPercent;
    const weeklyRatePercent = applied / 4;
    sum += body * (weeklyRatePercent / 100) * frac;
  }
  return sum;
}

/** Полное начисление за текущую открытую неделю (к понедельнику закрытия), без доли «день/7». */
export function sumExpectedFullOpenWeekAccrualGross(
  positions: { body: number; isPrivate: boolean }[],
  networkWeeklyPercent: number | null
): number | null {
  if (networkWeeklyPercent == null || !Number.isFinite(networkWeeklyPercent)) return null;
  let sum = 0;
  for (const p of positions) {
    const body = p.body || 0;
    if (body <= 0) continue;
    const applied = p.isPrivate ? networkWeeklyPercent / 2 : networkWeeklyPercent;
    const weeklyRatePercent = applied / 4;
    sum += body * (weeklyRatePercent / 100);
  }
  return sum;
}

export function isSameOpenWeekAsNow(weekStartIso: string, now = new Date()): boolean {
  const rowMon = startOfDay(getPreviousOrCurrentMonday(new Date(weekStartIso)));
  const curMon = startOfDay(getPreviousOrCurrentMonday(now));
  return rowMon.getTime() === curMon.getTime();
}
