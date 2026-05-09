"use client";

import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Globe2, Lock } from "lucide-react";

import { apiClient } from "@/lib/api-client";
import type { OperationsHistoryResponse, OperationsSummaryResponse } from "@/types/operations-finance-api";
import { FinanceInvestorSelectionTruncationNotice } from "@/components/dashboard/finance/FinanceInvestorSelectionTruncationNotice";
import { normalizeHandleDisplay } from "@/lib/investor-display-handle";
import { cn, formatCurrency } from "@/lib/utils";
import { InvestorPositionAvatarHeading } from "@/components/dashboard/InvestorPositionAvatarHeading";
import type { HistoryPeriodValue } from "@/components/dashboard/HistoryPeriodPopover";
import type { FinanceOperationsHistoryOpFilter } from "@/types/finance-operations-filter";

export type FinanceInvestorAccordionModel = {
  id: number;
  name: string;
  /** Публичный ник в UI: родитель передаёт `investorDisplayHandle(…)` (логин аккаунта в приоритете). */
  handle: string | null;
  avatarUrl?: string | null;
  body: number;
  accrued: number;
  paid: number;
  status: string;
  isPrivate?: boolean;
  requestedPayments?: number;
  /** Роль владельца позиции (lean); для группировки «Общая» у SUPER_ADMIN. */
  ownerRole?: string | null;
  ownerUsername?: string | null;
  isSystemOwner?: boolean;
};

export type FinanceInvestorAccordionExpanded =
  | { kind: "collapsed" }
  | { kind: "network" }
  | { kind: "investor"; id: number };

/** Область карточки для фильтра ленты (совпадает с выбором позиции в аккордеоне). */
export type FinanceMetricFilterScope = { kind: "network" } | { kind: "investor"; id: number };

type Props = {
  investors: FinanceInvestorAccordionModel[];
  /** SUPER_ADMIN: фильтр для сводок и префетча истории при «вся сеть». */
  superAdminHistoryNetwork?: "common" | "private" | "all" | null;
  networkTotals: { body: number; accrued: number; paid: number; requestedPayments?: number };
  expanded: FinanceInvestorAccordionExpanded;
  onToggleNetwork: () => void;
  onToggleInvestor: (id: number) => void;
  /** Аватар и имя — открыть карточку позиции (как на главной у владельца). */
  onOpenInvestorProfile?: (id: number) => void;
  renderFeed: (investorId: number | null) => ReactNode;
  periodValue: HistoryPeriodValue;
  operationsHistoryScope: "investor" | "owner";
  opFilter: FinanceOperationsHistoryOpFilter;
  onApplyMetricFilter: (filter: FinanceOperationsHistoryOpFilter, scope: FinanceMetricFilterScope) => void;
};

/** Тело → пополнения; начислено → начисления; к выплате → открытые заявки на выплату. */
const BODY_OPS_FILTER: FinanceOperationsHistoryOpFilter = "topup";
const ACCRUED_OPS_FILTER: FinanceOperationsHistoryOpFilter = "accrual";
const PAID_OPS_FILTER: FinanceOperationsHistoryOpFilter = "payout";

function isSuperAdminPlatformInvestor(inv: FinanceInvestorAccordionModel) {
  return Boolean(inv.isSystemOwner) || inv.ownerRole === "SUPER_ADMIN";
}

function FinanceAccordionSectionLabel({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-0.5 pt-1">
      <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</span>
      {subtitle ? <span className="truncate text-[10px] font-medium text-foreground/88">{subtitle}</span> : null}
    </div>
  );
}

function MetricChipButton({
  label,
  value,
  valueClassName,
  selected,
  ariaLabel,
  title,
  onPick,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  selected: boolean;
  ariaLabel: string;
  /** Подсказка при наведении (например, как читается «Начислено» vs лента). */
  title?: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={title}
      aria-pressed={selected}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onPick();
      }}
      className={cn(
        "rounded-lg border px-1.5 py-1 text-center outline-none transition",
        "focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "border-border/30 bg-background/35 hover:bg-muted/28 active:scale-[0.98] dark:border-white/[0.07] dark:bg-black/22 dark:hover:bg-white/[0.07]",
        selected &&
          "border-primary/42 bg-primary/[0.1] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] ring-1 ring-primary/22 dark:bg-primary/[0.09]"
      )}
    >
      <div className="text-[8px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 truncate text-[11px] font-bold tabular-nums leading-none", valueClassName)}>{value}</div>
    </button>
  );
}

function MetricsRow({
  scope,
  body,
  accrued,
  paid,
  opFilter,
  onApplyMetricFilter,
  mutedSurface,
}: {
  scope: FinanceMetricFilterScope;
  body: number;
  accrued: number;
  paid: number;
  opFilter: FinanceOperationsHistoryOpFilter;
  onApplyMetricFilter: (filter: FinanceOperationsHistoryOpFilter, scope: FinanceMetricFilterScope) => void;
  mutedSurface?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-3 gap-1.5 border-t border-border/15 px-3 pb-2.5 pt-2",
        mutedSurface && "bg-muted/[0.06] dark:bg-white/[0.02]"
      )}
    >
      <MetricChipButton
        label="Тело"
        value={formatCurrency(body)}
        selected={opFilter === BODY_OPS_FILTER}
        ariaLabel="Фильтр операций: пополнения тела"
        onPick={() => onApplyMetricFilter(BODY_OPS_FILTER, scope)}
      />
      <MetricChipButton
        label="Начислено"
        value={formatCurrency(accrued)}
        valueClassName="text-[color:var(--thai-color-accrued)]"
        selected={opFilter === ACCRUED_OPS_FILTER}
        ariaLabel="Фильтр операций: начисления"
        title="Остаток по завершённым недельным циклам: накоплено за закрытые недели минус подтверждённые выплаты процентов (в т.ч. за текущую неделю). Незавершённая доля недели в эту цифру не входит — она в прогнозе/строке открытой недели в ленте. Сумма строк «Начисление» — начисление за неделю; выплаты — отдельными строками."
        onPick={() => onApplyMetricFilter(ACCRUED_OPS_FILTER, scope)}
      />
      <MetricChipButton
        label="Выплачено"
        value={formatCurrency(paid)}
        valueClassName="thai-dashboard-premium-matte-amount text-[11px]"
        selected={opFilter === PAID_OPS_FILTER}
        ariaLabel="Фильтр операций: выплаты"
        onPick={() => onApplyMetricFilter(PAID_OPS_FILTER, scope)}
      />
    </div>
  );
}

export function FinanceInvestorAccordionCards({
  investors,
  superAdminHistoryNetwork = null,
  networkTotals,
  expanded,
  onToggleNetwork,
  onToggleInvestor,
  onOpenInvestorProfile,
  renderFeed,
  periodValue,
  operationsHistoryScope,
  opFilter,
  onApplyMetricFilter,
}: Props) {
  const queryClient = useQueryClient();
  const networkOpen = expanded.kind === "network";
  const idsParam = investors.map((i) => i.id).join(",");
  const summaryNetworkSeg = superAdminHistoryNetwork ?? "-";
  const [pendingExpand, setPendingExpand] = useState<FinanceInvestorAccordionExpanded | null>(null);

  const { data: opsSummaryData } = useQuery({
    queryKey: ["investors", "operations-summary", operationsHistoryScope, idsParam, periodValue, opFilter, summaryNetworkSeg] as const,
    queryFn: () => {
      const netQs =
        superAdminHistoryNetwork != null ? `&network=${encodeURIComponent(superAdminHistoryNetwork)}` : "";
      return apiClient.get<OperationsSummaryResponse>(
        `/api/investors/operations-summary?ids=${encodeURIComponent(idsParam)}&period=${encodeURIComponent(
          JSON.stringify(periodValue)
        )}&filter=${encodeURIComponent(opFilter)}${netQs}`
      );
    },
    enabled: investors.length > 0,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const summaryById = opsSummaryData?.byInvestorId ?? {};
  const summaryReady = opsSummaryData != null;

  const prefetchHistory = useCallback(
    async (investorId: number | null) => {
      const netSeg = superAdminHistoryNetwork ?? "-";
      const key = ["investors", "operations-history", operationsHistoryScope, investorId ?? "all", netSeg] as const;
      const params = new URLSearchParams();
      if (investorId != null) params.set("investorId", String(investorId));
      else if (superAdminHistoryNetwork) params.set("network", superAdminHistoryNetwork);
      const qs = params.toString();
      const url = qs ? `/api/investors/operations-history?${qs}` : "/api/investors/operations-history";
      await queryClient.prefetchQuery({
        queryKey: key,
        queryFn: () => apiClient.get<OperationsHistoryResponse>(url),
        staleTime: 30_000,
      });
    },
    [operationsHistoryScope, queryClient, superAdminHistoryNetwork]
  );

  const openAfterLoad = useCallback(
    (target: FinanceInvestorAccordionExpanded) => {
      setPendingExpand(target);
      const investorId = target.kind === "investor" ? target.id : target.kind === "network" ? null : null;
      void prefetchHistory(investorId)
        .catch(() => {
          // если префетч не удался — всё равно раскроем, чтобы пользователь увидел ошибку/скелетон в ленте
        })
        .finally(() => {
          setPendingExpand(null);
          if (target.kind === "network") onToggleNetwork();
          else if (target.kind === "investor") onToggleInvestor(target.id);
        });
    },
    [onToggleInvestor, onToggleNetwork, prefetchHistory]
  );

  const networkBusy = pendingExpand?.kind === "network";
  const investorBusyId = pendingExpand?.kind === "investor" ? pendingExpand.id : null;

  const commonOwnerInvestors =
    superAdminHistoryNetwork === "common" ? investors.filter((i) => !isSuperAdminPlatformInvestor(i)) : [];
  const commonPlatformInvestors =
    superAdminHistoryNetwork === "common" ? investors.filter((i) => isSuperAdminPlatformInvestor(i)) : [];
  const commonOwnerSubtitle =
    superAdminHistoryNetwork === "common" && commonOwnerInvestors.length
      ? [...new Set(commonOwnerInvestors.map((o) => o.ownerUsername).filter(Boolean))].join(", ") || undefined
      : undefined;

  function renderInvestorCard(inv: FinanceInvestorAccordionModel) {
    const open = expanded.kind === "investor" && expanded.id === inv.id;
    const inactive = inv.status !== "active";
    const displayName = normalizeHandleDisplay(inv.handle) ?? inv.name;

    const invTotals = summaryById[String(inv.id)] ?? { growth: 0, paidOut: 0, openRequests: 0 };

    const headingMeta = (
      <>
        <div className="flex flex-wrap gap-1">
          {inv.isPrivate ? (
            <span className="inline-flex items-center gap-0.5 rounded-md bg-violet-500/14 px-1 py-px text-[8px] font-bold uppercase text-violet-200">
              <Lock className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
              Личн.
            </span>
          ) : null}
          {inactive ? (
            <span className="rounded-md bg-muted/45 px-1 py-px text-[8px] font-semibold uppercase text-muted-foreground">Пауза</span>
          ) : null}
        </div>
        <p className="truncate text-[10px] text-muted-foreground">{inv.name}</p>
      </>
    );

    return (
      <div
        key={inv.id}
        className="overflow-hidden rounded-2xl border border-border/35 shadow-[0_10px_36px_-22px_rgba(0,0,0,0.35)] dark:border-white/[0.09]"
      >
        {onOpenInvestorProfile ? (
          <div
            role="button"
            tabIndex={0}
            data-finance-investor-row-toggle={inv.id}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("[data-finance-investor-profile-open]")) return;
              openAfterLoad({ kind: "investor", id: inv.id });
            }}
            onPointerEnter={() => void prefetchHistory(inv.id)}
            onTouchStart={() => void prefetchHistory(inv.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                if ((e.target as HTMLElement).closest("[data-finance-investor-profile-open]")) return;
                e.preventDefault();
                openAfterLoad({ kind: "investor", id: inv.id });
              }
            }}
            className={cn(
              "relative flex w-full min-w-0 items-center gap-0.5 px-2 py-2 outline-none transition sm:gap-1 sm:px-3 sm:py-2.5",
              "cursor-pointer",
              "focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              open
                ? "bg-gradient-to-br from-primary/[0.14] via-primary/[0.05] to-transparent ring-1 ring-primary/28"
                : "bg-background/25 hover:bg-muted/15 dark:bg-black/18 dark:hover:bg-white/[0.05]"
            )}
            aria-busy={investorBusyId === inv.id ? "true" : undefined}
          >
            <div className="pointer-events-none absolute right-2 top-2 z-10 flex flex-col items-end gap-1" aria-hidden>
              <div className="flex items-center gap-1">
                {invTotals.growth > 0 ? (
                  <span
                    className="inline-flex items-center rounded-md border border-emerald-500/22 bg-emerald-500/[0.07] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-emerald-800 dark:text-emerald-200/95"
                    title="Начисления и пополнения в выборке (период + тип)"
                  >
                    +{formatCurrency(invTotals.growth)}
                  </span>
                ) : summaryReady ? null : (
                  <span className="inline-flex items-center rounded-md border border-border/30 bg-background/20 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground dark:border-white/[0.07] dark:bg-black/18">
                    +…
                  </span>
                )}
                {invTotals.paidOut > 0 ? (
                  <span
                    className="inline-flex items-center rounded-md border border-sky-500/22 bg-sky-500/[0.07] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-sky-900 dark:text-sky-200/95"
                    title="Завершённые выплаты в выборке (период + тип)"
                  >
                    −{formatCurrency(invTotals.paidOut)}
                  </span>
                ) : summaryReady ? null : (
                  <span className="inline-flex items-center rounded-md border border-border/30 bg-background/20 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground dark:border-white/[0.07] dark:bg-black/18">
                    −…
                  </span>
                )}
              </div>
              {(inv.requestedPayments ?? 0) > 0 ? (
                <span
                  className="inline-flex items-center rounded-md border border-amber-500/35 bg-amber-500/12 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-amber-900 dark:text-amber-100"
                  title="Активные заявки на выплату"
                >
                  {inv.requestedPayments} заявк.
                </span>
              ) : null}
            </div>
            {investorBusyId === inv.id ? (
              <div className="pointer-events-none absolute right-2 top-2 z-20" aria-hidden>
                <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/35 border-t-transparent" />
              </div>
            ) : null}
            <button
              type="button"
              data-finance-investor-profile-open
              onClick={(e) => {
                e.stopPropagation();
                onOpenInvestorProfile(inv.id);
              }}
              className={cn(
                "group flex min-w-0 max-w-[min(78vw,22rem)] flex-col gap-2 rounded-xl px-1 py-1 text-left outline-none transition",
                "hover:brightness-[1.03] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                "dark:hover:brightness-110"
              )}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={`Открыть карточку позиции ${inv.name}`}
            >
              <InvestorPositionAvatarHeading
                name={displayName}
                avatarInitialsSource={normalizeHandleDisplay(inv.handle)}
                avatarUrl={inv.avatarUrl}
                status={inv.status}
                avatarSize={42}
                className="gap-2.5"
                nickTrailing={
                  <span className="shrink-0 text-muted-foreground group-hover:text-foreground/80 sm:text-sm" aria-hidden>
                    ›
                  </span>
                }
                metaBelowNick={headingMeta}
              />
            </button>
            <div className="min-w-0 flex-1" aria-hidden />
          </div>
        ) : (
          <button
            type="button"
            data-finance-investor-row-toggle={inv.id}
            onClick={() => openAfterLoad({ kind: "investor", id: inv.id })}
            onPointerEnter={() => void prefetchHistory(inv.id)}
            onTouchStart={() => void prefetchHistory(inv.id)}
            className={cn(
              "flex w-full flex-col gap-2 px-3 py-2.5 text-left outline-none transition",
              "focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              open
                ? "bg-gradient-to-br from-primary/[0.14] via-primary/[0.05] to-transparent ring-1 ring-primary/28"
                : "bg-background/25 hover:bg-muted/15 dark:bg-black/18 dark:hover:bg-white/[0.05]"
            )}
            aria-expanded={open}
          >
            <InvestorPositionAvatarHeading
              name={inv.name}
              avatarInitialsSource={normalizeHandleDisplay(inv.handle)}
              avatarUrl={inv.avatarUrl}
              status={inv.status}
              avatarSize={42}
              className="gap-2.5"
              metaBelowNick={headingMeta}
            />
          </button>
        )}
        <MetricsRow
          scope={{ kind: "investor", id: inv.id }}
          body={inv.body}
          accrued={inv.accrued}
          paid={inv.paid}
          opFilter={opFilter}
          onApplyMetricFilter={onApplyMetricFilter}
          mutedSurface={open}
        />
        {open ? (
          <div data-finance-accordion-feed="investor" data-finance-feed-investor-id={inv.id}>
            {renderFeed(inv.id)}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <FinanceInvestorSelectionTruncationNotice
        investorSelection={opsSummaryData?.meta?.investorSelection}
        className="rounded-lg"
      />
      <div className="flex items-center justify-between gap-2 px-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Инвесторы в сети</span>
        <span className="text-[9px] text-muted-foreground/85">
          Ник — карточка · клик по строке — лента · метрики — тип
        </span>
      </div>

      <div className="space-y-2">
        <div className="overflow-hidden rounded-2xl border border-border/35 shadow-[0_10px_36px_-22px_rgba(0,0,0,0.35)] dark:border-white/[0.09]">
          <button
            type="button"
            data-finance-network-row-toggle
            onClick={() => openAfterLoad({ kind: "network" })}
            onPointerEnter={() => void prefetchHistory(null)}
            onTouchStart={() => void prefetchHistory(null)}
            className={cn(
              "flex w-full flex-col gap-2 px-3 py-2.5 text-left outline-none transition",
              "focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              networkOpen
                ? "bg-gradient-to-br from-emerald-500/[0.12] via-primary/[0.06] to-transparent ring-1 ring-emerald-500/25"
                : "bg-background/25 hover:bg-muted/15 dark:bg-black/18 dark:hover:bg-white/[0.05]"
            )}
            aria-expanded={networkOpen}
            aria-busy={networkBusy ? "true" : undefined}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-muted-foreground",
                  networkOpen ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-100" : "border-border/40 bg-background/55 dark:bg-black/28"
                )}
              >
                <Globe2 className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="truncate text-[13px] font-semibold tracking-tight text-foreground">Вся сеть</span>
                  <ChevronDown
                    className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", networkOpen && "rotate-180")}
                    aria-hidden
                  />
                </div>
                <p className="truncate text-[10px] text-muted-foreground">Сводка по всем позициям</p>
              </div>
              {networkBusy ? (
                <div className="flex shrink-0 items-center pr-0.5" aria-hidden>
                  <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/35 border-t-transparent" />
                </div>
              ) : null}
            </div>
          </button>
          <MetricsRow
            scope={{ kind: "network" }}
            body={networkTotals.body}
            accrued={networkTotals.accrued}
            paid={networkTotals.paid}
            opFilter={opFilter}
            onApplyMetricFilter={onApplyMetricFilter}
            mutedSurface={networkOpen}
          />
          {networkOpen ? (
            <div data-finance-accordion-feed="network">{renderFeed(null)}</div>
          ) : null}
        </div>

        {superAdminHistoryNetwork === "common" ? (
          <>
            {commonOwnerInvestors.length > 0 ? (
              <>
                <FinanceAccordionSectionLabel title="Владелец" subtitle={commonOwnerSubtitle} />
                {commonOwnerInvestors.map((inv) => renderInvestorCard(inv))}
              </>
            ) : null}
            {commonPlatformInvestors.length > 0 ? (
              <>
                <FinanceAccordionSectionLabel title="Платформа" subtitle="позиция администратора" />
                {commonPlatformInvestors.map((inv) => renderInvestorCard(inv))}
              </>
            ) : null}
          </>
        ) : (
          investors.map((inv) => renderInvestorCard(inv))
        )}
      </div>
    </div>
  );
}
