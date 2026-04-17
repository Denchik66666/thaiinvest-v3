export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getWeekStartMonday(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function getNextMonday(date: Date): Date {
  const weekStart = getWeekStartMonday(date);
  const isMonday = startOfDay(date).getTime() === weekStart.getTime();
  if (isMonday) return weekStart;

  const next = new Date(weekStart);
  next.setDate(next.getDate() + 7);
  return next;
}

export function getPreviousOrCurrentMonday(date: Date): Date {
  return getWeekStartMonday(date);
}

export function countFullWeeksBetween(fromMonday: Date, toMonday: Date): number {
  const from = startOfDay(fromMonday);
  const to = startOfDay(toMonday);
  const diffMs = to.getTime() - from.getTime();
  if (diffMs <= 0) return 0;

  return Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
}
