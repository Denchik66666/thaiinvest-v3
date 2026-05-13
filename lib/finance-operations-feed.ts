import type { FinanceOperationItem } from "@/types/finance-operations";
import type { FinanceOperationsHistoryScope } from "@/lib/finance-payment-attention";
import {
  bodyTopUpAwaitingInvestorDecision,
  paymentNeedsViewerAction,
  topupViewerIsAddressee,
} from "@/lib/finance-payment-attention";

/** Статусы выплат, при которых заявка ещё «жива» и ждёт шага процесса. */
const ACTIVE_PAYMENT_STATUSES = new Set(["requested", "pending", "approved_waiting_accept"]);

/** Выплата попала в учётные итоги / финальна для ленты «история». */
export function isTerminalPaymentStatus(status: string): boolean {
  return !ACTIVE_PAYMENT_STATUSES.has(status);
}

/** Строка для ленты «только завершённые проводки» (недели + терминальные выплаты + терминальные пополнения). */
export function isTerminalFinanceOperation(item: FinanceOperationItem): boolean {
  if (item.kind === "week_accrual") return true;
  if (item.kind === "payment") return isTerminalPaymentStatus(item.status);
  if (item.kind === "topup") {
    if (item.initialFromCreation) return true;
    return item.status !== "pending_investor";
  }
  return true;
}

/**
 * Незавершённая операция, которую имеет смысл показывать в блоке «Требуют действия»
 * для текущего scope и набора позиций пополнения (addressee).
 */
export function financeOperationInActionQueue(
  item: FinanceOperationItem,
  scope: FinanceOperationsHistoryScope,
  bodyTopupAddresseeIds: ReadonlySet<number> | null
): boolean {
  if (isTerminalFinanceOperation(item)) return false;
  if (item.kind === "payment") {
    if (scope === "investor") {
      /** Все нетерминальные выплаты по позициям инвестора — и ожидание владельца, и шаг инвестора после одобрения. */
      return !isTerminalPaymentStatus(item.status);
    }
    return paymentNeedsViewerAction(scope, item.status);
  }
  if (item.kind === "topup") {
    if (!bodyTopUpAwaitingInvestorDecision(item)) return false;
    if (scope === "owner") return true;
    return topupViewerIsAddressee(item.investorId, bodyTopupAddresseeIds);
  }
  return false;
}

export function sortFinanceOpsBySortAtDesc(items: FinanceOperationItem[]): FinanceOperationItem[] {
  return [...items].sort((a, b) => +new Date(b.sortAt) - +new Date(a.sortAt));
}
