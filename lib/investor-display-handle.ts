/**
 * Подпись/ник для UI позиции: явный handle → логин инвестора → ник привязанного SUPER_ADMIN (личная сеть).
 */
export function investorDisplayHandle(inv: {
  handle?: string | null;
  investorUser?: { username: string } | null;
  linkedUser?: { username: string } | null;
}): string | null {
  const h = inv.handle?.trim();
  if (h) return h;
  const u = inv.investorUser?.username?.trim();
  if (u) return u;
  return inv.linkedUser?.username?.trim() || null;
}
