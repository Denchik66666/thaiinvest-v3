import type { FinanceOperationItem } from "@/types/finance-operations";

/**
 * Отбор позиций инвесторов для тяжёлых запросов (SUPER_ADMIN, `network=all` без сужения).
 * Клиенты, которым нужен полный охват, должны передать `investorId` / `ids` или другую сеть.
 */
export type FinanceInvestorSelectionMeta = {
  investorPositions: {
    /** Есть позиции за пределами ответа (запрошено limit+1, «лишняя» отброшена). */
    moreAvailable: boolean;
    /** Сколько позиций вошло в расчёт ответа. */
    included: number;
    /** Максимум позиций в одном запросе (см. SUPER_ADMIN_FINANCE_MAX_POSITIONS). */
    limit: number;
    /** Порядок отбора перед усечением. */
    orderBy: "updatedAt_desc";
  };
};

export type OperationsHistoryResponse = {
  items: FinanceOperationItem[];
  meta?: { investorSelection: FinanceInvestorSelectionMeta };
};

/** `topupInflow` — начальное тело в периоде + принятые пополнения в периоде (для бейджа при фильтре «Тело»). */
export type OperationsSummaryRow = {
  growth: number;
  paidOut: number;
  openRequests: number;
  topupInflow: number;
};

export type OperationsSummaryResponse = {
  byInvestorId: Record<string, OperationsSummaryRow>;
  meta?: { investorSelection: FinanceInvestorSelectionMeta };
};
