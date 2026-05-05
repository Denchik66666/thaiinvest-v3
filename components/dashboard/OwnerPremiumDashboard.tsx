"use client";

import type { CSSProperties } from "react";

import { cn, formatCurrency } from "@/lib/utils";
import { Text } from "@/components/ui/Text";
import { UserAvatar } from "@/components/user/UserAvatar";

type InvestorListItem = {
  id: number;
  name: string;
  body: number;
  accrued: number;
  due: number;
  status: string;
};

type LifecycleBadge = { label: string; dot: string };

export type OwnerPremiumDashboardProps = {
  glassCard: CSSProperties;
  headline: string;
  stats: { capital: number; accrued: number; paid: number; due: number };
  investors: InvestorListItem[];
  loading: boolean;
  hasData: boolean;
  onOpenInvestor: (id: number) => void;
  investorBadge: (status: string) => LifecycleBadge;
};

export function OwnerPremiumDashboard({
  glassCard,
  headline,
  stats,
  investors,
  loading,
  hasData,
  onOpenInvestor,
  investorBadge,
}: OwnerPremiumDashboardProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <section
        className={cn(
          "thai-glass relative overflow-hidden rounded-2xl border p-4 md:p-5",
          "border-border/35 bg-gradient-to-b from-card/95 via-card/90 to-card/80 backdrop-blur-xl"
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

        <div className="relative z-[1] space-y-3">
          <div className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/90">
              Кабинет владельца
            </span>
            <h2 className="text-[15px] font-bold leading-snug tracking-tight text-foreground md:text-lg">{headline}</h2>
          </div>

          <div className="grid gap-2">
            <div className="thai-glass rounded-xl border border-border/35 p-3" style={glassCard}>
              <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Тело в сети</Text>
              <Text className="mt-1 text-2xl font-semibold tabular-nums tracking-tight" style={{ color: "var(--thai-color-text-primary)" }}>
                {formatCurrency(stats.capital)}
              </Text>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="thai-glass rounded-xl border border-border/35 p-3" style={glassCard}>
                <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Начислено</Text>
                <Text className="mt-1 text-lg font-semibold tabular-nums tracking-tight" style={{ color: "var(--thai-color-accrued)" }}>
                  {formatCurrency(stats.accrued)}
                </Text>
              </div>
              <div className="thai-glass rounded-xl border border-border/35 p-3" style={glassCard}>
                <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Выплачено</Text>
                <Text className="mt-1 text-lg font-semibold tabular-nums tracking-tight" style={{ color: "var(--thai-color-paid)" }}>
                  {formatCurrency(stats.paid)}
                </Text>
              </div>
            </div>
          </div>

          <div className="border-t border-border/25 pt-3">
            <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Инвесторы в сети</Text>

            {loading && !hasData ? (
              <div className="mt-2 space-y-2.5">
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
              <div className="mt-2 space-y-2.5">
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

