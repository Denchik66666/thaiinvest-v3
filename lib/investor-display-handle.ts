/**
 * Канон публичного ника/аватара позиции в UI: `handle` / `investorUser` / `linkedUser` (см. `investorDisplayHandle`).
 *
 * Handle для UI: без ведущих «@» (в БД и вводе иногда оставляют префикс как в соцсетях).
 */
export function normalizeHandleDisplay(value: string | null | undefined): string | null {
  if (value == null) return null;
  const s = String(value).trim().replace(/^@+/, "");
  return s.length ? s : null;
}

/**
 * Публичный ник позиции в UI: **тот же**, что у аккаунта пользователя, если позиция привязана к кабинету.
 * Порядок: логин инвестора → логин привязанного пользователя (личная / общая сеть) → только потом `handle`
 * позиции (если кабинета нет — устаревшее поле не перебивает актуальный логин).
 */
export function investorDisplayHandle(inv: {
  handle?: string | null;
  investorUser?: { username: string } | null;
  linkedUser?: { username: string } | null;
}): string | null {
  const uInv = inv.investorUser?.username?.trim();
  if (uInv) return uInv;
  const uLinked = inv.linkedUser?.username?.trim();
  if (uLinked) return uLinked;
  return normalizeHandleDisplay(inv.handle);
}
