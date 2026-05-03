"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
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

type InvestorRow = {
  id: number;
  name: string;
  body: number;
  accrued: number;
  due: number;
  status: string;
  owner: { username: string };
};

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

  const { data, isLoading } = useQuery({
    queryKey: investorsDashboardListQueryKey(user?.role),
    queryFn: () =>
      apiClient.get<{ investors: InvestorRow[] }>(
        `/api/investors?network=${investorsDashboardNetworkParam(user!.role)}&lean=1`
      ),
    enabled: !!user && user.role === "INVESTOR",
  });

  const investors = useMemo(() => data?.investors ?? [], [data?.investors]);
  const totals = useMemo(
    () =>
      investors.reduce(
        (acc, inv) => ({
          body: acc.body + (inv.body || 0),
          accrued: acc.accrued + (inv.accrued || 0),
          due: acc.due + (inv.due || 0),
        }),
        { body: 0, accrued: 0, due: 0 }
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
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Stat title="Тело" value={formatCurrency(totals.body)} />
            <Stat title="Начислено" value={formatCurrency(totals.accrued)} />
            <Stat title="К выплате" value={formatCurrency(totals.due)} />
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
                  <div className="flex items-center justify-between">
                    <Text className="font-semibold">{inv.name}</Text>
                    <Text className="text-xs text-muted-foreground">{inv.status}</Text>
                  </div>
                  <Text className="mt-1 text-xs text-muted-foreground">OWNER: {inv.owner.username}</Text>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                    <StatMini label="Тело" value={formatCurrency(inv.body)} />
                    <StatMini label="Начислено" value={formatCurrency(inv.accrued)} />
                    <StatMini label="К выплате" value={formatCurrency(inv.due)} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        <MobileBottomNav active="finance" />
      </div>
    </Container>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <div className="thai-stat-tile thai-glass border border-border/35 p-3">
      <Text className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</Text>
      <Text className="mt-1 font-semibold tabular-nums text-foreground">{value}</Text>
    </div>
  );
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/15 p-2 backdrop-blur-sm">
      <Text className="text-xs text-muted-foreground">{label}</Text>
      <Text className="text-sm font-semibold tabular-nums">{value}</Text>
    </div>
  );
}

