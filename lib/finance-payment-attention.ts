/** Роль списка операций (`DashboardOperationsHistory` / `FinanceOperationsSubFeed`). */
export type FinanceOperationsHistoryScope = "investor" | "owner";

/** Выплата ожидает действия текущего пользователя по этой роли (строку имеет смысл открыть). */
export function paymentNeedsViewerAction(scope: FinanceOperationsHistoryScope, status: string): boolean {
  if (scope === "investor") return status === "approved_waiting_accept";
  return status === "requested" || status === "pending";
}

export function paymentAttentionBadgeLabel(scope: FinanceOperationsHistoryScope): string {
  return scope === "investor" ? "Ваш шаг" : "Решение";
}
