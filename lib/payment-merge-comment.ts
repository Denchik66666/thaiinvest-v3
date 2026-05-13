/** Дописывает блок к комментарию заявки (как в /api/payments). */
export function mergePaymentComment(existing: string | null | undefined, extra: string): string | null {
  const e = (existing ?? "").trim();
  const x = extra.trim();
  if (!x) return existing ?? null;
  if (!e) return x;
  return `${e}\n---\n${x}`;
}
