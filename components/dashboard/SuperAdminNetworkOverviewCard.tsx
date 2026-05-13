"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { Text } from "@/components/ui/Text";
import { apiClient } from "@/lib/api-client";
import { formatCurrency, cn } from "@/lib/utils";
import { investorsDashboardListQueryKey, investorsDashboardNetworkParam } from "@/lib/investors-query";
import { useAuth } from "@/hooks/useAuth";

type LeanInvestor = {
  id: number;
  status: string;
  body: number;
  accrued: number;
  paid: number;
  due: number;
  payments?: { status: string }[];
  owner?: { id: number; username: string; role: string };
};

type LeanInvestorsResponse = {
  investors: LeanInvestor[];
  /** Только SUPER_ADMIN + `network=common` в lean: активные пользователи роли OWNER (внешняя сеть Семёна). */
  commonNetworkOwners?: { id: number; username: string }[];
};

type SuperAdminNetworkOverviewCardProps = {
  /** Доп. классы корня (например компактная вставка на «Управлении»). */
  className?: string;
  /** Краткая сводка для «Управления»: акцент на ссылку на главную как источник дня. */
  compact?: boolean;
};

export function SuperAdminNetworkOverviewCard({ className, compact }: SuperAdminNetworkOverviewCardProps = {}) {
  const router = useRouter();
  const { user } = useAuth();

  const investorsQueryKey = investorsDashboardListQueryKey(user?.role);

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: investorsQueryKey,
    queryFn: () =>
      apiClient.get<LeanInvestorsResponse>(
        `/api/investors?network=${investorsDashboardNetworkParam(user!.role)}&lean=1`
      ),
    enabled: !!user && user.role === "SUPER_ADMIN",
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  const investors = data?.investors ?? [];

  const ownerLine = useMemo(() => {
    const fromApi = data?.commonNetworkOwners;
    if (fromApi?.length) return fromApi.map((o) => o.username).join(", ");
    const fromRows = new Map<number, string>();
    for (const inv of investors) {
      const ow = inv.owner;
      if (ow?.role === "OWNER") fromRows.set(ow.id, ow.username);
    }
    if (fromRows.size) return Array.from(fromRows.values()).join(", ");
    return null;
  }, [data?.commonNetworkOwners, investors]);

  const stats = useMemo(() => {
    return investors.reduce(
      (acc, inv) => ({
        body: acc.body + (inv.body || 0),
        accrued: acc.accrued + (inv.accrued || 0),
        paid: acc.paid + (inv.paid || 0),
        due: acc.due + (inv.due || 0),
        active: acc.active + (inv.status === "active" ? 1 : 0),
      }),
      { body: 0, accrued: 0, paid: 0, due: 0, active: 0 }
    );
  }, [investors]);

  const requestedPaymentsCount = useMemo(() => {
    let n = 0;
    for (const inv of investors) {
      for (const p of inv.payments ?? []) {
        if (p.status === "requested") n += 1;
      }
    }
    return n;
  }, [investors]);

  if (!user || user.role !== "SUPER_ADMIN") return null;

  const linkQuiet =
    "rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-primary transition hover:bg-primary/10 hover:text-primary";

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/25 bg-gradient-to-b from-card/55 via-card/35 to-card/20",
        "p-2 shadow-[0_12px_40px_-28px_rgba(0,0,0,0.45)] backdrop-blur-xl md:p-2.5",
        className
      )}
    >
      <div className="flex items-center gap-2 border-b border-border/15 pb-2">
        <div className="min-w-0 flex-1 border-l-2 border-primary/35 pl-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <Text className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Сеть платформы</Text>
            {compact ? (
              <>
                <span className="hidden text-[10px] text-muted-foreground/70 sm:inline">·</span>
                <span className="text-[10px] text-muted-foreground/85">кратко · полная картина на главной</span>
              </>
            ) : (
              <>
                <span className="hidden text-[10px] text-muted-foreground/70 sm:inline">·</span>
                <span className="hidden text-[10px] text-muted-foreground/75 sm:inline">главная — инвестор</span>
              </>
            )}
          </div>
          {ownerLine ? (
            <p className="mt-1 text-[10px] leading-tight">
              <span className="font-semibold uppercase tracking-[0.12em] text-muted-foreground/90">Owner</span>
              <span className="mx-1.5 font-semibold tabular-nums text-foreground/95">{ownerLine}</span>
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          {isFetching && data ? (
            <span
              className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary/75"
              title="Обновление данных"
              aria-hidden
            />
          ) : null}
          {compact ? (
            <button type="button" className={linkQuiet} onClick={() => router.push("/dashboard")}>
              Главная →
            </button>
          ) : null}
          <button type="button" className={linkQuiet} onClick={() => router.push("/dashboard/investors")}>
            Реестр
          </button>
          <button type="button" className={linkQuiet} onClick={() => router.push("/dashboard/finance")}>
            Финансы
          </button>
        </div>
      </div>

      {isLoading && !data ? (
        <div className="mt-2 h-9 rounded-lg bg-muted/20 animate-pulse" />
      ) : isError ? (
        <Text className="mt-2 text-xs text-destructive">{error instanceof Error ? error.message : "Ошибка загрузки"}</Text>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1 md:gap-x-4">
            <span className="text-[11px] tabular-nums text-muted-foreground md:text-xs">
              <span className="font-semibold text-foreground">{investors.length}</span> поз.
              <span className="mx-1 opacity-40">·</span>
              <span className="font-semibold text-foreground">{stats.active}</span> акт.
            </span>
            <span className="hidden h-3 w-px bg-border/45 sm:block" aria-hidden />
            <InlineMetric label="Тело" value={formatCurrency(stats.body)} tone="neutral" />
            {!compact ? (
              <>
                <InlineMetric label="Начисл." value={formatCurrency(stats.accrued)} tone="accrued" />
                <InlineMetric label="Выпл." value={formatCurrency(stats.paid)} tone="paid" />
              </>
            ) : null}
            <InlineMetric label="К выплате" value={formatCurrency(stats.due)} tone="due" />
          </div>

          {requestedPaymentsCount > 0 ? (
            <button
              type="button"
              onClick={() => router.push("/dashboard/finance")}
              className={cn(
                "mt-2 flex w-full items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.07]",
                "px-2 py-1.5 text-left transition hover:bg-amber-500/12 active:scale-[0.99]"
              )}
            >
              <span className="flex h-6 min-w-[1.5rem] items-center justify-center rounded-md bg-amber-500/20 text-[11px] font-bold tabular-nums text-amber-950 dark:text-amber-100">
                {requestedPaymentsCount}
              </span>
              <Text className="flex-1 text-[11px] font-medium leading-tight text-amber-950/95 dark:text-amber-50/95">
                Заявок у владельцев · разбор в Финансах
              </Text>
              <span className="text-[10px] font-semibold text-primary/90">→</span>
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

function InlineMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "accrued" | "paid" | "due";
}) {
  const color =
    tone === "accrued"
      ? "var(--thai-color-accrued)"
      : tone === "paid"
        ? "var(--thai-color-paid)"
        : tone === "due"
          ? "var(--thai-color-due)"
          : undefined;
  return (
    <span className="inline-flex min-w-0 flex-col gap-0 leading-none">
      <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/85">{label}</span>
      <span
        className="mt-0.5 text-[11px] font-semibold tabular-nums md:text-xs"
        style={color ? { color } : { color: "var(--foreground)" }}
      >
        {value}
      </span>
    </span>
  );
}
