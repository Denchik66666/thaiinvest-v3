"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Banknote, CalendarRange, ChevronLeft, PlusCircle, UserPlus } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";
import { investorsDashboardListQueryKey, investorsDashboardNetworkParam } from "@/lib/investors-query";
import { formatCurrency, cn } from "@/lib/utils";
import { isSameOpenWeekAsNow, openWeekDayProgress, sumExpectedOpenWeekAccrualGross } from "@/lib/open-week-forecast";
import type { FinanceOperationItem } from "@/types/finance-operations";
import { getPreviousOrCurrentMonday } from "@/lib/weekly";
import { DASHBOARD_STICKY_BAR_CLASS } from "@/lib/dashboard-sticky-bar";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import MobileBottomNav from "@/components/navigation/MobileBottomNav";
import NotificationBell from "@/components/notifications/NotificationBell";
import ThemeToggle from "@/components/ThemeToggle";
import {
  getPaymentStatusBlock,
  pickLatestWithdrawalRequest,
  type WithdrawalRequestPayment,
} from "@/components/dashboard/investor-withdrawal-request-status";

type InvestorRow = {
  id: number;
  name: string;
  body: number;
  accrued: number;
  paid: number;
  due: number;
  status: string;
  isPrivate: boolean;
  owner: { username: string };
  payments?: WithdrawalRequestPayment[] | null;
};

type OpFilter = "all" | "accrual" | "payout" | "request" | "topup";

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

export default function FinancePage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!loading && user && user.role !== "INVESTOR") {
      router.replace("/dashboard/manage");
    }
  }, [loading, user, router]);

  const { data, isLoading, isError } = useQuery({
    queryKey: investorsDashboardListQueryKey(user?.role),
    queryFn: () =>
      apiClient.get<{ investors: InvestorRow[] }>(
        `/api/investors?network=${investorsDashboardNetworkParam(user!.role)}&lean=1`
      ),
    enabled: !!user && user.role === "INVESTOR",
    refetchInterval: 30_000,
  });

  const investors = useMemo(() => data?.investors ?? [], [data?.investors]);

  const openWeekMondayIso = getPreviousOrCurrentMonday(new Date()).toISOString();

  const { data: businessRateRes, isSuccess: businessRateFetched } = useQuery({
    queryKey: ["system", "business-rate", openWeekMondayIso] as const,
    queryFn: () =>
      apiClient.get<{ success: boolean; current: { rate: number } | null }>(
        `/api/system/business-rate?at=${encodeURIComponent(openWeekMondayIso)}`
      ),
    enabled: !!user && user.role === "INVESTOR",
    staleTime: 60_000,
  });

  const openWeekProgress = openWeekDayProgress();
  const forecastGross = sumExpectedOpenWeekAccrualGross(
    investors.map((i) => ({ body: i.body, isPrivate: i.isPrivate })),
    businessRateRes?.current?.rate ?? null
  );

  const latestWithdrawalRequest = useMemo(() => {
    if (isError) return null;
    return pickLatestWithdrawalRequest(investors);
  }, [investors, isError]);

  const { data: opsData, isLoading: opsLoading, isFetching: opsFetching } = useQuery({
    queryKey: ["investors", "operations-history"] as const,
    queryFn: () => apiClient.get<{ items: FinanceOperationItem[] }>("/api/investors/operations-history"),
    enabled: !!user && user.role === "INVESTOR",
    refetchInterval: 30_000,
  });

  const allOps = useMemo(() => opsData?.items ?? [], [opsData?.items]);
  const [opFilter, setOpFilter] = useState<OpFilter>("all");
  const filteredOps = useMemo(() => allOps.filter((i) => opMatchesFilter(i, opFilter)), [allOps, opFilter]);
  const [showAllOps, setShowAllOps] = useState(false);
  const visibleOps = useMemo(
    () => (showAllOps ? filteredOps : filteredOps.slice(0, 40)),
    [filteredOps, showAllOps]
  );

  const isHistoryLoading = isLoading || opsLoading || opsFetching;

  const totals = useMemo(
    () =>
      investors.reduce(
        (acc, inv) => ({
          body: acc.body + (inv.body || 0),
          accrued: acc.accrued + (inv.accrued || 0),
          paid: acc.paid + (inv.paid || 0),
          due: acc.due + (inv.due || 0),
        }),
        { body: 0, accrued: 0, paid: 0, due: 0 }
      ),
    [investors]
  );

  if (loading || !user) {
    return (
      <Container>
        <div className="thai-dashboard-root flex min-h-screen items-center justify-center py-16">
          <div className="thai-glass flex flex-col items-center gap-3 rounded-2xl px-8 py-6">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <Text className="text-foreground">Загрузка…</Text>
          </div>
        </div>
      </Container>
    );
  }

  if (user.role !== "INVESTOR") return null;

  return (
    <Container>
      <div className="thai-dashboard-root min-h-screen space-y-3 py-3 pb-24 md:space-y-5 md:py-8 md:pb-28">
        <div className={DASHBOARD_STICKY_BAR_CLASS}>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="thai-glass flex min-w-0 items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm font-medium transition hover:brightness-[1.03] dark:hover:brightness-110"
          >
            <ChevronLeft className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
            <span className="truncate">Главная</span>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />
            <ThemeToggle />
          </div>
        </div>

        <Card className="space-y-2.5 p-3 md:p-5">
          <div className="thai-hero-accent" aria-hidden />
          <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Финансы</Text>
          <Text className="text-lg font-semibold tracking-tight text-foreground">Твои показатели</Text>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat title="Тело" value={formatCurrency(totals.body)} valueStyle={{ color: "var(--thai-color-text-primary)" }} />
            <Stat title="Начислено" value={formatCurrency(totals.accrued)} valueStyle={{ color: "var(--thai-color-accrued)" }} />
            <Stat title="Выплачено" value={formatCurrency(totals.paid)} valueStyle={{ color: "var(--thai-color-paid)" }} />
            <Stat title="К выплате" value={formatCurrency(totals.due)} valueStyle={{ color: "var(--thai-color-due)" }} />
          </div>
          {investors.length > 0 && forecastGross != null ? (
            <Text className="text-[11px] leading-snug text-muted-foreground">
              Ожидается за текущую неделю (прогноз, до выплат): ≈ +{formatAmount(forecastGross)} ₿ · дней{" "}
              {openWeekProgress.daySpan}/7
            </Text>
          ) : businessRateFetched && businessRateRes?.current == null && investors.length > 0 ? (
            <Text className="text-[11px] leading-snug text-muted-foreground">
              Ставка сети пока не задана — прогноз за неделю не считается.
            </Text>
          ) : null}
        </Card>

        <Card className="space-y-2.5 p-3 md:p-5">
          <div className="flex items-center justify-between gap-2">
            <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Мои позиции</Text>
            <Button size="sm" variant="outline" onClick={() => router.push("/dashboard/reports")}>
              Отчёты
            </Button>
          </div>
          {isLoading ? (
            <Text className="text-sm text-muted-foreground">Загрузка...</Text>
          ) : investors.length === 0 ? (
            <Text className="text-sm text-muted-foreground">Пока нет инвестиций.</Text>
          ) : (
            <div className="space-y-1.5 md:space-y-2">
              {investors.map((inv) => (
                <button
                  key={inv.id}
                  type="button"
                  onClick={() => router.push(`/dashboard/investors/${inv.id}`)}
                  className={cn(
                    "thai-row-interactive w-full rounded-xl border border-border/40 p-2.5 text-left md:p-3",
                    "thai-glass hover:border-primary/25"
                  )}
                >
                  <Text className="font-semibold">{inv.name}</Text>
                  <Text className="mt-1 text-xs text-muted-foreground">OWNER: {inv.owner.username}</Text>
                </button>
              ))}
            </div>
          )}
        </Card>

        {!isError && latestWithdrawalRequest ? getPaymentStatusBlock(latestWithdrawalRequest) : null}

        <div
          style={{
            marginTop: 16,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div
            className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between"
            style={{ paddingLeft: 2, paddingRight: 2 }}
          >
            <span
              style={{
                fontSize: 10,
                color: "var(--thai-color-text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                fontWeight: 600,
              }}
            >
              История операций
            </span>
            {!isHistoryLoading && allOps.length > 0 ? (
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {allOps.length} шт. · фильтр: {filteredOps.length}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2 px-0.5">
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
                className="rounded-lg text-xs"
                onClick={() => {
                  setOpFilter(id);
                  setShowAllOps(false);
                }}
              >
                {label}
              </Button>
            ))}
          </div>

          {isHistoryLoading ? (
            <div
              className="overflow-hidden rounded-2xl border"
              style={{
                borderColor: "var(--thai-color-card-border)",
                background: "var(--thai-color-card-bg)",
              }}
            >
              <div className="divide-y divide-border/35">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5 sm:px-3.5">
                    <div className="h-10 w-10 shrink-0 rounded-full bg-muted/35" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="h-3.5 max-w-[11rem] rounded-md bg-muted/35" />
                      <div className="h-2.5 max-w-[14rem] rounded-md bg-muted/25" />
                    </div>
                    <div className="shrink-0 space-y-1.5 text-right">
                      <div className="ml-auto h-3.5 w-14 rounded-md bg-muted/35" />
                      <div className="ml-auto h-2.5 w-12 rounded-md bg-muted/25" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : visibleOps.length > 0 ? (
            <div
              className="overflow-hidden rounded-2xl border shadow-sm"
              style={{
                borderColor: "var(--thai-color-card-border)",
                background: "color-mix(in srgb, var(--thai-color-card-bg) 92%, transparent)",
                animation: "thai-fade-in-up 0.28s ease forwards",
              }}
            >
              <div className="divide-y divide-border/35">
                {visibleOps.map((item) => {
                  if (item.kind === "week_accrual") {
                    const settled = item.paidTotal > 0;
                    const rateLabel = formatNetworkWeeklyRate(item.networkRatePercent);
                    const isOpenWeek = isSameOpenWeekAsNow(item.weekStart);
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 sm:gap-3.5 sm:px-3.5 sm:py-2.5",
                          "transition-colors duration-150 hover:bg-muted/15 active:bg-muted/25",
                          item.syntheticOpen ? "bg-muted/10" : undefined
                        )}
                      >
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-background/50 backdrop-blur-sm"
                          style={{
                            borderColor: settled
                              ? "color-mix(in srgb, var(--thai-color-paid) 45%, transparent)"
                              : "color-mix(in srgb, var(--thai-color-due) 42%, transparent)",
                            boxShadow: settled
                              ? "inset 0 0 0 1px color-mix(in srgb, var(--thai-color-paid) 12%, transparent)"
                              : "inset 0 0 0 1px color-mix(in srgb, var(--thai-color-due) 10%, transparent)",
                          }}
                          aria-hidden
                        >
                          <CalendarRange
                            className="h-[18px] w-[18px] shrink-0"
                            strokeWidth={2}
                            style={{
                              color: settled ? "var(--thai-color-paid)" : "var(--thai-color-due)",
                              opacity: 0.92,
                            }}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-semibold tabular-nums tracking-tight text-foreground sm:text-sm">
                            Начисление за неделю · {formatDate(item.weekStart)} — {formatDate(item.weekEnd)}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] leading-snug">
                            {rateLabel ? (
                              <span className="text-muted-foreground">Сеть {rateLabel}</span>
                            ) : (
                              <span className="text-muted-foreground">Ставка сети —</span>
                            )}
                            <span className="px-1 text-border/80">·</span>
                            <span
                              className="font-medium"
                              style={{ color: settled ? "var(--thai-color-paid)" : "var(--thai-color-due)" }}
                            >
                              {settled ? "Есть выплаты за неделю" : "Без выплат за неделю"}
                            </span>
                          </div>
                          {(item.syntheticOpen || (isOpenWeek && item.accrued === 0)) ? (
                            <Text className="mt-1 text-[10px] leading-snug text-muted-foreground">
                              Неделя не закончена — +0 в ленте до ПН; прогноз см. «Твои показатели».
                            </Text>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-right leading-tight">
                          <div
                            data-finance-history="accrued"
                            className="text-[13px] font-semibold tabular-nums sm:text-sm"
                            style={{
                              color: "var(--thai-color-accrued)",
                              WebkitTextFillColor: "var(--thai-color-accrued)",
                            }}
                          >
                            +{formatAmount(item.accrued)} ₿
                          </div>
                          {item.paidTotal > 0 ? (
                            <div
                              data-finance-history="paid"
                              className="mt-0.5 text-[11px] font-medium tabular-nums"
                              style={{
                                color: "var(--thai-color-paid)",
                                WebkitTextFillColor: "var(--thai-color-paid)",
                              }}
                            >
                              выпл. {formatAmount(item.paidTotal)} ₿
                            </div>
                          ) : (
                            <div className="mt-0.5 text-[10px] font-medium text-muted-foreground">без выплат</div>
                          )}
                        </div>
                      </div>
                    );
                  }

                  if (item.kind === "topup") {
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 px-3 py-2.5 sm:gap-3.5 sm:px-3.5 sm:py-2.5 transition-colors duration-150 hover:bg-muted/15 active:bg-muted/25"
                      >
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-background/50 backdrop-blur-sm"
                          style={{
                            borderColor: "color-mix(in srgb, var(--thai-color-accrued) 40%, transparent)",
                          }}
                          aria-hidden
                        >
                          <PlusCircle
                            className="h-[18px] w-[18px] shrink-0 text-[var(--thai-color-accrued)]"
                            strokeWidth={2}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-semibold text-foreground sm:text-sm">
                            Пополнение тела · {item.positionName}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {paymentStatusShort(item.status)} · {formatDateTime(item.sortAt)}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <span
                            className="text-[13px] font-semibold tabular-nums sm:text-sm"
                            style={{ color: "var(--thai-color-accrued)", WebkitTextFillColor: "var(--thai-color-accrued)" }}
                          >
                            +{formatAmount(item.amount)} ₿
                          </span>
                        </div>
                      </div>
                    );
                  }

                  if (item.kind === "position_start") {
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 px-3 py-2.5 sm:gap-3.5 sm:px-3.5 sm:py-2.5 transition-colors duration-150 hover:bg-muted/15 active:bg-muted/25"
                      >
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-background/50 backdrop-blur-sm"
                          aria-hidden
                        >
                          <UserPlus className="h-[18px] w-[18px] shrink-0 text-primary" strokeWidth={2} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-semibold text-foreground sm:text-sm">
                            Открытие позиции · {item.positionName}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            Вход {formatDate(item.entryDate)} · активация {formatDate(item.activationDate)}
                          </div>
                          <Text className="mt-1 text-[10px] leading-snug text-muted-foreground">
                            Начальное тело при создании (не заявка «Пополнение»). Дальнейшие пополнения — отдельные
                            строки.
                          </Text>
                        </div>
                        <div className="shrink-0 text-right">
                          <span
                            className="text-[13px] font-semibold tabular-nums sm:text-sm"
                            style={{ color: "var(--thai-color-text-primary)" }}
                          >
                            {formatAmount(item.amount)} ₿
                          </span>
                        </div>
                      </div>
                    );
                  }

                  const isOut = item.status === "completed";
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-3 py-2.5 sm:gap-3.5 sm:px-3.5 sm:py-2.5 transition-colors duration-150 hover:bg-muted/15 active:bg-muted/25"
                    >
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-background/50 backdrop-blur-sm"
                        style={{
                          borderColor: isOut
                            ? "color-mix(in srgb, var(--thai-color-paid) 45%, transparent)"
                            : "color-mix(in srgb, var(--thai-color-due) 42%, transparent)",
                        }}
                        aria-hidden
                      >
                        <Banknote
                          className="h-[18px] w-[18px] shrink-0"
                          strokeWidth={2}
                          style={{
                            color: isOut ? "var(--thai-color-paid)" : "var(--thai-color-due)",
                            opacity: 0.92,
                          }}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold text-foreground sm:text-sm">
                          {paymentTypeLabel(item.type)} · {item.positionName}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {paymentStatusShort(item.status)} · {formatDateTime(item.sortAt)}
                        </div>
                      </div>
                      <div className="shrink-0 text-right leading-tight">
                        <div
                          className="text-[13px] font-semibold tabular-nums sm:text-sm"
                          style={{
                            color: isOut ? "var(--thai-color-paid)" : "var(--thai-color-due)",
                            WebkitTextFillColor: isOut ? "var(--thai-color-paid)" : "var(--thai-color-due)",
                          }}
                        >
                          {isOut ? "−" : ""}
                          {formatAmount(item.amount)} ₿
                        </div>
                        {!isOut ? (
                          <div className="mt-0.5 text-[10px] font-medium text-muted-foreground">заявка</div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {!isHistoryLoading && filteredOps.length > 40 ? (
            <button
              type="button"
              onClick={() => setShowAllOps(!showAllOps)}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 10,
                background: "transparent",
                border: "1px solid var(--thai-color-card-border)",
                color: "var(--thai-color-text-secondary)",
                fontSize: 13,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = "var(--thai-color-card-bg)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              {showAllOps
                ? "↑ Скрыть · показать только последние 40"
                : `↓ Показать все · ещё ${filteredOps.length - 40} операций`}
            </button>
          ) : null}

          {!isHistoryLoading && filteredOps.length === 0 ? (
            <div
              style={{
                padding: "32px 16px",
                textAlign: "center",
                color: "var(--thai-color-text-muted)",
                fontSize: 14,
              }}
            >
              {allOps.length === 0
                ? "Операций пока нет — начисления по неделям, выплаты, заявки и пополнения появятся здесь."
                : "Нет операций в выбранном фильтре."}
            </div>
          ) : null}
        </div>

        <MobileBottomNav active="finance" />
      </div>
    </Container>
  );
}

function metricValueStyle(color: string): CSSProperties {
  return { color, WebkitTextFillColor: color };
}

function Stat({ title, value, valueStyle }: { title: string; value: string; valueStyle?: CSSProperties }) {
  const merged = valueStyle?.color ? { ...valueStyle, ...metricValueStyle(String(valueStyle.color)) } : valueStyle;
  return (
    <div className="thai-stat-tile thai-glass border border-border/35 p-3">
      <Text className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</Text>
      <span className="mt-1 block font-semibold tabular-nums text-base leading-tight sm:text-lg" style={merged}>
        {value}
      </span>
    </div>
  );
}
