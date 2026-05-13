/**
 * Дата YYYY-MM-DD из формы: один календарный день в UTC (полдень),
 * без сдвига из‑за полуночи UTC при `new Date("YYYY-MM-DD")`.
 */
export function parseCalendarDateOnlyYmd(isoDate: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  if (!Number.isFinite(y) || mo < 0 || mo > 11 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo, d, 12, 0, 0, 0));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo || dt.getUTCDate() !== d) return null;
  return dt;
}
