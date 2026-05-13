"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

import { cn, formatCurrency } from "@/lib/utils";
import { openWeekDayProgress } from "@/lib/open-week-forecast";
import { getPreviousOrCurrentMonday } from "@/lib/weekly";
import { Text } from "@/components/ui/Text";
import { DashboardMetricTiles } from "@/components/dashboard/DashboardOperationsHistory";

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
          "thai-investor-block thai-investor-hero-panel relative flex min-h-0 flex-1 flex-col overflow-visible rounded-2xl border-0 p-4 md:p-5",
          "bg-gradient-to-b from-card/48 via-card/38 to-card/28",
          "backdrop-blur-xl"
        )}
        style={glassCard}
      >
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-[0.5]"
          style={{
            background:
              "radial-gradient(120% 90% at 50% -8%, color-mix(in srgb, hsl(var(--primary)) 22%, transparent), transparent 58%)",
          }}
          aria-hidden
        />

        <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 space-y-2 md:space-y-2.5">
            <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/90">
                Открытая неделя
              </span>
              <Text className="text-right text-[10px] tabular-nums leading-snug text-muted-foreground">{weekCaption}</Text>
            </div>

            <div className="space-y-1.5">
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
                <p className={cn("thai-investor-forecast-strip thai-investor-forecast-strip--quiet tabular-nums")} role="status">
                  Ожидается{" "}
                  <span className="thai-investor-forecast-strip__amount">{forecastStrip.amountPlusBaht}</span> к{" "}
                  {forecastStrip.payoutDate}
                </p>
              ) : null}
            </div>

            {/* Ось «доступно» + одна операционная строка: сумма и действие сопряжены как у платёжной линии */}
            <div className={cn("thai-investor-payout-hero rounded-xl px-2 py-1.5 md:px-2.5 md:py-2")}>
              <p className={cn("px-0.5 text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-muted-foreground/85")}>
                Доступно к выводу
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
                  {formatCurrency(payoutDue)}
                </output>
                <div className="flex shrink-0 items-stretch py-0.5 pl-3 md:py-1 md:pl-3.5">
                  <button
                    type="button"
                    className="thai-investor-glass-btn thai-investor-glass-btn--inline thai-investor-glass-btn--dense max-sm:min-w-[6.25rem]"
                    disabled={!canWithdraw}
                    onClick={onWithdraw}
                  >
                    Вывести
                  </button>
                </div>
              </div>
            </div>

            <DashboardMetricTiles body={statsBody} accrued={statsAccrued} paid={statsPaid} accruedTitle="Начислено сейчас" />
          </div>

          <div className="mt-2 flex min-h-0 flex-1 flex-col pt-2 md:mt-3 md:pt-2.5">
            {historySlot}
          </div>
        </div>
      </section>
    </div>
  );
}
