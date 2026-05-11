import { getPreviousOrCurrentMonday, startOfDay } from "@/lib/weekly";

/** Доля текущей открытой недели (дни с понедельника / 7) — шкала недели на дашборде. */
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

/** Ожидаемые проценты за полную текущую неделю по позиции: `body × (ставка/4)%`, округление до целого бата. */
export function expectedWeeklyInterestBahtRounded(
  body: number,
  isPrivate: boolean,
  networkWeeklyPercent: number
): number {
  const b = body || 0;
  if (b <= 0) return 0;
  const applied = isPrivate ? networkWeeklyPercent / 2 : networkWeeklyPercent;
  const weeklyRatePercent = applied / 4;
  return Math.round(b * (weeklyRatePercent / 100));
}

/**
 * Сумма прогноза «Ожидается» за текущую неделю по нескольким позициям:
 * для каждой — `body × (применимая ставка / 4)%`, затем **целое** по позиции, потом сумма.
 */
export function sumExpectedFullOpenWeekAccrualRounded(
  positions: { body: number; isPrivate: boolean }[],
  networkWeeklyPercent: number | null
): number | null {
  if (networkWeeklyPercent == null || !Number.isFinite(networkWeeklyPercent)) return null;
  let sum = 0;
  for (const p of positions) {
    sum += expectedWeeklyInterestBahtRounded(p.body, p.isPrivate, networkWeeklyPercent);
  }
  return sum;
}

export function isSameOpenWeekAsNow(weekStartIso: string, now = new Date()): boolean {
  const rowMon = startOfDay(getPreviousOrCurrentMonday(new Date(weekStartIso)));
  const curMon = startOfDay(getPreviousOrCurrentMonday(now));
  return rowMon.getTime() === curMon.getTime();
}
