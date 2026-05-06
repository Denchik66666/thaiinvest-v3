"use client";

import type { CSSProperties, ReactNode } from "react";

import { cn, formatCurrency } from "@/lib/utils";
import { glassAccentSurface } from "@/lib/dashboard-glass-accent";
import { Text } from "@/components/ui/Text";
import { WeekCycleStrip } from "@/components/dashboard/WeekCycleStrip";
import { InvestorPositionAvatarHeading } from "@/components/dashboard/InvestorPositionAvatarHeading";

export type SaInvestorFilterKey = "all" | "common" | "private";

export type SuperAdminInvestorRow = {
  id: number;
  name: string;
  body: number;
  accrued: number;
  due: number;
  status: string;
};

type QuickAction = { label: string; onClick: () => void };

export function SuperAdminDashboardHome({
  glassCard,
  headline,
  nextPayoutLabel,
  statsSummary,
  limitSlot,
  pendingApprovalsCount,
  onOpenFinance,
  quickActions,
  saInvestorFilter,
  setSaInvestorFilter,
  loadingInvestors,
  hasInvestorsData,
  filteredInvestors,
  onOpenInvestor,
}: {
  glassCard: CSSProperties;
  headline: string;
  nextPayoutLabel: string;
  statsSummary: ReactNode;
  limitSlot: ReactNode | null;
  pendingApprovalsCount: number;
  onOpenFinance: () => void;
  quickActions: QuickAction[];
  saInvestorFilter: SaInvestorFilterKey;
  setSaInvestorFilter: (key: SaInvestorFilterKey) => void;
  loadingInvestors: boolean;
  hasInvestorsData: boolean;
  filteredInvestors: SuperAdminInvestorRow[];
  onOpenInvestor: (id: number) => void;
}) {
  const filters: { key: SaInvestorFilterKey; label: string }[] = [
    { key: "all", label: "Все" },
    { key: "common", label: "Общая" },
    { key: "private", label: "Приватная" },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 md:gap-4">
      <section
        className={cn(
          "relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.12] p-4 backdrop-blur-xl md:p-5",
          "bg-gradient-to-b from-card/40 via-card/32 to-card/24",
          "dark:border-white/[0.07] dark:from-[#0c0c14]/72 dark:via-[#0c0c14]/55 dark:to-[#0c0c14]/40"
        )}
        style={glassCard}
      >
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-[0.5]"
          style={{
            background:
              "radial-gradient(120% 90% at 50% -8%, color-mix(in srgb, hsl(var(--primary)) 12%, transparent), transparent 58%)",
          }}
          aria-hidden
        />

        <div className="relative z-[1] space-y-4">
          <header className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/90">Панель супер-админа</p>
            <h1 className="text-[15px] font-semibold leading-snug tracking-tight text-foreground md:text-[17px]">{headline}</h1>
          </header>

          <WeekCycleStrip
            payoutLabel={nextPayoutLabel}
            cycleHint="По правилам цикла выплаты — понедельник; не дата из заявки на вывод."
          />

          <div className="flex flex-wrap gap-2 border-t border-border/20 pt-4 dark:border-white/[0.06]">
            {quickActions.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={a.onClick}
                className={cn("rounded-full px-3 py-1.5 text-[11px] font-semibold", glassAccentSurface)}
              >
                {a.label}
              </button>
            ))}
          </div>

          <div className="border-t border-border/20 pt-4 dark:border-white/[0.06]">{statsSummary}</div>
        </div>
      </section>

      {limitSlot}

      {pendingApprovalsCount > 0 ? (
        <button
          type="button"
          onClick={onOpenFinance}
          className="thai-row-interactive thai-glass w-full rounded-2xl border border-white/10 p-3 text-left backdrop-blur-md dark:border-white/[0.06]"
          style={glassCard}
        >
          <Text className="text-sm font-semibold text-foreground">
            {pendingApprovalsCount} заявок ожидают → Рассмотреть
          </Text>
        </button>
      ) : null}

      <section className="space-y-2">
        <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Инвесторы</Text>
        <nav
          className="flex gap-0.5 rounded-xl bg-black/[0.04] p-0.5 dark:bg-white/[0.04]"
          role="tablist"
          aria-label="Фильтр инвесторов"
        >
          {filters.map(({ key, label }) => {
            const active = saInvestorFilter === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSaInvestorFilter(key)}
                className={cn(
                  "min-w-0 flex-1 rounded-lg py-2 text-center text-[11px] font-semibold transition-all duration-200",
                  active ? cn("text-foreground shadow-sm", glassAccentSurface) : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            );
          })}
        </nav>

        {loadingInvestors && !hasInvestorsData ? (
          <div className="space-y-2.5">
            {[0, 1].map((i) => (
              <div key={i} className="animate-pulse space-y-3 rounded-2xl border border-border/20 bg-muted/10 p-3.5 dark:border-white/[0.06] dark:bg-white/[0.04]">
                <div className="flex gap-2">
                  <div className="h-9 w-9 shrink-0 rounded-full bg-muted/40 dark:bg-white/10" />
                  <div className="min-w-0 flex-1 space-y-2 pt-0.5">
                    <div className="h-3.5 w-36 rounded-md bg-muted/40 dark:bg-white/10" />
                    <div className="grid grid-cols-3 gap-2">
                      {[0, 1, 2].map((j) => (
                        <div key={j} className="h-10 rounded-lg bg-muted/25 dark:bg-white/[0.06]" />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredInvestors.length === 0 ? (
          <Text className="block rounded-2xl border border-border/25 bg-background/20 py-8 text-center text-sm text-muted-foreground backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.03]">
            Нет позиций в выбранном фильтре.
          </Text>
        ) : (
          <div className="space-y-2.5">
            {filteredInvestors.map((inv) => (
              <button
                key={inv.id}
                type="button"
                onClick={() => onOpenInvestor(inv.id)}
                className={cn(
                  "thai-row-interactive thai-dashboard-list-row w-full rounded-2xl border border-transparent p-3.5 text-left",
                  "bg-white/[0.03] backdrop-blur-md transition hover:border-white/10 hover:bg-white/[0.05]",
                  "dark:bg-white/[0.03] dark:hover:border-white/[0.08]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                )}
              >
                <div className="flex items-start gap-3">
                  <InvestorPositionAvatarHeading name={inv.name} status={inv.status} className="min-w-0 flex-1 items-start" />
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
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
