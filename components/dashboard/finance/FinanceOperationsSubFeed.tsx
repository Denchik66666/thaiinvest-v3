"use client";

/**
 * Лента операций под аккордеоном позиции (Финансы владельца).
 * Дублирует запрос и строки с основным блоком — общий кеш React Query по ключу investorId.
 */
import type { KeyboardEvent } from "react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Banknote, Percent, PlusCircle } from "lucide-react";

import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { isSameOpenWeekAsNow } from "@/lib/open-week-forecast";
import type { FinanceOperationItem } from "@/types/finance-operations";
import type { OperationsHistoryResponse } from "@/types/operations-finance-api";
import { FinanceInvestorSelectionTruncationNotice } from "@/components/dashboard/finance/FinanceInvestorSelectionTruncationNotice";
import type { FinanceOperationsHistoryOpFilter } from "@/types/finance-operations-filter";
import { Text } from "@/components/ui/Text";
import { sortAtInHistoryPeriod, type HistoryPeriodValue } from "@/components/dashboard/HistoryPeriodPopover";
import {
  paymentAttentionBadgeLabel,
  paymentNeedsViewerAction,
  topupNeedsViewerAction,
} from "@/lib/finance-payment-attention";

export type FinanceOpFilter = FinanceOperationsHistoryOpFilter;

const PAGE_FIRST = 8;
const PAGE_MORE = 40;
const SHOW_ALL_HISTORY_CAP = Number.MAX_SAFE_INTEGER;

function opMatchesFilter(item: FinanceOperationItem, f: FinanceOpFilter): boolean {
  if (f === "all") return true;
  if (f === "accrual") return item.kind === "week_accrual";
  if (f === "topup") return item.kind === "topup";
  if (f === "payout") return item.kind === "payment" && item.status === "completed";
  if (f === "request") {
    if (item.kind === "payment" && item.status !== "completed") return true;
    if (item.kind === "topup" && !item.initialFromCreation && item.status === "pending_investor") return true;
    return false;
  }
  return false;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPaymentHistorySubline(item: Extract<FinanceOperationItem, { kind: "payment" }>) {
  const st = paymentStatusShort(item.status);
  const created = formatDateTime(item.createdAt);
  if (item.status === "completed" && item.acceptedAt) {
    return `${st} · заявка ${created} · завершено ${formatDateTime(item.acceptedAt)}`;
  }
  return `${st} · ${created}`;
}

function paymentTypeLabel(type: string) {
  if (type === "interest") return "Проценты";
  if (type === "body") return "Вывод тела";
  if (type === "close") return "Закрытие позиции";
  return type;
}

function paymentStatusShort(status: string) {
  const map: Record<string, string> = {
    completed: "Выполнено",
    requested: "На рассмотрении у владельца",
    pending: "В очереди",
    /** Владелец одобрил; завершится после «Принять» инвестором — не зависание на стороне владельца. */
    approved_waiting_accept: "Одобрено — ждём инвестора",
    rejected: "Отклонено",
    expired: "Истекло",
    disputed: "Спор",
    completed_at_creation: "При создании позиции",
    pending_investor: "Ожидает решения инвестора",
    accepted_by_investor: "Принято инвестором",
    rejected_by_investor: "Отклонено инвестором",
    cancelled_by_owner: "Отозвано владельцем",
  };
  return map[status] ?? status;
}

function formatTopUpHistorySubline(item: Extract<FinanceOperationItem, { kind: "topup" }>) {
  if (item.initialFromCreation) {
    return `${paymentStatusShort(item.status)} · вх. ${formatDate(item.entryDate ?? item.sortAt)}`;
  }
  const when = item.requestDate ?? item.createdAt;
  return `${paymentStatusShort(item.status)} · ${formatDateTime(when)}`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function formatAmount(num: number) {
  if (!num) return "0";
  return Number(num).toLocaleString("ru-RU");
}

function formatNetworkWeeklyRate(p: number | undefined) {
  if (p == null || Number.isNaN(p)) return null;
  const s = new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(p);
  return `${s}% / нед`;
}

function operationRowInteractiveProps(
  onOperationClick: ((item: FinanceOperationItem) => void) | undefined,
  item: FinanceOperationItem,
  operationRowPredicate?: (item: FinanceOperationItem) => boolean
) {
  if (!onOperationClick) return {};
  if (operationRowPredicate && !operationRowPredicate(item)) return {};
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: () => onOperationClick(item),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onOperationClick(item);
      }
    },
  };
}

function operationRowPointerCn(
  onOperationClick: ((item: FinanceOperationItem) => void) | undefined,
  item: FinanceOperationItem,
  operationRowPredicate?: (item: FinanceOperationItem) => boolean
) {
  const clickable = Boolean(onOperationClick) && (!operationRowPredicate || operationRowPredicate(item));
  return clickable
    ? "cursor-pointer hover:bg-muted/15 active:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
    : "";
}

export type FinanceOperationsSubFeedProps = {
  operationsHistoryScope: "investor" | "owner";
  filterInvestorId: number | null;
  /** SUPER_ADMIN: при ленте «вся сеть» передать common/private/all — см. GET operations-history. */
  superAdminNetwork?: "common" | "private" | "all" | null;
  periodValue: HistoryPeriodValue;
  opFilter: FinanceOpFilter;
  financePageScroll: boolean;
  showMultiPositionLabels: boolean;
  enabled: boolean;
  onOperationClick?: (item: FinanceOperationItem) => void;
  operationRowPredicate?: (item: FinanceOperationItem) => boolean;
};

export function FinanceOperationsSubFeed({
  operationsHistoryScope,
  filterInvestorId,
  superAdminNetwork = null,
  periodValue,
  opFilter,
  financePageScroll,
  showMultiPositionLabels,
  enabled,
  onOperationClick,
  operationRowPredicate,
}: FinanceOperationsSubFeedProps) {
  const [visibleCap, setVisibleCap] = useState(SHOW_ALL_HISTORY_CAP);

  const investorHistoryKey = filterInvestorId != null ? filterInvestorId : "all";
  const networkSeg = superAdminNetwork ?? "-";

  const { data: opsData, isLoading: opsLoading } = useQuery({
    queryKey: ["investors", "operations-history", operationsHistoryScope, investorHistoryKey, networkSeg] as const,
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterInvestorId != null && Number.isFinite(filterInvestorId)) {
        params.set("investorId", String(filterInvestorId));
      } else if (superAdminNetwork) {
        params.set("network", superAdminNetwork);
      }
      const qs = params.toString();
      return apiClient.get<OperationsHistoryResponse>(
        qs ? `/api/investors/operations-history?${qs}` : "/api/investors/operations-history"
      );
    },
    enabled,
    staleTime: 45_000,
    refetchInterval: enabled ? 60_000 : false,
  });

  const allOps = useMemo(() => opsData?.items ?? [], [opsData?.items]);

  const periodFiltered = useMemo(
    () => allOps.filter((op) => sortAtInHistoryPeriod(op.sortAt, periodValue)),
    [allOps, periodValue]
  );

  const filteredOps = useMemo(
    () => periodFiltered.filter((i) => opMatchesFilter(i, opFilter)),
    [periodFiltered, opFilter]
  );

  const visibleOps = useMemo(
    () => (financePageScroll ? filteredOps : filteredOps.slice(0, visibleCap)),
    [financePageScroll, filteredOps, visibleCap]
  );

  const isBusy = opsLoading && !opsData;

  function handlePagingClick() {
    if (visibleCap >= filteredOps.length) {
      setVisibleCap(PAGE_FIRST);
      return;
    }
    if (visibleCap === PAGE_FIRST) {
      setVisibleCap(Math.min(PAGE_MORE, filteredOps.length));
      return;
    }
    setVisibleCap(filteredOps.length);
  }

  const pagingLabel =
    filteredOps.length <= PAGE_FIRST
      ? ""
      : visibleCap >= filteredOps.length
        ? `Свернуть до ${PAGE_FIRST}`
        : visibleCap === PAGE_FIRST
          ? `Показать ещё (${Math.min(filteredOps.length, PAGE_MORE) - PAGE_FIRST})`
          : `Показать все (+${filteredOps.length - visibleCap})`;

  return (
    <div
      data-finance-sub-feed
      data-finance-sub-feed-investor={filterInvestorId ?? ""}
      className={cn(
        "overflow-hidden rounded-b-xl rounded-t-none border border-t-0 border-primary/15 bg-gradient-to-b from-primary/[0.06] to-muted/5 dark:border-white/[0.08] dark:from-primary/[0.05]"
      )}
    >
      <div
        className={cn(
          financePageScroll ? "overflow-visible" : "thai-dashboard-history-scroll max-h-[min(55vh,420px)] overflow-y-auto"
        )}
      >
        <FinanceInvestorSelectionTruncationNotice investorSelection={opsData?.meta?.investorSelection} />
        {isBusy ? (
          <div className="divide-y divide-border/15 bg-background/15 px-2 py-3 dark:bg-background/12">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2 py-2">
                <div className="h-8 w-8 shrink-0 rounded-full bg-muted/35" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="h-3 max-w-[10rem] rounded bg-muted/35" />
                  <div className="h-2.5 max-w-[12rem] rounded bg-muted/25" />
                </div>
              </div>
            ))}
          </div>
        ) : visibleOps.length > 0 ? (
          <div
            className="divide-y divide-border/15"
            style={{
              background: "color-mix(in srgb, var(--thai-color-card-bg) 38%, transparent)",
            }}
          >
            {visibleOps.map((item) => {
              if (item.kind === "week_accrual") {
                const settled = item.paidTotal > 0;
                const rateLabel = formatNetworkWeeklyRate(item.networkRatePercent);
                const isOpenWeek = isSameOpenWeekAsNow(item.weekStart);
                const accrualPreviewGold = item.accrued === 0 && (item.syntheticOpen || isOpenWeek);
                return (
                  <div
                    key={item.id}
                    {...operationRowInteractiveProps(onOperationClick, item, operationRowPredicate)}
                    className={cn(
                      "flex items-center gap-2 px-2 py-2 transition-colors hover:bg-muted/10",
                      operationRowPointerCn(onOperationClick, item, operationRowPredicate),
                      item.syntheticOpen ? "bg-muted/10" : undefined
                    )}
                    style={
                      item.syntheticOpen
                        ? undefined
                        : { background: "color-mix(in srgb, var(--thai-color-accrued-bg) 65%, transparent)" }
                    }
                  >
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background/50"
                      style={{
                        borderColor: settled
                          ? "color-mix(in srgb, var(--thai-color-paid) 45%, transparent)"
                          : "color-mix(in srgb, var(--thai-color-accrued) 42%, transparent)",
                      }}
                      aria-hidden
                    >
                      <Percent
                        className="h-4 w-4 shrink-0"
                        strokeWidth={2}
                        style={{
                          color: settled ? "var(--thai-color-paid)" : "var(--thai-color-accrued)",
                          opacity: 0.92,
                        }}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-semibold tabular-nums text-foreground">
                        Начисление · {formatDate(item.weekStart)} — {formatDate(item.weekEnd)}
                      </div>
                      <div className="truncate text-[10px] leading-snug text-muted-foreground">
                        {rateLabel ? <>Сеть {rateLabel}</> : <>Ставка —</>}
                        <span className="px-1 text-border/80">·</span>
                        <span
                          className="font-medium"
                          style={{ color: settled ? "var(--thai-color-paid)" : "var(--thai-color-accrued)" }}
                        >
                          {settled ? "Есть выплаты" : "Без выплат"}
                        </span>
                      </div>
                      {item.syntheticOpen || (isOpenWeek && item.accrued === 0) ? (
                        <Text className="mt-0.5 text-[9px] leading-snug text-muted-foreground">
                          Неделя открыта · в ленте +0 до ПН
                        </Text>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right leading-tight">
                      <div
                        className={cn(
                          "text-[12px] font-semibold tabular-nums",
                          accrualPreviewGold && "thai-dashboard-premium-gold-amount"
                        )}
                        style={
                          accrualPreviewGold
                            ? undefined
                            : {
                                color: "var(--thai-color-accrued)",
                                WebkitTextFillColor: "var(--thai-color-accrued)",
                              }
                        }
                      >
                        +{formatAmount(item.accrued)} ฿
                      </div>
                      {item.paidTotal > 0 ? (
                        <div
                          className="text-[10px] font-medium tabular-nums"
                          style={{
                            color: "var(--thai-color-paid)",
                            WebkitTextFillColor: "var(--thai-color-paid)",
                          }}
                        >
                          выпл. {formatAmount(item.paidTotal)}
                        </div>
                      ) : (
                        <div className="text-[9px] text-muted-foreground">—</div>
                      )}
                    </div>
                  </div>
                );
              }

              if (item.kind === "topup") {
                const subline = formatTopUpHistorySubline(item);
                const needsTopUpAction = topupNeedsViewerAction(operationsHistoryScope, item);
                const rowClickableTopUp =
                  Boolean(onOperationClick) && (!operationRowPredicate || operationRowPredicate(item));
                const attentionTitleTopUp = needsTopUpAction
                  ? rowClickableTopUp
                    ? operationsHistoryScope === "investor"
                      ? "Откройте строку: подтвердите или отклоните пополнение тела"
                      : "Откройте строку: отзовите запрос или откройте карточку заявки"
                    : operationsHistoryScope === "investor"
                      ? "Финансы: откройте эту строку, чтобы подтвердить или отклонить пополнение"
                      : "Финансы: откройте эту строку по запросу пополнения"
                  : undefined;
                const topUpPendingRequest =
                  !item.initialFromCreation && item.status === "pending_investor";
                return (
                  <div
                    key={item.id}
                    {...operationRowInteractiveProps(onOperationClick, item, operationRowPredicate)}
                    title={attentionTitleTopUp}
                    data-finance-history-attention={needsTopUpAction ? "action" : undefined}
                    className={cn(
                      "flex items-center gap-2 px-2 py-2 transition-colors hover:bg-muted/10",
                      operationRowPointerCn(onOperationClick, item, operationRowPredicate),
                      needsTopUpAction &&
                        "border-l-[3px] border-l-amber-500/85 bg-amber-500/[0.07] dark:border-l-amber-400/80 dark:bg-amber-400/[0.09]"
                    )}
                    style={
                      needsTopUpAction ? undefined : { background: "var(--thai-color-topup-bg)" }
                    }
                  >
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background/50"
                      style={{
                        borderColor: needsTopUpAction
                          ? "color-mix(in srgb, rgb(245 158 11) 55%, transparent)"
                          : "color-mix(in srgb, var(--thai-color-topup) 45%, transparent)",
                      }}
                      aria-hidden
                    >
                      <PlusCircle
                        className="h-4 w-4 shrink-0 text-[var(--thai-color-topup)]"
                        strokeWidth={2}
                        style={
                          needsTopUpAction
                            ? { color: "rgb(245 158 11)", opacity: 0.92 }
                            : undefined
                        }
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[12px] font-semibold text-foreground">
                          {showMultiPositionLabels ? `Пополнение · ${item.positionName}` : "Пополнение тела"}
                        </span>
                        {needsTopUpAction ? (
                          <span className="inline-flex shrink-0 rounded border border-amber-500/45 bg-amber-500/14 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-amber-950 dark:text-amber-100">
                            {paymentAttentionBadgeLabel(operationsHistoryScope)}
                          </span>
                        ) : null}
                      </div>
                      <div className="line-clamp-2 text-[10px] text-muted-foreground">{subline}</div>
                    </div>
                    <div className="shrink-0 text-right leading-tight">
                      <div
                        className="text-[12px] font-semibold tabular-nums"
                        style={{ color: "var(--thai-color-topup)", WebkitTextFillColor: "var(--thai-color-topup)" }}
                      >
                        +{formatAmount(item.amount)}
                      </div>
                      {topUpPendingRequest ? (
                        <div className="text-[9px] text-muted-foreground">заявка</div>
                      ) : null}
                    </div>
                  </div>
                );
              }

              const isOut = item.status === "completed";
              const needsAction = paymentNeedsViewerAction(operationsHistoryScope, item.status);
              const rowClickable =
                Boolean(onOperationClick) && (!operationRowPredicate || operationRowPredicate(item));
              const attentionTitle = needsAction
                ? rowClickable
                  ? operationsHistoryScope === "investor"
                    ? "Откройте строку: подтвердите или отклоните выплату"
                    : "Откройте строку: одобрите или отклоните заявку"
                  : operationsHistoryScope === "investor"
                    ? "Финансы: откройте эту операцию в списке, чтобы подтвердить или отклонить выплату"
                    : "Финансы: откройте эту операцию в списке для решения по заявке"
                : undefined;
              return (
                <div
                  key={item.id}
                  {...operationRowInteractiveProps(onOperationClick, item, operationRowPredicate)}
                  title={attentionTitle}
                  data-finance-history-attention={needsAction ? "action" : undefined}
                  className={cn(
                    "flex items-center gap-2 px-2 py-2 transition-colors hover:bg-muted/10",
                    operationRowPointerCn(onOperationClick, item, operationRowPredicate),
                    needsAction &&
                      "border-l-[3px] border-l-amber-500/85 bg-amber-500/[0.07] dark:border-l-amber-400/80 dark:bg-amber-400/[0.09]"
                  )}
                >
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background/50"
                    style={{
                      borderColor: isOut
                        ? "color-mix(in srgb, var(--thai-color-history-outflow) 45%, transparent)"
                        : needsAction
                          ? "color-mix(in srgb, rgb(245 158 11) 55%, transparent)"
                          : "color-mix(in srgb, var(--thai-color-due) 42%, transparent)",
                    }}
                    aria-hidden
                  >
                    <Banknote
                      className="h-4 w-4 shrink-0"
                      strokeWidth={2}
                      style={{
                        color: isOut ? "var(--thai-color-history-outflow)" : needsAction ? "rgb(245 158 11)" : "var(--thai-color-due)",
                        opacity: 0.92,
                      }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[12px] font-semibold text-foreground">
                        {showMultiPositionLabels ? `${paymentTypeLabel(item.type)} · ${item.positionName}` : paymentTypeLabel(item.type)}
                      </span>
                      {needsAction ? (
                        <span className="inline-flex shrink-0 rounded border border-amber-500/45 bg-amber-500/14 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-amber-950 dark:text-amber-100">
                          {paymentAttentionBadgeLabel(operationsHistoryScope)}
                        </span>
                      ) : null}
                    </div>
                    <div className="line-clamp-2 text-[10px] text-muted-foreground">{formatPaymentHistorySubline(item)}</div>
                  </div>
                  <div className="shrink-0 text-right leading-tight">
                    <div
                      className="text-[12px] font-semibold tabular-nums"
                      style={{
                        color: isOut ? "var(--thai-color-history-outflow)" : "var(--thai-color-due)",
                        WebkitTextFillColor: isOut ? "var(--thai-color-history-outflow)" : "var(--thai-color-due)",
                      }}
                    >
                      {isOut ? "−" : ""}
                      {formatAmount(item.amount)}
                    </div>
                    {!isOut ? <div className="text-[9px] text-muted-foreground">заявка</div> : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border-0 bg-muted/12 px-3 py-6 text-center backdrop-blur-[2px]">
            <Text className="text-[12px] text-muted-foreground">
              {allOps.length === 0 ? "Операций пока нет." : "Нет операций в выбранном периоде и фильтре."}
            </Text>
          </div>
        )}
      </div>
      {!financePageScroll && !isBusy && visibleOps.length > 0 && filteredOps.length > PAGE_FIRST ? (
        <button
          type="button"
          className="w-full shrink-0 border-t border-border/20 bg-muted/10 py-2 text-[12px] font-medium text-muted-foreground transition hover:bg-muted/18"
          onClick={handlePagingClick}
        >
          {pagingLabel}
        </button>
      ) : null}
    </div>
  );
}
