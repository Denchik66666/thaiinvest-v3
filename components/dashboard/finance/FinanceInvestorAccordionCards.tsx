"use client";

import type { ReactNode } from "react";
import { ChevronDown, Globe2, Lock } from "lucide-react";

import { cn, formatCurrency } from "@/lib/utils";
import { InvestorPositionAvatarHeading } from "@/components/dashboard/InvestorPositionAvatarHeading";
import type { FinanceOperationsHistoryOpFilter } from "@/types/finance-operations-filter";

export type FinanceInvestorAccordionModel = {
  id: number;
  name: string;
  /** Ник на позиции (`handle`), иначе логин привязанного аккаунта — см. `/api/investors` lean. */
  handle: string | null;
  body: number;
  accrued: number;
  due: number;
  status: string;
  isPrivate?: boolean;
  requestedPayments?: number;
};

export type FinanceInvestorAccordionExpanded =
  | { kind: "collapsed" }
  | { kind: "network" }
  | { kind: "investor"; id: number };

/** Область карточки для фильтра ленты (совпадает с выбором позиции в аккордеоне). */
export type FinanceMetricFilterScope = { kind: "network" } | { kind: "investor"; id: number };

type Props = {
  investors: FinanceInvestorAccordionModel[];
  networkTotals: { body: number; accrued: number; due: number };
  expanded: FinanceInvestorAccordionExpanded;
  onToggleNetwork: () => void;
  onToggleInvestor: (id: number) => void;
  /** Аватар и имя — открыть карточку позиции (как на главной у владельца). */
  onOpenInvestorProfile?: (id: number) => void;
  renderFeed: (investorId: number | null) => ReactNode;
  opFilter: FinanceOperationsHistoryOpFilter;
  onApplyMetricFilter: (filter: FinanceOperationsHistoryOpFilter, scope: FinanceMetricFilterScope) => void;
};

/** Тело → пополнения; начислено → начисления; к выплате → открытые заявки на выплату. */
const BODY_OPS_FILTER: FinanceOperationsHistoryOpFilter = "topup";
const ACCRUED_OPS_FILTER: FinanceOperationsHistoryOpFilter = "accrual";
const DUE_OPS_FILTER: FinanceOperationsHistoryOpFilter = "request";

function MetricChipButton({
  label,
  value,
  valueClassName,
  selected,
  ariaLabel,
  onPick,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  selected: boolean;
  ariaLabel: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
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
  due,
  opFilter,
  onApplyMetricFilter,
  mutedSurface,
}: {
  scope: FinanceMetricFilterScope;
  body: number;
  accrued: number;
  due: number;
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
        onPick={() => onApplyMetricFilter(ACCRUED_OPS_FILTER, scope)}
      />
      <MetricChipButton
        label="К выплате"
        value={formatCurrency(due)}
        valueClassName="thai-dashboard-premium-matte-amount text-[11px]"
        selected={opFilter === DUE_OPS_FILTER}
        ariaLabel="Фильтр операций: заявки на выплату"
        onPick={() => onApplyMetricFilter(DUE_OPS_FILTER, scope)}
      />
    </div>
  );
}

export function FinanceInvestorAccordionCards({
  investors,
  networkTotals,
  expanded,
  onToggleNetwork,
  onToggleInvestor,
  onOpenInvestorProfile,
  renderFeed,
  opFilter,
  onApplyMetricFilter,
}: Props) {
  const networkOpen = expanded.kind === "network";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Инвесторы в сети</span>
        <span className="text-[9px] text-muted-foreground/85">
          Имя — карточка · шеврон — лента · метрики — тип
        </span>
      </div>

      <div className="space-y-2">
        <div className="overflow-hidden rounded-2xl border border-border/35 shadow-[0_10px_36px_-22px_rgba(0,0,0,0.35)] dark:border-white/[0.09]">
          <button
            type="button"
            onClick={onToggleNetwork}
            className={cn(
              "flex w-full flex-col gap-2 px-3 py-2.5 text-left outline-none transition",
              "focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              networkOpen
                ? "bg-gradient-to-br from-emerald-500/[0.12] via-primary/[0.06] to-transparent ring-1 ring-emerald-500/25"
                : "bg-background/25 hover:bg-muted/15 dark:bg-black/18 dark:hover:bg-white/[0.05]"
            )}
            aria-expanded={networkOpen}
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
            </div>
          </button>
          <MetricsRow
            scope={{ kind: "network" }}
            body={networkTotals.body}
            accrued={networkTotals.accrued}
            due={networkTotals.due}
            opFilter={opFilter}
            onApplyMetricFilter={onApplyMetricFilter}
            mutedSurface={networkOpen}
          />
          {networkOpen ? renderFeed(null) : null}
        </div>

        {investors.map((inv) => {
          const open = expanded.kind === "investor" && expanded.id === inv.id;
          const inactive = inv.status !== "active";

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
                {(inv.requestedPayments ?? 0) > 0 ? (
                  <span className="rounded-md bg-amber-500/18 px-1 py-px text-[8px] font-bold tabular-nums text-amber-100">
                    {inv.requestedPayments} заявк.
                  </span>
                ) : null}
              </div>
              {inv.handle?.trim() ? (
                <p className="truncate text-[10px] text-muted-foreground">{inv.handle.trim()}</p>
              ) : null}
            </>
          );

          return (
            <div
              key={inv.id}
              className="overflow-hidden rounded-2xl border border-border/35 shadow-[0_10px_36px_-22px_rgba(0,0,0,0.35)] dark:border-white/[0.09]"
            >
              {onOpenInvestorProfile ? (
                <div
                  className={cn(
                    "flex w-full min-w-0 items-center gap-0.5 px-2 py-2 sm:gap-1 sm:px-3 sm:py-2.5",
                    open
                      ? "bg-gradient-to-br from-primary/[0.14] via-primary/[0.05] to-transparent ring-1 ring-primary/28"
                      : "bg-background/25 dark:bg-black/18"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onOpenInvestorProfile(inv.id)}
                    className={cn(
                      "group flex min-w-0 flex-1 flex-col gap-2 rounded-xl px-1 py-1 text-left outline-none transition",
                      "hover:brightness-[1.03] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      "dark:hover:brightness-110"
                    )}
                    aria-label={`Открыть карточку позиции ${inv.name}`}
                  >
                    <InvestorPositionAvatarHeading
                      name={inv.name}
                      avatarInitialsSource={inv.handle}
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
                  <button
                    type="button"
                    onClick={() => onToggleInvestor(inv.id)}
                    aria-expanded={open}
                    aria-label={open ? "Свернуть список операций" : "Развернуть список операций"}
                    className={cn(
                      "flex h-11 w-10 shrink-0 items-center justify-center rounded-xl outline-none transition",
                      "hover:bg-muted/25 active:bg-muted/35",
                      "focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    )}
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                        open && "rotate-180"
                      )}
                      aria-hidden
                    />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onToggleInvestor(inv.id)}
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
                    avatarInitialsSource={inv.handle}
                    status={inv.status}
                    avatarSize={42}
                    className="gap-2.5"
                    nickTrailing={
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                          open && "rotate-180"
                        )}
                        aria-hidden
                      />
                    }
                    metaBelowNick={headingMeta}
                  />
                </button>
              )}
              <MetricsRow
                scope={{ kind: "investor", id: inv.id }}
                body={inv.body}
                accrued={inv.accrued}
                due={inv.due}
                opFilter={opFilter}
                onApplyMetricFilter={onApplyMetricFilter}
                mutedSurface={open}
              />
              {open ? renderFeed(inv.id) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
