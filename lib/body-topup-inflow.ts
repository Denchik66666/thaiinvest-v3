/**
 * Приток тела по заявке BodyTopUpRequest: в БД деньги на `Investor.body` попадают только после принятия инвестором.
 * Отозванные владельцем, отклонённые инвестором и ожидающие решения в «рост за период» не входят.
 */
export function bodyTopUpRequestCountedAsInflow(status: string): boolean {
  return status === "accepted_by_investor";
}
