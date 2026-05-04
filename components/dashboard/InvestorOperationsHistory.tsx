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

type OpFilter = "all" | "accrual" | "payout" | "request" | "topup";

const PAGE_FIRST = 8;
const PAGE_MORE = 40;

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
}: {
  title: string;
  value: string;
  valueStyle?: CSSProperties;
}) {
  const merged = valueStyle?.color ? { ...valueStyle, ...metricValueStyle(String(valueStyle.color)) } : valueStyle;
  return (
    <div className="thai-stat-tile thai-glass border border-border/35 p-2">
      <Text className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{title}</Text>
      <span className="mt-0.5 block font-semibold tabular-nums text-sm leading-tight" style={merged}>
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
};

export function InvestorOperationsHistory({ enabled, glassCard, showMultiPositionLabels }: InvestorOperationsHistoryProps) {
  const [expanded, setExpanded] = useState(false);
  const [opFilter, setOpFilter] = useState<OpFilter>("all");
  const [visibleCap, setVisibleCap] = useState(PAGE_FIRST);

  const { data: opsData, isLoading: opsLoading } = useQuery({
    queryKey: ["investors", "operations-history"] as const,
    queryFn: () => apiClient.get<{ items: FinanceOperationItem[] }>("/api/investors/operations-history"),
    enabled,
    refetchInterval: 30_000,
  });

  const allOps = useMemo(() => opsData?.items ?? [], [opsData?.items]);
  const filteredOps = useMemo(() => allOps.filter((i) => opMatchesFilter(i, opFilter)), [allOps, opFilter]);
  const visibleOps = useMemo(() => filteredOps.slice(0, visibleCap), [filteredOps, visibleCap]);

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
    <section className="thai-glass overflow-hidden border-0" style={glassCard}>
      <button
        type="button"
        onClick={() => {
          setExpanded((v) => !v);
          setVisibleCap(PAGE_FIRST);
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

      {expanded ? (
        <div className="space-y-2 border-t border-border/25 px-2.5 pb-2.5 pt-2">
          <div className="flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                className="shrink-0 rounded-lg px-2.5 py-1 text-[11px]"
                onClick={() => {
                  setOpFilter(id);
                  setVisibleCap(PAGE_FIRST);
                }}
              >
                {label}
              </Button>
            ))}
          </div>

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
            <>
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
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "flex items-center gap-2 px-2 py-2 transition-colors hover:bg-muted/10",
                          item.syntheticOpen ? "bg-muted/10" : undefined
                        )}
                      >
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background/50"
                          style={{
                            borderColor: settled
                              ? "color-mix(in srgb, var(--thai-color-paid) 45%, transparent)"
                              : "color-mix(in srgb, var(--thai-color-due) 42%, transparent)",
                          }}
                          aria-hidden
                        >
                          <Percent
                            className="h-4 w-4 shrink-0"
                            strokeWidth={2}
                            style={{
                              color: settled ? "var(--thai-color-paid)" : "var(--thai-color-due)",
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
                            <span className="font-medium" style={{ color: settled ? "var(--thai-color-paid)" : "var(--thai-color-due)" }}>
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
                            className="text-[12px] font-semibold tabular-nums"
                            style={{
                              color: "var(--thai-color-accrued)",
                              WebkitTextFillColor: "var(--thai-color-accrued)",
                            }}
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
                      <div key={item.id} className="flex items-center gap-2 px-2 py-2 transition-colors hover:bg-muted/10">
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background/50"
                          style={{
                            borderColor: "color-mix(in srgb, var(--thai-color-accrued) 40%, transparent)",
                          }}
                          aria-hidden
                        >
                          <PlusCircle className="h-4 w-4 shrink-0 text-[var(--thai-color-accrued)]" strokeWidth={2} />
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
                            style={{ color: "var(--thai-color-accrued)", WebkitTextFillColor: "var(--thai-color-accrued)" }}
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

              {filteredOps.length > PAGE_FIRST ? (
                <button
                  type="button"
                  className="w-full rounded-lg border border-border/40 py-2 text-[12px] font-medium text-muted-foreground transition hover:bg-muted/15"
                  onClick={handlePagingClick}
                >
                  {pagingLabel}
                </button>
              ) : null}
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-border/40 px-3 py-6 text-center">
              <Text className="text-[12px] text-muted-foreground">
                {allOps.length === 0 ? "Операций пока нет." : "Нет операций в фильтре."}
              </Text>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

/** Компактные плитки метрик (те же классы, что на странице финансов — для e2e и единого вида). */
export function InvestorDashboardMetricTiles({
  body,
  accrued,
  paid,
  due,
}: {
  body: number;
  accrued: number;
  paid: number;
  due: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <CompactStat title="Тело" value={formatCurrency(body)} valueStyle={{ color: "var(--thai-color-text-primary)" }} />
      <CompactStat title="Начислено" value={formatCurrency(accrued)} valueStyle={{ color: "var(--thai-color-accrued)" }} />
      <CompactStat title="Выплачено" value={formatCurrency(paid)} valueStyle={{ color: "var(--thai-color-paid)" }} />
      <CompactStat title="К выплате" value={formatCurrency(due)} valueStyle={{ color: "var(--thai-color-due)" }} />
    </div>
  );
}
