"use client";

/** Общая лента операций для главной дашборда (INVESTOR / OWNER). Вёрстка — нейтральные `thai-dashboard-*`. */

import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, ChevronDown, Percent, PlusCircle } from "lucide-react";

import { apiClient } from "@/lib/api-client";
import { cn, formatCurrency } from "@/lib/utils";
import { isSameOpenWeekAsNow } from "@/lib/open-week-forecast";
import type { FinanceOperationItem } from "@/types/finance-operations";
import type { OperationsHistoryResponse } from "@/types/operations-finance-api";
import { FinanceInvestorSelectionTruncationNotice } from "@/components/dashboard/finance/FinanceInvestorSelectionTruncationNotice";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { HistoryPeriodPopover, sortAtInHistoryPeriod, operationPeriodAnchorIso, type HistoryPeriodValue } from "@/components/dashboard/HistoryPeriodPopover";
import { weekAccrualPeriodRowUi } from "@/lib/history-period";
import { FinanceOperationsSubFeed } from "@/components/dashboard/finance/FinanceOperationsSubFeed";
import { FinancePendingActionsQueue } from "@/components/dashboard/finance/FinancePendingActionsQueue";
import {
  financeOperationInActionQueue,
  isTerminalFinanceOperation,
  sortFinanceOpsBySortAtDesc,
} from "@/lib/finance-operations-feed";
import type { FinanceOperationsHistoryOpFilter } from "@/types/finance-operations-filter";
import {
  bodyTopUpAttentionBadgeLabel,
  bodyTopUpPendingStatusPhrase,
  bodyTopUpRowNeedsPendingHighlight,
  paymentAttentionBadgeLabel,
  paymentNeedsViewerAction,
  topupNeedsViewerAction,
} from "@/lib/finance-payment-attention";

type OpFilter = FinanceOperationsHistoryOpFilter;

const PAGE_FIRST = 8;
const PAGE_MORE = 40;
/** Показать все строки истории без «Показать ещё» по умолчанию */
const SHOW_ALL_HISTORY_CAP = Number.MAX_SAFE_INTEGER;

function opMatchesFilter(item: FinanceOperationItem, f: OpFilter, splitPendingQueue: boolean): boolean {
  if (f === "all") return true;
  if (f === "accrual") return item.kind === "week_accrual";
  if (f === "topup") return item.kind === "topup";
  if (f === "payout") return item.kind === "payment" && item.status === "completed";
  if (f === "request") {
    if (splitPendingQueue) return false;
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
    approved_waiting_accept: "Одобрено — ждём инвестора",
    rejected: "Отклонено",
    expired: "Истекло",
    disputed: "Спор",
    completed_at_creation: "При создании позиции",
    pending_investor: "Ожидает подтверждения инвестора",
    accepted_by_investor: "Принято инвестором",
    rejected_by_investor: "Отклонено инвестором",
    cancelled_by_owner: "Отозвано владельцем",
  };
  return map[status] ?? status;
}

function formatTopUpHistorySubline(
  item: Extract<FinanceOperationItem, { kind: "topup" }>,
  operationsHistoryScope: "investor" | "owner",
  viewerBodyTopupAddresseeInvestorIds: ReadonlySet<number> | null
) {
  if (item.initialFromCreation) {
    const act = item.activationDate ? formatDate(item.activationDate) : formatDate(item.sortAt);
    const entry = formatDate(item.entryDate ?? item.sortAt);
    return `Начальное тело при открытии · активация ${act} · вх. ${entry}`;
  }
  const when = item.requestDate ?? item.createdAt;
  const st =
    item.status === "pending_investor"
      ? bodyTopUpPendingStatusPhrase(operationsHistoryScope, item.investorId, item.positionName, viewerBodyTopupAddresseeInvestorIds)
      : paymentStatusShort(item.status);
  return `${st} · ${formatDateTime(when)}`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function formatAmount(num: number) {
  if (!num) return "0";
  return Number(num).toLocaleString("ru-RU");
}

/** Сводка по текущей выборке (период + тип) для страницы «Финансы». */
function financeSelectionTotals(ops: FinanceOperationItem[]) {
  let growth = 0;
  let paidOut = 0;
  let openRequests = 0;
  for (const op of ops) {
    if (op.kind === "week_accrual") growth += op.accrued;
    else if (op.kind === "topup") {
      const countsTowardGrowth =
        Boolean(op.initialFromCreation) || op.status === "accepted_by_investor";
      if (countsTowardGrowth) growth += op.amount;
      if (!op.initialFromCreation && op.status === "pending_investor") openRequests += 1;
    } else if (op.kind === "payment") {
      if (op.status === "completed") paidOut += op.amount;
      else openRequests += 1;
    }
  }
  return { growth, paidOut, openRequests };
}

function formatNetworkWeeklyRate(p: number | undefined) {
  if (p == null || Number.isNaN(p)) return null;
  const s = new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(p);
  return `${s}% / нед`;
}

function metricValueStyle(color: string): CSSProperties {
  return { color, WebkitTextFillColor: color };
}

function CompactStat({
  title,
  value,
  valueStyle,
  compact,
  className,
}: {
  title: string;
  value: string;
  valueStyle?: CSSProperties;
  /** Плотная сетка на главной дашборда */
  compact?: boolean;
  className?: string;
}) {
  const merged = valueStyle?.color ? { ...valueStyle, ...metricValueStyle(String(valueStyle.color)) } : valueStyle;
  return (
    <div
      className={cn(
        "thai-stat-tile border-0 bg-background/28 backdrop-blur-md dark:bg-background/18",
        compact ? "rounded-lg px-1.5 py-1.5" : "rounded-xl p-2",
        className
      )}
    >
      <Text
        className={cn(
          "font-medium uppercase tracking-wide text-muted-foreground",
          compact ? "text-[9px] leading-none" : "text-[10px]"
        )}
      >
        {title}
      </Text>
      <span
        className={cn(
          "mt-0.5 block font-semibold tabular-nums leading-tight",
          compact ? "text-xs" : "text-sm"
        )}
        style={merged}
      >
        {value}
      </span>
    </div>
  );
}

export type DashboardOperationsHistoryProps = {
  enabled: boolean;
  glassCard: CSSProperties;
  /** Несколько позиций — подписи с именем в строках. */
  showMultiPositionLabels: boolean;
  /**
   * Лента и фильтры сразу внутри карточки героя (инвестор / владелец).
   */
  embedded?: boolean;
  /** Разделение кеша React Query между видами «инвестор» и «владелец» (один URL API). */
  operationsHistoryScope?: "investor" | "owner";
  /** В embedded: заголовок сворачивает ленту (экран владельца). */
  embeddedCollapsible?: boolean;
  /** При embeddedCollapsible — начать развёрнутым (инвестор по умолчанию развёрнут). */
  embeddedInitiallyExpanded?: boolean;
  /** Раздел «Финансы»: выделенная панель периода и типов; без влияния на главную дашборда, если не передано. */
  financeProminentFilters?: boolean;
  /**
   * Раздел «Финансы»: без внутренней прокрутки ленты — весь список по высоте, скролл страницы (удобно на тач).
   * На главной не передаётся.
   */
  financePageScroll?: boolean;
  /** Раздел «Финансы»: полная карточка операции в модалке. На главной не передаётся. */
  onOperationClick?: (item: FinanceOperationItem) => void;
  /** Рядом с выбором периода (напр. legacy-слоты). */
  financeSecondaryFiltersSlot?: ReactNode;
  /** В строке заголовка «Лента» (стр. «Финансы»), рядом со счётчиками. */
  financeFeedHeaderSlot?: ReactNode;
  /** Под фильтрами периода и типа: полоса карточек позиций (Финансы владельца / SA). Режим функции — под каждой карточкой своя лента через renderFeed. */
  financeInvestorCardsSlot?:
    | ReactNode
    | ((ctx: {
        renderFeed: (investorId: number | null) => ReactNode;
        periodValue: HistoryPeriodValue;
        operationsHistoryScope: "investor" | "owner";
        opFilter: OpFilter;
        applyOperationFilter: (filter: OpFilter) => void;
      }) => ReactNode);
  /** Серверная выборка сводки/шапки по позиции (`GET …?investorId=`); для аккордеона совпадает с открытой карточкой или «вся сеть». */
  filterInvestorId?: number | null;
  /** Страница «Финансы» с аккордеоном: общая лента снизу скрыта, операции только в renderFeed под карточкой. */
  financeSuppressBottomFeed?: boolean;
  /** SUPER_ADMIN на «Финансы»: фильтр сети для лент без выбранной позиции. */
  financeSuperAdminNetwork?: "common" | "private" | "all" | null;
  /**
   * SUPER_ADMIN на главной: лента только по позициям «Семён» (`linkedCommon=1`), не по всей общей сети.
   * Не использовать на странице «Финансы».
   */
  superAdminLinkedCommonHome?: boolean;
  /**
   * Позиции, где текущий пользователь подтверждает пополнение тела (`investorUser` / `linkedUser`).
   * Страница «Финансы» передаёт из lean-списка; без пропа — без фильтра адресата (как раньше).
   */
  viewerBodyTopupAddresseeInvestorIds?: ReadonlySet<number> | null;
  /**
   * Заявки в ожидании — отдельный блок «Требуют действия», в ленте только терминальные проводки.
   * По умолчанию совпадает с «расширенным» режимом страницы «Финансы».
   */
  splitPendingActionQueue?: boolean;
  /** Если задан вместе с `onOperationClick`, интерактивны только подходящие строки (напр. только выплаты на главной). */
  operationRowPredicate?: (item: FinanceOperationItem) => boolean;
};

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

export function DashboardOperationsHistory({
  enabled,
  glassCard,
  showMultiPositionLabels,
  embedded = false,
  operationsHistoryScope = "investor",
  embeddedCollapsible = false,
  embeddedInitiallyExpanded = true,
  financeProminentFilters = false,
  financePageScroll = false,
  onOperationClick,
  financeSecondaryFiltersSlot,
  financeFeedHeaderSlot,
  financeInvestorCardsSlot,
  filterInvestorId,
  financeSuppressBottomFeed = false,
  financeSuperAdminNetwork = null,
  superAdminLinkedCommonHome = false,
  viewerBodyTopupAddresseeInvestorIds = null,
  splitPendingActionQueue = financeProminentFilters,
  operationRowPredicate,
}: DashboardOperationsHistoryProps) {
  const queryClient = useQueryClient();
  const bodyTopupAddresseeIds = viewerBodyTopupAddresseeInvestorIds ?? null;
  const financeCardsLayout = Boolean(financeProminentFilters && financeInvestorCardsSlot);
  const [expanded, setExpanded] = useState(false);
  const [embeddedExpanded, setEmbeddedExpanded] = useState(embeddedInitiallyExpanded);

  /** Раскрыть журнал при появлении явного `?investor=` (initial state не обновляется при смене пропа). */
  useEffect(() => {
    if (!embeddedCollapsible) return;
    if (embeddedInitiallyExpanded) setEmbeddedExpanded(true);
  }, [embeddedCollapsible, embeddedInitiallyExpanded]);

  const showPanel = embedded ? (embeddedCollapsible ? embeddedExpanded : true) : expanded;
  const [opFilter, setOpFilter] = useState<OpFilter>("all");
  const [periodValue, setPeriodValue] = useState<HistoryPeriodValue>({ kind: "preset", preset: "all" });
  const [visibleCap, setVisibleCap] = useState(SHOW_ALL_HISTORY_CAP);

  /**
   * «Финансы» с аккордеоном: фильтры и карточки показываем даже при свёрнутой ленте,
   * а тяжёлый GET не дергаем, пока не развернули журнал или не выбрана одна позиция (investorId).
   */
  /** Пока нижняя лента скрыта (Финансы OWNER/SUPER_ADMIN), откладывать GET нельзя — иначе шапка «Лента» и карточки живут без тех же данных, что под‑аккордеоном. */
  const deferHeavyHistoryFetch =
    embedded &&
    embeddedCollapsible &&
    financeProminentFilters &&
    typeof financeInvestorCardsSlot === "function" &&
    !financeSuppressBottomFeed;

  const financeInvestorAccordionChrome =
    embedded && financeProminentFilters && typeof financeInvestorCardsSlot === "function";

  /** Свёрнутый «Журнал» не должен прятать фильтры и карточки — только нижний блок (см. `showPanel && !financeSuppressBottomFeed`). */
  const showFiltersAndCards = deferHeavyHistoryFetch || showPanel || financeInvestorAccordionChrome;

  const opsHistoryEnabled =
    enabled && (!deferHeavyHistoryFetch || embeddedExpanded || filterInvestorId != null);

  /** Периодический refetch только когда лента открыта или запрос уже активен без отложенной загрузки. */
  const opsPollingActive = opsHistoryEnabled && (!embeddedCollapsible || embeddedExpanded);

  const investorHistoryKey = filterInvestorId != null ? filterInvestorId : "all";
  const bottomHistoryNetSeg = superAdminLinkedCommonHome ? "linkedCommonHome" : (financeSuperAdminNetwork ?? "-");

  const { data: opsData, isLoading: opsLoading } = useQuery({
    queryKey: [
      "investors",
      "operations-history",
      operationsHistoryScope,
      investorHistoryKey,
      bottomHistoryNetSeg,
    ] as const,
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterInvestorId != null && Number.isFinite(filterInvestorId)) {
        params.set("investorId", String(filterInvestorId));
      } else if (superAdminLinkedCommonHome) {
        params.set("linkedCommon", "1");
      } else if (financeSuperAdminNetwork) {
        params.set("network", financeSuperAdminNetwork);
      }
      const qs = params.toString();
      return apiClient.get<OperationsHistoryResponse>(
        qs ? `/api/investors/operations-history?${qs}` : "/api/investors/operations-history"
      );
    },
    enabled: opsHistoryEnabled,
    staleTime: 45_000,
    refetchInterval: opsPollingActive ? 60_000 : false,
  });

  const allOps = useMemo(() => opsData?.items ?? [], [opsData?.items]);

  const periodFiltered = useMemo(
    () => allOps.filter((op) => sortAtInHistoryPeriod(operationPeriodAnchorIso(op), periodValue)),
    [allOps, periodValue]
  );

  const pendingQueueOps = useMemo(() => {
    if (!splitPendingActionQueue) return [];
    return sortFinanceOpsBySortAtDesc(
      periodFiltered.filter((i) =>
        financeOperationInActionQueue(i, operationsHistoryScope, bodyTopupAddresseeIds)
      )
    );
  }, [splitPendingActionQueue, periodFiltered, operationsHistoryScope, bodyTopupAddresseeIds]);

  const historyBaseOps = useMemo(() => {
    if (!splitPendingActionQueue) return periodFiltered;
    return periodFiltered.filter(isTerminalFinanceOperation);
  }, [splitPendingActionQueue, periodFiltered]);

  const filteredOps = useMemo(
    () => historyBaseOps.filter((i) => opMatchesFilter(i, opFilter, splitPendingActionQueue)),
    [historyBaseOps, opFilter, splitPendingActionQueue]
  );

  const financeTotals = useMemo(() => {
    if (!financeProminentFilters) return null;
    const base = financeSelectionTotals(filteredOps);
    if (!splitPendingActionQueue) return base;
    return { ...base, openRequests: pendingQueueOps.length };
  }, [financeProminentFilters, filteredOps, splitPendingActionQueue, pendingQueueOps.length]);

  useEffect(() => {
    if (!splitPendingActionQueue) return;
    if (opFilter === "request") setOpFilter("all");
  }, [splitPendingActionQueue, opFilter]);

  const visibleOps = useMemo(
    () => (financePageScroll ? filteredOps : filteredOps.slice(0, visibleCap)),
    [financePageScroll, filteredOps, visibleCap]
  );

  function resetVisibleCap() {
    setVisibleCap(SHOW_ALL_HISTORY_CAP);
  }

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

  const opFilterPairs = useMemo(() => {
    const full = financeProminentFilters
      ? (
          [
            ["all", "Все"],
            ["accrual", "Начисл."],
            ["payout", "Выплаты"],
            ["request", "Заявки"],
            ["topup", "Пополн."],
          ] as const
        )
      : (
          [
            ["all", "Все"],
            ["accrual", "Начисления"],
            ["payout", "Выплаты"],
            ["request", "Заявки"],
            ["topup", "Пополнения"],
          ] as const
        );
    if (!splitPendingActionQueue) return full;
    return full.filter(([id]) => id !== "request");
  }, [financeProminentFilters, splitPendingActionQueue]);

  const historyHeader = embedded ? (
    embeddedCollapsible ? (
      <button
        type="button"
        onClick={() =>
          setEmbeddedExpanded((v) => {
            const next = !v;
            if (!v && next) {
              setVisibleCap(SHOW_ALL_HISTORY_CAP);
              void queryClient.invalidateQueries({ queryKey: ["investors", "operations-history"] });
            }
            return next;
          })
        }
        className="mb-1.5 flex w-full items-center gap-2 rounded-lg px-0.5 py-1 text-left transition hover:bg-muted/10"
        aria-expanded={embeddedExpanded}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Журнал сети</Text>
            {!isBusy ? (
              <span
                className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground"
                title="С учётом периода и типа операций"
              >
                {filteredOps.length}
              </span>
            ) : null}
          </div>
          {!embeddedExpanded && !isBusy ? (
            <Text className="mt-0.5 text-[11px] text-muted-foreground">
              {splitPendingActionQueue
                ? "Завершённые проводки в ленте · открытые заявки — в блоке «Требуют действия» при развороте"
                : "Начисления, выплаты и пополнения · развернуть при необходимости"}
            </Text>
          ) : null}
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            embeddedExpanded && "rotate-180"
          )}
          aria-hidden
        />
      </button>
    ) : financeProminentFilters ? null : (
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 px-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">История операций</Text>
          {!isBusy ? (
            <span
              className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground"
              title="С учётом периода и типа операций"
            >
              {filteredOps.length}
            </span>
          ) : null}
        </div>
      </div>
    )
  ) : (
    <button
      type="button"
      onClick={() => {
        setExpanded((v) => {
          if (!v) setVisibleCap(SHOW_ALL_HISTORY_CAP);
          return !v;
        });
      }}
      className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-muted/10"
      aria-expanded={expanded}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">История операций</Text>
          {!isBusy ? (
            <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
              {allOps.length}
            </span>
          ) : null}
        </div>
        {!expanded && !isBusy && allOps.length > 0 ? (
          <Text className="mt-0.5 text-[11px] text-muted-foreground">Последние события · нажмите, чтобы развернуть</Text>
        ) : null}
      </div>
      <ChevronDown
        className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", expanded && "rotate-180")}
        aria-hidden
      />
    </button>
  );

  const historyBody = showFiltersAndCards ? (
        <div
          className={cn(
            "flex flex-col gap-2",
            !(financePageScroll && embedded) && "min-h-0 flex-1",
            embedded ? "px-0 pb-0 pt-0" : "px-2.5 pb-2.5 pt-2"
          )}
        >
          {/* На странице «Финансы»: сводка + период + тип в одном блоке */}
          <div
            className={cn(
              "relative z-10",
              financeProminentFilters &&
                "rounded-xl border border-border/35 bg-gradient-to-br from-card/70 via-card/45 to-muted/12 p-2 shadow-[0_12px_40px_-28px_rgba(0,0,0,0.45)] backdrop-blur-md dark:from-card/35 dark:via-card/22 dark:to-muted/8 md:p-2.5"
            )}
          >
            {financeProminentFilters ? (
              <div className="mb-1.5 flex flex-wrap items-end justify-between gap-x-2 gap-y-1.5 border-b border-border/20 pb-1.5">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Лента</span>
                  {!isBusy ? (
                    <>
                      <span
                        className="rounded-md border border-primary/18 bg-primary/[0.07] px-2 py-0.5 text-[11px] font-bold tabular-nums text-primary backdrop-blur-[2px] dark:border-primary/14 dark:bg-primary/[0.06]"
                        title="Строк с учётом периода и типа"
                      >
                        {filteredOps.length}
                      </span>
                      {historyBaseOps.length !== filteredOps.length ? (
                        <span className="text-[10px] tabular-nums text-muted-foreground" title="Все строки выбранного периода (до фильтра типа)">
                          · {historyBaseOps.length} по периоду
                        </span>
                      ) : allOps.length > filteredOps.length ? (
                        <span className="text-[10px] tabular-nums text-muted-foreground" title="Всего записей в ленте">
                          · {allOps.length} всего
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="h-5 w-16 animate-pulse rounded-md bg-muted/35" />
                  )}
                  {financeFeedHeaderSlot}
                </div>
                {!isBusy && financeTotals ? (
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    {financeTotals.growth > 0 ? (
                      <span
                        className="inline-flex items-center rounded-md border border-emerald-500/22 bg-emerald-500/[0.07] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-emerald-800 dark:text-emerald-200/95"
                        title="Начисления и пополнения в выборке"
                      >
                        +{formatAmount(financeTotals.growth)} ฿
                      </span>
                    ) : null}
                    {financeTotals.paidOut > 0 ? (
                      <span
                        className="inline-flex items-center rounded-md border border-sky-500/22 bg-sky-500/[0.07] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-sky-900 dark:text-sky-200/95"
                        title="Завершённые выплаты в выборке"
                      >
                        −{formatAmount(financeTotals.paidOut)} ฿
                      </span>
                    ) : null}
                    {financeTotals.openRequests > 0 ? (
                      <span
                        className="inline-flex items-center rounded-md border border-amber-500/35 bg-amber-500/12 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-amber-900 dark:text-amber-100"
                        title={
                          splitPendingActionQueue
                            ? "Открытые заявки (см. блок «Требуют действия» выше)"
                            : "Активные заявки на выплату в выборке"
                        }
                      >
                        {financeTotals.openRequests} заявк.
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            <div
              className={cn(
                "flex min-w-0 pt-0.5",
                financeProminentFilters
                  ? "flex-row items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  : cn("gap-2", financeCardsLayout ? "flex-col" : "flex-col sm:flex-row sm:items-center")
              )}
            >
              {financeProminentFilters ? (
                <>
                  <HistoryPeriodPopover
                    triggerVariant="toolbar"
                    className="shrink-0"
                    value={periodValue}
                    onChange={(next) => {
                      setPeriodValue(next);
                      resetVisibleCap();
                    }}
                  />
                  {financeSecondaryFiltersSlot ? (
                    <div className="flex shrink-0">{financeSecondaryFiltersSlot}</div>
                  ) : null}
                  <div className="flex min-w-0 shrink-0 items-center gap-1 sm:gap-1.5">
                    {opFilterPairs.map(([id, label]) => (
                      <Button
                        key={id}
                        type="button"
                        size="sm"
                        variant="outline"
                        className={cn(
                          "h-7 shrink-0 whitespace-nowrap rounded-full px-2.5 py-0 text-[10px] font-semibold leading-none",
                          opFilter === id
                            ? cn(
                                "border-primary/30 bg-primary/[0.06] text-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] backdrop-blur-md hover:bg-primary/[0.1]",
                                "dark:border-primary/22 dark:bg-white/[0.05] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] dark:hover:bg-white/[0.07]"
                              )
                            : "border-border/42 bg-background/45 text-muted-foreground hover:border-border/55 hover:bg-muted/18 hover:text-foreground dark:border-white/[0.08] dark:bg-transparent dark:hover:bg-white/[0.04]"
                        )}
                        onClick={() => {
                          setOpFilter(id);
                          resetVisibleCap();
                        }}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex shrink-0 items-center gap-2">
                    <HistoryPeriodPopover
                      className="shrink-0"
                      compact={embedded && !financeProminentFilters}
                      value={periodValue}
                      onChange={(next) => {
                        setPeriodValue(next);
                        resetVisibleCap();
                      }}
                    />
                    {financeSecondaryFiltersSlot ? (
                      <div className="flex min-w-0 shrink-0">{financeSecondaryFiltersSlot}</div>
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1 overflow-x-auto py-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <div className="flex w-max items-center gap-1 pr-1 sm:gap-1.5 sm:pr-2">
                      {opFilterPairs.map(([id, label]) => (
                        <Button
                          key={id}
                          type="button"
                          size="sm"
                          variant="outline"
                          className={cn(
                            "h-8 shrink-0 whitespace-nowrap rounded-full px-2.5 py-0 text-[10px] font-semibold leading-none md:h-9 md:px-3 md:text-[11px]",
                            embedded && !financeProminentFilters && "px-2",
                            opFilter === id
                              ? cn(
                                  "border-primary/30 bg-primary/[0.06] text-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] backdrop-blur-md hover:bg-primary/[0.1]",
                                  "dark:border-primary/22 dark:bg-white/[0.05] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] dark:hover:bg-white/[0.07]"
                                )
                              : "border-border/42 bg-background/45 text-muted-foreground hover:border-border/55 hover:bg-muted/18 hover:text-foreground dark:border-white/[0.08] dark:bg-transparent dark:hover:bg-white/[0.04]"
                          )}
                          onClick={() => {
                            setOpFilter(id);
                            resetVisibleCap();
                          }}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            {splitPendingActionQueue && pendingQueueOps.length > 0 ? (
              <div className="mt-1 border-t border-border/12 pt-1 dark:border-white/[0.06]">
                <FinancePendingActionsQueue
                  items={pendingQueueOps}
                  operationsHistoryScope={operationsHistoryScope}
                  bodyTopupAddresseeIds={bodyTopupAddresseeIds}
                  onItemClick={(it) => {
                    if (onOperationClick) onOperationClick(it);
                  }}
                />
              </div>
            ) : null}
            {financeProminentFilters ? (
              <div className="mt-1.5 space-y-1.5 border-t border-border/15 pt-1.5">
                <p className="text-[9px] leading-snug text-muted-foreground">
                  {splitPendingActionQueue
                    ? financeInvestorCardsSlot
                      ? financeSuppressBottomFeed
                        ? "Открытые заявки — блок «Требуют действия». Лента под карточкой — только завершённые проводки. Период и тип задают выборку."
                        : "Открытые заявки — блок «Требуют действия». Ниже — завершённые проводки. Карточка сужает ленту до позиции."
                      : "Открытые заявки — блок «Требуют действия». Ниже — завершённые проводки по периоду и типу."
                    : financeInvestorCardsSlot
                      ? financeSuppressBottomFeed
                        ? "Период и тип задают выборку. Карточка — лента под ней; метрики на карточке тоже задают тип."
                        : "Сверху — период и тип операций. Карточка позиции — лента событий ниже. Суммы справа по текущей выборке."
                      : "Суммы справа — только видимые строки. Нажмите строку ниже для подробностей."}
                </p>
                {financeInvestorCardsSlot ? (
                  typeof financeInvestorCardsSlot === "function" ? (
                    financeInvestorCardsSlot({
                      renderFeed: (investorId) => (
                        <FinanceOperationsSubFeed
                          operationsHistoryScope={operationsHistoryScope}
                          filterInvestorId={investorId}
                          superAdminNetwork={investorId != null ? null : financeSuperAdminNetwork}
                          periodValue={periodValue}
                          opFilter={opFilter}
                          financePageScroll={financePageScroll}
                          showMultiPositionLabels={investorId != null ? false : showMultiPositionLabels}
                          enabled={enabled}
                          onOperationClick={onOperationClick}
                          operationRowPredicate={operationRowPredicate}
                          viewerBodyTopupAddresseeInvestorIds={bodyTopupAddresseeIds}
                          splitPendingActionQueue={splitPendingActionQueue}
                          suppressInlinePendingQueue={Boolean(
                            financeSuppressBottomFeed && splitPendingActionQueue
                          )}
                        />
                      ),
                      periodValue,
                      operationsHistoryScope,
                      opFilter,
                      applyOperationFilter: (filter) => {
                        setOpFilter(filter);
                        resetVisibleCap();
                      },
                    })
                  ) : (
                    <div>{financeInvestorCardsSlot}</div>
                  )
                ) : null}
              </div>
            ) : null}
          </div>

          {showPanel && !financeSuppressBottomFeed ? (
            <>
          <div
            className={cn(
              "relative z-0 rounded-xl border-0",
              financePageScroll && embedded
                ? "overflow-visible"
                : cn(
                    "thai-dashboard-history-scroll overflow-y-auto",
                    embedded
                      ? embeddedCollapsible
                        ? "max-h-[min(42vh,24rem)] min-h-0"
                        : financeProminentFilters
                          ? "min-h-[240px] max-h-[min(70vh,520px)] flex-1"
                          : "min-h-0 flex-1"
                      : "max-h-[min(60vh,32rem)]"
                  )
            )}
          >
            <FinanceInvestorSelectionTruncationNotice investorSelection={opsData?.meta?.investorSelection} />
            {splitPendingActionQueue ? (
              <div className="border-b border-border/12 px-2 py-1 dark:border-white/[0.05]">
                <span className="text-[8px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/90">
                  История · завершённые
                </span>
              </div>
            ) : null}
            {isBusy ? (
              <div className="divide-y divide-border/15 overflow-hidden rounded-xl border-0 bg-background/15 dark:bg-background/12">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-2">
                    <div className="h-8 w-8 shrink-0 rounded-full bg-muted/35" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="h-3 max-w-[10rem] rounded bg-muted/35" />
                      <div className="h-2.5 max-w-[12rem] rounded bg-muted/25" />
                    </div>
                    <div className="h-3 w-12 rounded bg-muted/35" />
                  </div>
                ))}
              </div>
            ) : visibleOps.length > 0 ? (
              <div
                className="divide-y divide-border/15 overflow-hidden rounded-xl border-0"
                style={{
                  background: "color-mix(in srgb, var(--thai-color-card-bg) 38%, transparent)",
                }}
              >
                {visibleOps.map((item) => {
                  if (item.kind === "week_accrual") {
                    const settled = item.paidTotal > 0;
                    const rateLabel = formatNetworkWeeklyRate(item.networkRatePercent);
                    const isOpenWeek = isSameOpenWeekAsNow(item.weekStart);
                    const accrualPreviewGold =
                      item.accrued === 0 && (item.syntheticOpen || isOpenWeek);
                    const wkUi = weekAccrualPeriodRowUi(item.weekStart, item.weekEnd, periodValue);
                    const weekRowMuted =
                      !item.syntheticOpen && (wkUi.clippedByPeriodEnd || wkUi.extendsBeyondBangkokToday);
                    return (
                      <div
                        key={item.id}
                        {...operationRowInteractiveProps(onOperationClick, item, operationRowPredicate)}
                        className={cn(
                          "flex items-center gap-2 px-2 py-2 transition-colors hover:bg-muted/10",
                          operationRowPointerCn(onOperationClick, item, operationRowPredicate),
                          item.syntheticOpen ? "bg-muted/10" : undefined,
                          weekRowMuted && "opacity-[0.82]"
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
                            Начисление · {wkUi.captionFrom} — {wkUi.captionTo}
                          </div>
                          <div className="truncate text-[10px] leading-snug text-muted-foreground">
                            {rateLabel ? <>Сеть {rateLabel}</> : <>Ставка —</>}
                            <span className="px-1 text-border/80">·</span>
                            <span className="font-medium" style={{ color: settled ? "var(--thai-color-paid)" : "var(--thai-color-accrued)" }}>
                              {settled ? "Есть выплаты" : "Без выплат"}
                            </span>
                          </div>
                          {item.syntheticOpen || (isOpenWeek && item.accrued === 0) ? (
                            <Text className="mt-0.5 text-[9px] leading-snug text-muted-foreground">Неделя открыта · в ленте +0 до ПН</Text>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-right leading-tight">
                          <div
                            data-finance-history="accrued"
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
                              data-finance-history="paid"
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
                    const subline = formatTopUpHistorySubline(item, operationsHistoryScope, bodyTopupAddresseeIds);
                    const topupHighlight = bodyTopUpRowNeedsPendingHighlight(item);
                    const needsTopUpAction = topupNeedsViewerAction(operationsHistoryScope, item, bodyTopupAddresseeIds);
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
                      : topupHighlight && operationsHistoryScope === "investor"
                        ? "Ожидается решение инвестора по этой позиции (не ваш шаг)"
                        : topupHighlight && operationsHistoryScope === "owner"
                          ? "Ожидается подтверждение инвестором; при необходимости откройте строку и отзовите запрос"
                          : undefined;
                    const topUpPendingRequest =
                      !item.initialFromCreation && item.status === "pending_investor";
                    return (
                      <div
                        key={item.id}
                        {...operationRowInteractiveProps(onOperationClick, item, operationRowPredicate)}
                        title={attentionTitleTopUp}
                        data-finance-history-attention={
                          needsTopUpAction ? "action" : topupHighlight ? "pending" : undefined
                        }
                        className={cn(
                          "flex items-center gap-2 px-2 py-2 transition-colors hover:bg-muted/10",
                          operationRowPointerCn(onOperationClick, item, operationRowPredicate),
                          topupHighlight &&
                            "border-l-[3px] border-l-amber-500/85 bg-amber-500/[0.07] dark:border-l-amber-400/80 dark:bg-amber-400/[0.09]"
                        )}
                        style={
                          topupHighlight
                            ? undefined
                            : { background: "var(--thai-color-topup-bg)" }
                        }
                      >
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background/50"
                          style={{
                            borderColor: topupHighlight
                              ? "color-mix(in srgb, rgb(245 158 11) 55%, transparent)"
                              : "color-mix(in srgb, var(--thai-color-topup) 45%, transparent)",
                          }}
                          aria-hidden
                        >
                          <PlusCircle
                            className="h-4 w-4 shrink-0 text-[var(--thai-color-topup)]"
                            strokeWidth={2}
                            style={
                              topupHighlight ? { color: "rgb(245 158 11)", opacity: 0.92 } : undefined
                            }
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-[12px] font-semibold text-foreground">
                              {showMultiPositionLabels ? `Пополнение · ${item.positionName}` : "Пополнение тела"}
                            </span>
                            {topupHighlight ? (
                              <span className="inline-flex shrink-0 rounded border border-amber-500/45 bg-amber-500/14 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-amber-950 dark:text-amber-100">
                                {bodyTopUpAttentionBadgeLabel(
                                  operationsHistoryScope,
                                  item.investorId,
                                  item.positionName,
                                  bodyTopupAddresseeIds
                                )}
                              </span>
                            ) : null}
                          </div>
                          <div
                            className={cn(
                              "line-clamp-2 text-[10px] text-muted-foreground",
                              topupHighlight && "font-medium text-amber-950/95 dark:text-amber-50/90"
                            )}
                          >
                            {subline}
                          </div>
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
                  {allOps.length === 0
                    ? "Операций пока нет."
                    : splitPendingActionQueue && pendingQueueOps.length > 0 && filteredOps.length === 0
                      ? "Нет завершённых проводок в выборке · открытые заявки выше"
                      : "Нет операций в выбранном периоде и фильтре."}
                </Text>
              </div>
            )}
          </div>

          {!financePageScroll && !isBusy && visibleOps.length > 0 && filteredOps.length > PAGE_FIRST ? (
            <button
              type="button"
              className="w-full shrink-0 rounded-lg border-0 bg-muted/15 py-2 text-[12px] font-medium text-muted-foreground transition hover:bg-muted/22"
              onClick={handlePagingClick}
            >
              {pagingLabel}
            </button>
          ) : null}
            </>
          ) : null}
        </div>
  ) : null;

  if (embedded) {
    return (
      <div
        className={cn(
          "thai-dashboard-history-embedded flex min-w-0 flex-col",
          embeddedCollapsible && !embeddedExpanded ? "shrink-0" : financePageScroll ? "w-full" : "min-h-0 flex-1"
        )}
      >
        {historyHeader}
        {historyBody}
      </div>
    );
  }

  return (
    <section className="thai-glass overflow-hidden border-0" style={glassCard}>
      {historyHeader}
      {historyBody}
    </section>
  );
}

/** Компактные плитки метрик (те же классы, что на странице финансов — для e2e и единого вида). */
export function DashboardMetricTiles({
  body,
  accrued,
  paid,
  accruedTitle = "Начислено",
  metricsFootnote,
  ledgerLinkHref,
  ledgerLinkLabel,
}: {
  body: number;
  accrued: number;
  paid: number;
  /** Для инвестора: не путать с «суммой за всё время» из недельного реестра */
  accruedTitle?: string;
  /** Короткое пояснение под плитками (без дублирования данных реестра) */
  metricsFootnote?: string;
  ledgerLinkHref?: string;
  ledgerLinkLabel?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-2 gap-1 sm:gap-1.5 sm:grid-cols-3">
        <CompactStat
          className="col-span-2 sm:col-span-1"
          compact
          title="Тело"
          value={formatCurrency(body)}
          valueStyle={{ color: "var(--thai-color-text-primary)" }}
        />
        <CompactStat
          compact
          title={accruedTitle}
          value={formatCurrency(accrued)}
          valueStyle={{ color: "var(--thai-color-accrued)" }}
        />
        <CompactStat compact title="Выплачено" value={formatCurrency(paid)} valueStyle={{ color: "var(--thai-color-paid)" }} />
      </div>
      {metricsFootnote || (ledgerLinkHref && ledgerLinkLabel) ? (
        <p className="px-0.5 text-[10px] leading-snug text-muted-foreground">
          {metricsFootnote}
          {ledgerLinkHref && ledgerLinkLabel ? (
            <>
              {metricsFootnote ? " " : null}
              <Link href={ledgerLinkHref} className="font-semibold text-primary underline-offset-2 hover:underline">
                {ledgerLinkLabel}
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
