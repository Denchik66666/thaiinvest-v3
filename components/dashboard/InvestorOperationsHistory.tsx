"use client";

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Banknote, ChevronDown, Percent, PlusCircle } from "lucide-react";

import { apiClient } from "@/lib/api-client";
import { cn, formatCurrency } from "@/lib/utils";
import { isSameOpenWeekAsNow } from "@/lib/open-week-forecast";
import type { FinanceOperationItem } from "@/types/finance-operations";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { HistoryPeriodPopover, sortAtInHistoryPeriod, type HistoryPeriodValue } from "@/components/dashboard/HistoryPeriodPopover";

type OpFilter = "all" | "accrual" | "payout" | "request" | "topup";

const PAGE_FIRST = 8;
const PAGE_MORE = 40;
/** Показать все строки истории без «Показать ещё» по умолчанию */
const SHOW_ALL_HISTORY_CAP = Number.MAX_SAFE_INTEGER;

function opMatchesFilter(item: FinanceOperationItem, f: OpFilter): boolean {
  if (f === "all") return true;
  if (f === "accrual") return item.kind === "week_accrual";
  if (f === "topup") return item.kind === "topup";
  if (f === "payout") return item.kind === "payment" && item.status === "completed";
  if (f === "request") return item.kind === "payment" && item.status !== "completed";
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
    requested: "На рассмотрении",
    pending: "В очереди",
    approved_waiting_accept: "Ожидает решения",
    rejected: "Отклонено",
    expired: "Истекло",
    disputed: "Спор",
    completed_at_creation: "При создании позиции",
  };
  return map[status] ?? status;
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
  /** Плотная сетка на главной инвестора */
  compact?: boolean;
  className?: string;
}) {
  const merged = valueStyle?.color ? { ...valueStyle, ...metricValueStyle(String(valueStyle.color)) } : valueStyle;
  return (
    <div
      className={cn(
        "thai-stat-tile thai-glass border border-border/35",
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

export type InvestorOperationsHistoryProps = {
  enabled: boolean;
  glassCard: CSSProperties;
  /** Несколько позиций — подписи с именем в строках. */
  showMultiPositionLabels: boolean;
  /**
   * Главная инвестора: лента и фильтры сразу, без сворачивания (родитель даёт общую карточку).
   */
  embedded?: boolean;
};

export function InvestorOperationsHistory({
  enabled,
  glassCard,
  showMultiPositionLabels,
  embedded = false,
}: InvestorOperationsHistoryProps) {
  const [expanded, setExpanded] = useState(false);
  const showPanel = embedded || expanded;
  const [opFilter, setOpFilter] = useState<OpFilter>("all");
  const [periodValue, setPeriodValue] = useState<HistoryPeriodValue>({ kind: "preset", preset: "all" });
  const [visibleCap, setVisibleCap] = useState(SHOW_ALL_HISTORY_CAP);

  const { data: opsData, isLoading: opsLoading } = useQuery({
    queryKey: ["investors", "operations-history"] as const,
    queryFn: () => apiClient.get<{ items: FinanceOperationItem[] }>("/api/investors/operations-history"),
    enabled,
    refetchInterval: 30_000,
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
  const visibleOps = useMemo(() => filteredOps.slice(0, visibleCap), [filteredOps, visibleCap]);

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

  const historyHeader = embedded ? (
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

  const historyBody = showPanel ? (
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col gap-2",
            embedded ? "px-0 pb-0 pt-0" : "border-t border-border/25 px-2.5 pb-2.5 pt-2"
          )}
        >
          {/* Полоска периода + фильтров поверх ленты: overflow-x-auto иначе «стригает» чипы по вертикали без py */}
          <div className="relative z-10 flex min-w-0 flex-nowrap items-center gap-2">
            <HistoryPeriodPopover
              className="shrink-0"
              compact={embedded}
              value={periodValue}
              onChange={(next) => {
                setPeriodValue(next);
                resetVisibleCap();
              }}
            />
            <div className="min-w-0 flex-1 overflow-x-auto px-0 py-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex w-max items-center gap-1 pr-2">
                {(
                  [
                    ["all", "Все"],
                    ["accrual", "Начисления"],
                    ["payout", "Выплаты"],
                    ["request", "Заявки"],
                    ["topup", "Пополнения"],
                  ] as const
                ).map(([id, label]) => (
                  <Button
                    key={id}
                    type="button"
                    size="sm"
                    variant={opFilter === id ? "primary" : "outline"}
                    className={cn(
                      "h-8 shrink-0 whitespace-nowrap rounded-full px-2.5 py-0 text-[10px] font-semibold leading-none",
                      embedded && "px-2"
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
          </div>

          <div
            className={cn(
              "relative z-0 thai-investor-history-scroll overflow-y-auto rounded-xl border border-border/30",
              embedded ? "min-h-0 flex-1" : "max-h-[min(60vh,32rem)]"
            )}
          >
            {isBusy ? (
              <div className="divide-y divide-border/35 overflow-hidden rounded-xl border border-border/35">
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
                className="divide-y divide-border/35 overflow-hidden rounded-xl border border-border/35"
                style={{
                  background: "color-mix(in srgb, var(--thai-color-card-bg) 92%, transparent)",
                }}
              >
                {visibleOps.map((item) => {
                  if (item.kind === "week_accrual") {
                    const settled = item.paidTotal > 0;
                    const rateLabel = formatNetworkWeeklyRate(item.networkRatePercent);
                    const isOpenWeek = isSameOpenWeekAsNow(item.weekStart);
                    const accrualPreviewGold =
                      item.accrued === 0 && (item.syntheticOpen || isOpenWeek);
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "flex items-center gap-2 px-2 py-2 transition-colors hover:bg-muted/10",
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
                              accrualPreviewGold && "thai-investor-premium-gold-amount"
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
                    const subline = item.initialFromCreation
                      ? `${paymentStatusShort(item.status)} · вх. ${formatDate(item.entryDate ?? item.sortAt)}`
                      : `${paymentStatusShort(item.status)} · ${formatDateTime(item.sortAt)}`;
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-2 px-2 py-2 transition-colors hover:bg-muted/10"
                        style={{ background: "var(--thai-color-topup-bg)" }}
                      >
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background/50"
                          style={{
                            borderColor: "color-mix(in srgb, var(--thai-color-topup) 45%, transparent)",
                          }}
                          aria-hidden
                        >
                          <PlusCircle className="h-4 w-4 shrink-0 text-[var(--thai-color-topup)]" strokeWidth={2} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12px] font-semibold text-foreground">
                            {showMultiPositionLabels ? `Пополнение · ${item.positionName}` : "Пополнение тела"}
                          </div>
                          <div className="line-clamp-2 text-[10px] text-muted-foreground">{subline}</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <span
                            className="text-[12px] font-semibold tabular-nums"
                            style={{ color: "var(--thai-color-topup)", WebkitTextFillColor: "var(--thai-color-topup)" }}
                          >
                            +{formatAmount(item.amount)}
                          </span>
                        </div>
                      </div>
                    );
                  }

                  const isOut = item.status === "completed";
                  return (
                    <div key={item.id} className="flex items-center gap-2 px-2 py-2 transition-colors hover:bg-muted/10">
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background/50"
                        style={{
                          borderColor: isOut
                            ? "color-mix(in srgb, var(--thai-color-paid) 45%, transparent)"
                            : "color-mix(in srgb, var(--thai-color-due) 42%, transparent)",
                        }}
                        aria-hidden
                      >
                        <Banknote
                          className="h-4 w-4 shrink-0"
                          strokeWidth={2}
                          style={{
                            color: isOut ? "var(--thai-color-paid)" : "var(--thai-color-due)",
                            opacity: 0.92,
                          }}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px] font-semibold text-foreground">
                          {showMultiPositionLabels ? `${paymentTypeLabel(item.type)} · ${item.positionName}` : paymentTypeLabel(item.type)}
                        </div>
                        <div className="line-clamp-2 text-[10px] text-muted-foreground">{formatPaymentHistorySubline(item)}</div>
                      </div>
                      <div className="shrink-0 text-right leading-tight">
                        <div
                          className="text-[12px] font-semibold tabular-nums"
                          style={{
                            color: isOut ? "var(--thai-color-paid)" : "var(--thai-color-due)",
                            WebkitTextFillColor: isOut ? "var(--thai-color-paid)" : "var(--thai-color-due)",
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
              <div className="rounded-xl border border-dashed border-border/40 px-3 py-6 text-center">
                <Text className="text-[12px] text-muted-foreground">
                  {allOps.length === 0 ? "Операций пока нет." : "Нет операций в выбранном периоде и фильтре."}
                </Text>
              </div>
            )}
          </div>

          {!isBusy && visibleOps.length > 0 && filteredOps.length > PAGE_FIRST ? (
            <button
              type="button"
              className="w-full shrink-0 rounded-lg border border-border/40 py-2 text-[12px] font-medium text-muted-foreground transition hover:bg-muted/15"
              onClick={handlePagingClick}
            >
              {pagingLabel}
            </button>
          ) : null}
        </div>
  ) : null;

  if (embedded) {
    return (
      <div className="thai-investor-history-embedded flex min-h-0 min-w-0 flex-1 flex-col">
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
export function InvestorDashboardMetricTiles({
  body,
  accrued,
  paid,
}: {
  body: number;
  accrued: number;
  paid: number;
}) {
  return (
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
        title="Начислено"
        value={formatCurrency(accrued)}
        valueStyle={{ color: "var(--thai-color-accrued)" }}
      />
      <CompactStat compact title="Выплачено" value={formatCurrency(paid)} valueStyle={{ color: "var(--thai-color-paid)" }} />
    </div>
  );
}
