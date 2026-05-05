"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

import { cn, formatCurrency } from "@/lib/utils";
import { openWeekDayProgress } from "@/lib/open-week-forecast";
import { getPreviousOrCurrentMonday } from "@/lib/weekly";
import { Text } from "@/components/ui/Text";
import { UserAvatar } from "@/components/user/UserAvatar";
import { InvestorDashboardMetricTiles } from "@/components/dashboard/InvestorOperationsHistory";

type InvestorListItem = {
  id: number;
  name: string;
  body: number;
  accrued: number;
  due: number;
  status: string;
};

type LifecycleBadge = { label: string; dot: string };

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
  stats: { capital: number; accrued: number; paid: number; due: number };
  investors: InvestorListItem[];
  loading: boolean;
  hasData: boolean;
  onOpenInvestor: (id: number) => void;
  onOpenReports: () => void;
  investorBadge: (status: string) => LifecycleBadge;
};

export function OwnerPremiumDashboard({
  glassCard,
  headline,
  nextPayoutLabel,
  stats,
  investors,
  loading,
  hasData,
  onOpenInvestor,
  onOpenReports,
  investorBadge,
}: OwnerPremiumDashboardProps) {
  const wp = openWeekDayProgress();
  const [barPct, setBarPct] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => setBarPct(wp.frac * 100), 80);
    return () => window.clearTimeout(t);
  }, [wp.frac]);

  const weekCaption = buildWeekRangeLabel(wp.daySpan);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <section
        className={cn(
          "thai-owner-block thai-owner-hero-panel relative flex min-h-0 flex-1 flex-col overflow-visible rounded-2xl border p-4 md:p-5",
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
                <div className="flex shrink-0 items-stretch border-l border-border/45 py-0.5 pl-2 md:py-1 md:pl-2.5">
                  <button
                    type="button"
                    className="thai-owner-glass-btn thai-owner-glass-btn--inline thai-owner-glass-btn--dense max-sm:min-w-[6.25rem]"
                    onClick={onOpenReports}
                  >
                    Отчёты
                  </button>
                </div>
              </div>
            </div>

            <InvestorDashboardMetricTiles body={stats.capital} accrued={stats.accrued} paid={stats.paid} />
          </div>

          <div className="mt-2 flex min-h-0 flex-1 flex-col border-t border-border/25 pt-2 md:mt-3 md:pt-2.5">
            <Text className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Инвесторы в сети
            </Text>

            {loading && !hasData ? (
              <div className="space-y-2.5">
                {[0, 1].map((i) => (
                  <div key={i} className="thai-glass animate-pulse p-3" style={glassCard}>
                    <div className="h-4 w-36 rounded-md bg-muted/45" />
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {[0, 1, 2].map((j) => (
                        <div key={j} className="h-10 rounded-lg bg-muted/30" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : investors.length === 0 ? (
              <Text className="block py-6 text-center text-sm text-muted-foreground">
                В общей сети пока нет инвесторов. Добавьте первого в разделе «Управление».
              </Text>
            ) : (
              <div className="thai-owner-history-scroll min-h-0 flex-1 space-y-2.5 overflow-y-auto">
                {investors.map((inv) => {
                  const life = investorBadge(inv.status);
                  return (
                    <button
                      key={inv.id}
                      type="button"
                      onClick={() => onOpenInvestor(inv.id)}
                      className="thai-row-interactive thai-glass w-full border-0 p-3.5 text-left"
                      style={glassCard}
                    >
                      <div className="flex items-start gap-3">
                        <UserAvatar name={inv.name} size={44} className="shrink-0 ring-2 ring-border/30 shadow-sm" />
                        <div className="min-w-0 flex-1">
                          <Text className="font-semibold leading-tight tracking-tight">{inv.name}</Text>
                          <div className="mt-1 flex items-center gap-1.5">
                            <span
                              className="h-2 w-2 shrink-0 rounded-full shadow-[0_0_10px_currentColor]"
                              style={{ backgroundColor: life.dot, color: life.dot }}
                              aria-hidden
                            />
                            <Text className="text-[11px] font-medium text-muted-foreground">{life.label}</Text>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-left">
                        <div>
                          <Text className="text-xs text-muted-foreground">Тело</Text>
                          <Text className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: "var(--thai-color-text-primary)" }}>
                            {formatCurrency(inv.body)}
                          </Text>
                        </div>
                        <div>
                          <Text className="text-xs text-muted-foreground">Начислено</Text>
                          <Text className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: "var(--thai-color-accrued)" }}>
                            {formatCurrency(inv.accrued)}
                          </Text>
                        </div>
                        <div>
                          <Text className="text-xs text-muted-foreground">К выплате</Text>
                          <Text className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: "var(--thai-color-due)" }}>
                            {formatCurrency(inv.due)}
                          </Text>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
