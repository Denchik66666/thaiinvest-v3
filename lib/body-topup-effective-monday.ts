/**
 * «Первый понедельник после дня D» в UTC (полдень), где D — календарный день момента `ref`.
 * Используется для подписи «вступление в силу / старт цикла» в карточке пополнения тела.
 */
export function utcNoonNextMondayAfterCalendarDayContaining(ref: Date): Date {
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  const d = ref.getUTCDate();
  const cur = new Date(Date.UTC(y, m, d + 1, 12, 0, 0, 0));
  for (let i = 0; i < 10; i++) {
    if (cur.getUTCDay() === 1) return cur;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return cur;
}
