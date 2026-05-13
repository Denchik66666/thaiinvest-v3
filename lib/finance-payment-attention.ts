/** Роль списка операций (`DashboardOperationsHistory` / `FinanceOperationsSubFeed`). */
export type FinanceOperationsHistoryScope = "investor" | "owner";

/**
 * Выплата ожидает **действия** текущего пользователя (подсветка строки, title, кнопки в модалке).
 * Для очереди «Требуют действия» у инвестора см. `financeOperationInActionQueue` — там также показываются
 * заявки на рассмотрении у владельца (`requested` / `pending`), без обязательного действия инвестора.
 */
export function paymentNeedsViewerAction(scope: FinanceOperationsHistoryScope, status: string): boolean {
  if (scope === "investor") return status === "approved_waiting_accept";
  return status === "requested" || status === "pending";
}

/** Чип в блоке «Требуют действия» для строки выплаты. */
export function paymentPendingQueueBadge(scope: FinanceOperationsHistoryScope, status: string): string {
  if (scope === "investor") {
    if (status === "approved_waiting_accept") return "Ваш шаг";
    if (status === "requested" || status === "pending") return "У владельца";
    return "Заявка";
  }
  return "Решение";
}

/** Позиции, где текущий пользователь — инвестор по учётке или по привязке `linkedUser`. */
export function buildBodyTopupAddresseeInvestorIds(
  viewerUserId: number,
  investors: Iterable<{ id: number; investorUserId?: number | null; linkedUserId?: number | null }>
): ReadonlySet<number> {
  const s = new Set<number>();
  for (const inv of investors) {
    if (inv.investorUserId === viewerUserId || inv.linkedUserId === viewerUserId) s.add(inv.id);
  }
  return s;
}

/** Заявка BodyTopUpRequest ждёт «да/нет» от инвестора по позиции (не начальное тело при создании). */
export function bodyTopUpAwaitingInvestorDecision(item: {
  status: string;
  initialFromCreation?: boolean;
}): boolean {
  return !item.initialFromCreation && item.status === "pending_investor";
}

/**
 * `addresseeInvestorIds == null` — не фильтруем (обратная совместимость: одна позиция / старые вызовы).
 * Пустой Set — ни одна позиция не «моя» (например SUPER_ADMIN без привязки).
 */
export function topupViewerIsAddressee(investorId: number, addresseeInvestorIds: ReadonlySet<number> | null): boolean {
  if (addresseeInvestorIds == null) return true;
  return addresseeInvestorIds.has(investorId);
}

/**
 * Пополнение тела по заявке: подсветка «ожидает решения» и клик для инвестора / владельца.
 * Для `scope === "investor"` учитывается, что подтвердить может только адресат позиции.
 */
export function topupNeedsViewerAction(
  scope: FinanceOperationsHistoryScope,
  item: { status: string; initialFromCreation?: boolean; investorId: number },
  addresseeInvestorIds?: ReadonlySet<number> | null
): boolean {
  if (!bodyTopUpAwaitingInvestorDecision(item)) return false;
  if (scope === "owner") return true;
  return topupViewerIsAddressee(item.investorId, addresseeInvestorIds ?? null);
}

/** Визуальный акцент строки: любая заявка в `pending_investor` (жёлтый фон), даже если решение не ваше. */
export function bodyTopUpRowNeedsPendingHighlight(item: {
  status: string;
  initialFromCreation?: boolean;
}): boolean {
  return bodyTopUpAwaitingInvestorDecision(item);
}

/** Первая часть подписи в ленте (до даты). */
export function bodyTopUpPendingStatusPhrase(
  scope: FinanceOperationsHistoryScope,
  investorId: number,
  positionName: string,
  addresseeInvestorIds: ReadonlySet<number> | null
): string {
  if (scope === "investor" && topupViewerIsAddressee(investorId, addresseeInvestorIds)) {
    return "Ожидает вашего решения";
  }
  if (scope === "owner") {
    return `Ожидает подтверждения · ${positionName}`;
  }
  const short = positionName.length > 18 ? `${positionName.slice(0, 16)}…` : positionName;
  return `Ожидает инвестора · ${short}`;
}

export function bodyTopUpAttentionBadgeLabel(
  scope: FinanceOperationsHistoryScope,
  investorId: number,
  positionName: string,
  addresseeInvestorIds: ReadonlySet<number> | null
): string {
  if (scope === "owner") return "У инвестора";
  if (topupViewerIsAddressee(investorId, addresseeInvestorIds)) return "Ваш шаг";
  const short = positionName.length > 14 ? `${positionName.slice(0, 12)}…` : positionName;
  return `Ждёт: ${short}`;
}

export function paymentAttentionBadgeLabel(scope: FinanceOperationsHistoryScope): string {
  return scope === "investor" ? "Ваш шаг" : "Решение";
}
