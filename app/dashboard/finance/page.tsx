"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueries } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";
import { investorsDashboardListQueryKey, investorsDashboardNetworkParam } from "@/lib/investors-query";
import { formatCurrency, cn } from "@/lib/utils";
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
  owner: { username: string };
  payments?: WithdrawalRequestPayment[] | null;
};

type WeeklyLedgerRow = {
  weekStart: string;
  weekEnd: string;
  accruedAdded: number;
  interestPaid: number;
  bodyPaid: number;
  closingPaid: number;
};

type WeeklyLedgerResponse = {
  rows: WeeklyLedgerRow[];
};

/** Неделя для блока «История начислений» (агрегат по всем позициям за одну weekStart). */
type HistoryWeek = {
  weekStart: string;
  weekEnd: string;
  accrued: number;
  paid: number;
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function formatAmount(num: number) {
  if (!num) return "0";
  return Number(num).toLocaleString("ru-RU");
}

function mergeLedgerWeeks(
  results: { data?: WeeklyLedgerResponse; isPending: boolean }[]
): HistoryWeek[] {
  const map = new Map<string, HistoryWeek>();
  for (const res of results) {
    const rows = res.data?.rows;
    if (!rows?.length) continue;
    for (const r of rows) {
      const paid = r.interestPaid + r.bodyPaid + r.closingPaid;
      const prev = map.get(r.weekStart);
      if (!prev) {
        map.set(r.weekStart, {
          weekStart: r.weekStart,
          weekEnd: r.weekEnd,
          accrued: r.accruedAdded,
          paid,
        });
      } else {
        prev.accrued += r.accruedAdded;
        prev.paid += paid;
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => new Date(b.weekStart).getTime() - new Date(a.weekStart).getTime());
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

  const latestWithdrawalRequest = useMemo(() => {
    if (isError) return null;
    return pickLatestWithdrawalRequest(investors);
  }, [investors, isError]);

  const ledgerQueries = useQueries({
    queries: investors.map((inv) => ({
      queryKey: ["investors", inv.id, "weekly-ledger"] as const,
      queryFn: () => apiClient.get<WeeklyLedgerResponse>(`/api/investors/${inv.id}/weekly-ledger`),
      enabled: !!user && user.role === "INVESTOR" && investors.length > 0,
    })),
  });

  const mergedWeeks = mergeLedgerWeeks(ledgerQueries);

  const [showAllWeeks, setShowAllWeeks] = useState(false);
  const visibleWeeks = showAllWeeks ? mergedWeeks : mergedWeeks.slice(0, 8);

  const isHistoryLoading =
    isLoading || (investors.length > 0 && ledgerQueries.some((q) => q.isPending || q.isFetching));
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
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "var(--thai-color-text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              padding: "0 4px",
              marginBottom: 4,
            }}
          >
            История начислений
          </div>

          {isHistoryLoading
            ? [1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    background: "var(--thai-color-card-bg)",
                    border: "1px solid var(--thai-color-card-border)",
                    borderRadius: 12,
                    padding: "14px 16px",
                    height: 58,
                    animation: "thai-shimmer 1.5s ease infinite",
                    backgroundSize: "200% 100%",
                    backgroundImage:
                      "linear-gradient(90deg, transparent 40%, var(--thai-color-card-bg) 50%, transparent 60%)",
                  }}
                />
              ))
            : visibleWeeks.map((week) => (
                <div
                  key={week.weekStart}
                  style={{
                    background: "var(--thai-color-card-bg)",
                    border: "1px solid var(--thai-color-card-border)",
                    borderRadius: 12,
                    padding: "14px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    animation: "thai-fade-in-up 0.3s ease forwards",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--thai-color-text-primary)",
                        fontWeight: 500,
                        marginBottom: 3,
                      }}
                    >
                      {formatDate(week.weekStart)} — {formatDate(week.weekEnd)}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--thai-color-text-muted)",
                      }}
                    >
                      {week.paid > 0 ? "Выплачено" : "Не выплачено"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div
                      data-finance-history="accrued"
                      style={{
                        fontSize: 15,
                        fontWeight: 600,
                        color: "var(--thai-color-accrued)",
                        WebkitTextFillColor: "var(--thai-color-accrued)",
                        marginBottom: 2,
                      }}
                    >
                      +{formatAmount(week.accrued)} ₿
                    </div>
                    {week.paid > 0 ? (
                      <div
                        data-finance-history="paid"
                        style={{
                          fontSize: 12,
                          color: "var(--thai-color-paid)",
                          WebkitTextFillColor: "var(--thai-color-paid)",
                        }}
                      >
                        выпл. {formatAmount(week.paid)} ₿
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}

          {!isHistoryLoading && mergedWeeks.length > 8 ? (
            <button
              type="button"
              onClick={() => setShowAllWeeks(!showAllWeeks)}
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
              {showAllWeeks
                ? "↑ Скрыть · показать только последние 8"
                : `↓ Показать все · ещё ${mergedWeeks.length - 8} недель`}
            </button>
          ) : null}

          {!isHistoryLoading && mergedWeeks.length === 0 ? (
            <div
              style={{
                padding: "32px 16px",
                textAlign: "center",
                color: "var(--thai-color-text-muted)",
                fontSize: 14,
              }}
            >
              История начислений появится после первой недели
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
