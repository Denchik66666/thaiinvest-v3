/**
 * Лимит позиций для SUPER_ADMIN при `network=all` без сужения (`investorId` / `ids`).
 * Иначе один запрос тянет всю таблицу `Investor` и связанные `Payment` — риск таймаутов на pooler.
 *
 * Сервер запрашивает `limit + 1` строк, помечает `meta.investorSelection` и заголовок
 * `X-Thaiinvest-Investor-Selection-Partial`, если данных больше лимита.
 *
 * Env: `SUPER_ADMIN_FINANCE_MAX_POSITIONS` (50…10000), по умолчанию 500.
 */
export function superAdminFinanceMaxPositions(): number {
  const raw = process.env.SUPER_ADMIN_FINANCE_MAX_POSITIONS;
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(n)) return 500;
  return Math.min(10_000, Math.max(50, Math.floor(n)));
}
