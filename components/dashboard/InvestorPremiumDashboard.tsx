"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

import { cn, formatCurrency } from "@/lib/utils";
import { openWeekDayProgress } from "@/lib/open-week-forecast";
import { getPreviousOrCurrentMonday } from "@/lib/weekly";
import { Text } from "@/components/ui/Text";
import { InvestorDashboardMetricTiles } from "@/components/dashboard/InvestorOperationsHistory";

function buildWeekRangeLabel(daySpan: number): string {
  const monday = getPreviousOrCurrentMonday(new Date());
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const dow = ["ВС", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];
  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `${dow[monday.getDay()]} ${fmt(monday)} — ${dow[sunday.getDay()]} ${fmt(sunday)} · ${daySpan}/7`;
}

/** Прогноз «Ожидается +… ฿ к …» — сумма окрашивается премиум-золотом как заливка шкалы недели. */
export type InvestorForecastStrip = {
  amountPlusBaht: string;
  payoutDate: string;
};

export type InvestorPremiumDashboardProps = {
  glassCard: CSSProperties;
  payoutDue: number;
  canWithdraw: boolean;
  onWithdraw: () => void;
  statsBody: number;
  statsAccrued: number;
  statsPaid: number;
  forecastStrip: InvestorForecastStrip | null;
  paymentStatusSlot: React.ReactNode;
  historySlot: React.ReactNode;
};

export function InvestorPremiumDashboard({
  glassCard,
  payoutDue,
  canWithdraw,
  onWithdraw,
  statsBody,
  statsAccrued,
  statsPaid,
  forecastStrip,
  paymentStatusSlot,
  historySlot,
}: InvestorPremiumDashboardProps) {
  const wp = openWeekDayProgress();
  const [barPct, setBarPct] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => setBarPct(wp.frac * 100), 80);
    return () => window.clearTimeout(t);
  }, [wp.frac]);

  const weekCaption = buildWeekRangeLabel(wp.daySpan);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {paymentStatusSlot ? <div className="shrink-0">{paymentStatusSlot}</div> : null}

      <section
        className={cn(
          "thai-investor-block thai-investor-hero-panel relative flex min-h-0 flex-1 flex-col overflow-visible rounded-2xl border p-4 md:p-5",
          "border-border/35 bg-gradient-to-b from-card/95 via-card/90 to-card/80",
          "backdrop-blur-xl"
        )}
        style={glassCard}
      >
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-[0.65]"
          style={{
            background:
              "radial-gradient(120% 90% at 50% -8%, color-mix(in srgb, hsl(var(--primary)) 22%, transparent), transparent 58%)",
          }}
          aria-hidden
        />

        <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 space-y-3 md:space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/90">
                Открытая неделя
              </span>
              <Text className="text-right text-[10px] tabular-nums leading-snug text-muted-foreground">{weekCaption}</Text>
            </div>

            <div className="thai-investor-thermo-wrap thai-investor-thermo-wrap--in-hero">
              <div className="thai-investor-thermo-stage">
                <div className="thai-investor-thermo-projection" aria-hidden />
                <div className="thai-investor-thermo-glow-wrap">
                  <div
                    className="thai-investor-thermo-track"
                    role="img"
                    aria-label={`Прогресс открытой недели: ${weekCaption}`}
                  >
                    <div className="thai-investor-thermo-ambient" aria-hidden />
                    <div className="thai-investor-thermo-fill" style={{ width: `${barPct}%` }} />
                    <div className="thai-investor-thermo-glass" aria-hidden />
                    <div className="thai-investor-thermo-rim" aria-hidden />
                  </div>
                </div>
              </div>
            </div>

            {forecastStrip ? (
              <p className="thai-investor-forecast-strip tabular-nums" role="status">
                Ожидается{" "}
                <span className="thai-investor-forecast-strip__amount">{forecastStrip.amountPlusBaht}</span> к{" "}
                {forecastStrip.payoutDate}
              </p>
            ) : null}

            <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/25 to-transparent" aria-hidden />

            <div
              className={cn(
                "thai-investor-payout-hero flex flex-col gap-3 rounded-xl px-3 py-3",
                "sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              )}
            >
              <div className="min-w-0 flex-1">
                <Text className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Доступно к выводу
                </Text>
                <div
                  className="mt-0.5 tabular-nums tracking-tight text-[var(--thai-color-due)] sm:mt-0"
                  style={{ fontSize: "clamp(1.5rem, 5vw, 1.875rem)", fontWeight: 600, lineHeight: 1.15 }}
                >
                  {formatCurrency(payoutDue)}
                </div>
              </div>
              <button
                type="button"
                className="thai-investor-glass-btn thai-investor-glass-btn--inline shrink-0 sm:self-center"
                disabled={!canWithdraw}
                onClick={onWithdraw}
              >
                Вывести
              </button>
            </div>

            <InvestorDashboardMetricTiles body={statsBody} accrued={statsAccrued} paid={statsPaid} />
          </div>

          <div className="mt-3 flex min-h-0 flex-1 flex-col border-t border-border/25 pt-2 md:mt-4 md:pt-3">
            {historySlot}
          </div>
        </div>
      </section>
    </div>
  );
}
