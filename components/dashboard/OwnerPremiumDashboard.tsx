"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { cn, formatCurrency } from "@/lib/utils";
import { openWeekDayProgress } from "@/lib/open-week-forecast";
import { getPreviousOrCurrentMonday } from "@/lib/weekly";
import { Text } from "@/components/ui/Text";
import {
  DashboardMetricTiles,
  DashboardOperationsHistory,
} from "@/components/dashboard/DashboardOperationsHistory";
import type { OwnerPendingPaymentRow } from "@/components/dashboard/OwnerPendingPaymentsQueue";
import { OwnerRequestsAndConfirmations } from "@/components/dashboard/OwnerRequestsAndConfirmations";
import {
  OwnerNetworkInvestorsCompact,
  type OwnerNetworkInvestorRow,
} from "@/components/dashboard/OwnerNetworkInvestorsCompact";
import type { InvestorForecastStrip } from "@/components/dashboard/InvestorPremiumDashboard";

function buildWeekRangeLabel(daySpan: number): string {
  const monday = getPreviousOrCurrentMonday(new Date());
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const dow = ["ВС", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];
  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `${dow[monday.getDay()]} ${fmt(monday)} — ${dow[sunday.getDay()]} ${fmt(sunday)} · ${daySpan}/7`;
}

export type OwnerPremiumDashboardProps = {
  glassCard: CSSProperties;
  headline: string;
  nextPayoutLabel: string;
  /** Прогноз за текущую неделю по всем инвесторам владельца (целые баты). */
  forecastStrip: InvestorForecastStrip | null;
  stats: { capital: number; accrued: number; paid: number; due: number };
  investors: OwnerNetworkInvestorRow[];
  pendingPayments: OwnerPendingPaymentRow[];
  loading: boolean;
  hasData: boolean;
  onOpenInvestor: (id: number) => void;
  onOpenReports: () => void;
  onOpenInvestorReports: (investorId: number) => void;
};

export function OwnerPremiumDashboard({
  glassCard,
  headline,
  nextPayoutLabel,
  forecastStrip,
  stats,
  investors,
  pendingPayments,
  loading,
  hasData,
  onOpenInvestor,
  onOpenReports,
  onOpenInvestorReports,
}: OwnerPremiumDashboardProps) {
  const router = useRouter();
  const wp = openWeekDayProgress();
  const [barPct, setBarPct] = useState(0);
  const [pulseInvestorId, setPulseInvestorId] = useState<number | null>(null);

  const firstWithdrawInvestorId = useMemo(() => {
    if (pendingPayments.length === 0) return null;
    const sorted = [...pendingPayments].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
    return sorted[0].investorId;
  }, [pendingPayments]);

  useEffect(() => {
    const t = window.setTimeout(() => setBarPct(wp.frac * 100), 80);
    return () => window.clearTimeout(t);
  }, [wp.frac]);

  useEffect(() => {
    if (pulseInvestorId == null) return;
    const t = window.setTimeout(() => setPulseInvestorId(null), 3200);
    return () => window.clearTimeout(t);
  }, [pulseInvestorId]);

  const jumpToWithdrawals = () => {
    const id = firstWithdrawInvestorId;
    if (id == null) return;
    setPulseInvestorId(id);
    window.requestAnimationFrame(() => {
      document
        .querySelector(`[data-owner-network-investor="${id}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const weekCaption = buildWeekRangeLabel(wp.daySpan);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <section
        className={cn(
          "thai-owner-block thai-owner-hero-panel relative flex min-h-0 flex-1 flex-col overflow-visible rounded-2xl border-0 p-4 md:p-5",
          "bg-gradient-to-b from-card/48 via-card/38 to-card/28",
          "backdrop-blur-xl"
        )}
        style={glassCard}
      >
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-[0.5]"
          style={{
            background:
              "radial-gradient(120% 90% at 50% -8%, color-mix(in srgb, hsl(var(--primary)) 14%, transparent), transparent 58%)",
          }}
          aria-hidden
        />

        <div className="relative z-[1] flex min-h-0 flex-1 flex-col gap-0">
          <div className="shrink-0 space-y-2 md:space-y-2.5">
            <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/90">
                Открытая неделя
              </span>
              <Text className="text-right text-[10px] tabular-nums leading-snug text-muted-foreground">{weekCaption}</Text>
            </div>

            <div className="space-y-1.5">
              <div className="thai-owner-thermo-wrap thai-owner-thermo-wrap--in-hero">
                <div className="thai-owner-thermo-stage">
                  <div className="thai-owner-thermo-projection" aria-hidden />
                  <div className="thai-owner-thermo-glow-wrap">
                    <div
                      className="thai-owner-thermo-track"
                      role="img"
                      aria-label={`Прогресс открытой недели: ${weekCaption}`}
                    >
                      <div className="thai-owner-thermo-ambient" aria-hidden />
                      <div className="thai-owner-thermo-fill" style={{ width: `${barPct}%` }} />
                      <div className="thai-owner-thermo-glass" aria-hidden />
                      <div className="thai-owner-thermo-rim" aria-hidden />
                    </div>
                  </div>
                </div>
              </div>

              {forecastStrip ? (
                <p className={cn("thai-owner-forecast-strip thai-owner-forecast-strip--quiet tabular-nums")} role="status">
                  Ожидается{" "}
                  <span className="thai-owner-forecast-strip__amount">{forecastStrip.amountPlusBaht}</span> к{" "}
                  {forecastStrip.payoutDate}
                </p>
              ) : null}

              <p className={cn("thai-owner-forecast-strip thai-owner-forecast-strip--quiet tabular-nums")} role="status">
                {headline}
                <span className="text-muted-foreground"> · </span>
                Следующая выплата — <span className="tabular-nums">{nextPayoutLabel}</span>
              </p>
            </div>

            <div className={cn("thai-owner-payout-hero rounded-xl px-2 py-1.5 md:px-2.5 md:py-2")}>
              <p className={cn("px-0.5 text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-muted-foreground/85")}>
                К выплате по сети
              </p>
              <div className="flex min-h-[2.35rem] flex-nowrap items-center justify-between gap-2 md:min-h-[2.5rem]">
                <output
                  className={cn(
                    "min-w-0 flex-1 truncate py-0.5 text-left tabular-nums tracking-tight text-[var(--thai-color-due)]"
                  )}
                  style={{
                    fontSize: "clamp(1.05rem, 2.9vw + 0.72rem, 1.52rem)",
                    fontWeight: 600,
                    lineHeight: 1.06,
                  }}
                  aria-live="polite"
                >
                  {formatCurrency(stats.due)}
                </output>
                <div className="flex shrink-0 items-stretch py-0.5 pl-3 md:py-1 md:pl-3.5">
                  <button
                    type="button"
                    className="thai-owner-glass-btn thai-owner-glass-btn--inline thai-owner-glass-btn--dense max-sm:min-w-[6.25rem]"
                    onClick={onOpenReports}
                  >
                    Финансы
                  </button>
                </div>
              </div>
            </div>

            <DashboardMetricTiles body={stats.capital} accrued={stats.accrued} paid={stats.paid} />
          </div>

          <OwnerRequestsAndConfirmations
            pendingPayments={pendingPayments}
            onOpenReports={onOpenReports}
            onJumpToWithdrawals={jumpToWithdrawals}
          />

          <OwnerNetworkInvestorsCompact
            investors={investors}
            pendingPayments={pendingPayments}
            pulseInvestorId={pulseInvestorId}
            loading={loading}
            hasData={hasData}
            onOpenInvestor={onOpenInvestor}
            onOpenReports={onOpenReports}
            onOpenInvestorReports={onOpenInvestorReports}
          />

          <div className="mt-2 shrink-0 pt-1 md:mt-3 md:pt-2">
            <DashboardOperationsHistory
              embedded
              embeddedCollapsible
              embeddedInitiallyExpanded={false}
              enabled
              glassCard={glassCard}
              showMultiPositionLabels={investors.length > 1}
              operationsHistoryScope="owner"
              operationRowPredicate={(item) => item.kind === "payment"}
              onOperationClick={(item) => {
                if (item.kind !== "payment") return;
                router.push(`/dashboard/finance?investor=${item.investorId}&payment=${item.paymentId}`);
              }}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
