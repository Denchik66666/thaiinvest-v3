/** Роль списка операций (`DashboardOperationsHistory` / `FinanceOperationsSubFeed`). */
export type FinanceOperationsHistoryScope = "investor" | "owner";

/** Выплата ожидает действия текущего пользователя по этой роли (строку имеет смысл открыть). */
export function paymentNeedsViewerAction(scope: FinanceOperationsHistoryScope, status: string): boolean {
  if (scope === "investor") return status === "approved_waiting_accept";
  return status === "requested" || status === "pending";
}

/**
 * Пополнение тела по заявке: инвестор подтверждает / отклоняет; владелец видит ту же «заявку» и может отозвать.
 * В ленте — тот же бейдж и акцент, что у выплат в этом scope.
 */
export function topupNeedsViewerAction(
  scope: FinanceOperationsHistoryScope,
  item: { status: string; initialFromCreation?: boolean }
): boolean {
  if (item.initialFromCreation) return false;
  if (item.status !== "pending_investor") return false;
  return scope === "investor" || scope === "owner";
}

export function paymentAttentionBadgeLabel(scope: FinanceOperationsHistoryScope): string {
  return scope === "investor" ? "Ваш шаг" : "Решение";
}
