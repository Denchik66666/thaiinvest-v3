/** Корень queryKey для списков инвесторов (см. invalidateQueries `["investors"]`). */
export const INVESTORS_LIST_QUERY_ROOT = "investors" as const;

/**
 * Единый ключ и параметр `network` для дашборда и NotificationBell,
 * чтобы React Query не дублировал один и тот же ответ API.
 * Третий сегмент `summary` — ответ с `?lean=1` (без полной истории платежей), отличный от «Отчётов».
 */
export function investorsDashboardListQueryKey(
  role: string | undefined
): readonly [typeof INVESTORS_LIST_QUERY_ROOT, string, "summary" | "full"] {
  if (role === "OWNER") return [INVESTORS_LIST_QUERY_ROOT, "common", "summary"] as const;
  if (role === "INVESTOR") return [INVESTORS_LIST_QUERY_ROOT, "all", "full"] as const;
  return [INVESTORS_LIST_QUERY_ROOT, "all", "summary"] as const;
}

export function investorsDashboardNetworkParam(role: string | undefined): string {
  return role === "OWNER" ? "common" : "all";
}
