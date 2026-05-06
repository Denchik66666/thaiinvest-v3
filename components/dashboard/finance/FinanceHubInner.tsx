"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";
import { Container } from "@/components/ui/Container";
import { Text } from "@/components/ui/Text";
import NotificationBell from "@/components/notifications/NotificationBell";
import MobileBottomNav from "@/components/navigation/MobileBottomNav";
import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";
import { investorsDashboardListQueryKey, investorsDashboardNetworkParam } from "@/lib/investors-query";
import { DashboardOperationsHistory } from "@/components/dashboard/DashboardOperationsHistory";
import { FinanceOperationDetailModal } from "@/components/dashboard/finance/FinanceOperationDetailModal";
import type { FinanceOperationItem } from "@/types/finance-operations";

type LeanInvestor = {
  id: number;
  isPrivate?: boolean;
  linkedUserId?: number | null;
  investorUserId?: number | null;
  owner?: { username: string };
};

const DASHBOARD_DARK_ROOT_STYLE: CSSProperties = {
  background: "#0d0d14",
  backgroundImage:
    "radial-gradient(ellipse at 15% 0%, rgba(109,40,217,0.22) 0%, transparent 55%), radial-gradient(ellipse at 85% 100%, rgba(30,27,75,0.35) 0%, transparent 50%)",
  minHeight: "100vh",
};

const GLASS_CARD_DARK: CSSProperties = {
  background: "color-mix(in srgb, var(--thai-color-card-bg) 52%, transparent)",
  backdropFilter: "blur(22px) saturate(165%)",
  WebkitBackdropFilter: "blur(22px) saturate(165%)",
  border: "none",
  boxShadow: "0 18px 40px -24px rgba(0,0,0,0.45)",
  borderRadius: "16px",
};

const GLASS_CARD_LIGHT: CSSProperties = {
  background: "rgba(255,255,255,0.38)",
  backdropFilter: "blur(22px) saturate(175%)",
  WebkitBackdropFilter: "blur(22px) saturate(175%)",
  border: "none",
  boxShadow: "0 14px 36px -20px rgba(88, 52, 180, 0.14)",
  borderRadius: "16px",
};

function subscribeHtmlDark(onStoreChange: () => void) {
  if (typeof document === "undefined") return () => {};
  const el = document.documentElement;
  const obs = new MutationObserver(onStoreChange);
  obs.observe(el, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}

function snapshotHtmlDark() {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

function serverHtmlDark() {
  return false;
}

export function FinanceHubInner() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [detailItem, setDetailItem] = useState<FinanceOperationItem | null>(null);

  const isDark = useSyncExternalStore(subscribeHtmlDark, snapshotHtmlDark, serverHtmlDark);
  const glassCard = isDark ? GLASS_CARD_DARK : GLASS_CARD_LIGHT;

  const { data: investorsData } = useQuery({
    queryKey: investorsDashboardListQueryKey(user?.role),
    queryFn: () =>
      apiClient.get<{ investors: LeanInvestor[] }>(
        `/api/investors?network=${investorsDashboardNetworkParam(user!.role)}&lean=1`
      ),
    enabled: !!user,
    placeholderData: keepPreviousData,
    refetchInterval: user?.role === "INVESTOR" ? 30_000 : user?.role === "OWNER" ? 45_000 : false,
    refetchOnWindowFocus: user?.role === "OWNER",
  });

  const myInvestors = useMemo(() => {
    const investors = investorsData?.investors ?? [];
    if (!user) return [];
    if (user.role === "SUPER_ADMIN")
      return investors.filter((inv) => !inv.isPrivate && inv.linkedUserId === user.id);
    if (user.role === "OWNER") return investors.filter((inv) => inv.owner?.username === user.username);
    return investors.filter((inv) => inv.investorUserId === user.id);
  }, [investorsData, user]);

  const movementsEnabled = user?.role === "INVESTOR" || user?.role === "OWNER";
  const operationsHistoryScope = user?.role === "OWNER" ? "owner" : "investor";
  const backFallbackHref = user?.role === "INVESTOR" ? "/dashboard" : "/dashboard/manage";

  const goHistoryBack = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push(backFallbackHref);
  }, [router, backFallbackHref]);

  /** Жест «назад» с края экрана (iOS Safari) опирается на тот же стек history, что и router.back(). */

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    document.documentElement.classList.add("thai-finance-touch-scroll");
    return () => document.documentElement.classList.remove("thai-finance-touch-scroll");
  }, []);

  if (authLoading || !user) {
    return (
      <Container>
        <div
          className="thai-dashboard-root flex min-h-screen items-center justify-center py-16"
          style={isDark ? DASHBOARD_DARK_ROOT_STYLE : undefined}
        >
          <div className="thai-glass flex flex-col items-center gap-3 rounded-2xl px-8 py-6" style={glassCard}>
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <Text className="text-foreground">Загрузка…</Text>
          </div>
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <div
        className="thai-dashboard-root min-h-screen space-y-3 py-3 pb-24 md:space-y-5 md:py-8 md:pb-28"
        style={isDark ? DASHBOARD_DARK_ROOT_STYLE : undefined}
      >
        <div
          className={cn(
            "sticky top-0 z-30 -mx-1 mb-2 rounded-2xl px-2 py-2.5",
            "border border-white/[0.18] bg-white/[0.42] backdrop-blur-2xl supports-[backdrop-filter]:bg-white/[0.32]",
            "shadow-[0_8px_32px_-12px_rgba(0,0,0,0.14),inset_0_1px_0_0_rgba(255,255,255,0.55)]",
            "dark:border-white/[0.09] dark:bg-[#0d0d14]/32 dark:supports-[backdrop-filter]:bg-[#0d0d14]/22",
            "dark:shadow-[0_12px_40px_-16px_rgba(0,0,0,0.65),inset_0_1px_0_0_rgba(255,255,255,0.08)]"
          )}
        >
          <div className="grid grid-cols-[minmax(2.75rem,auto)_1fr_minmax(2.75rem,auto)] items-center gap-1">
            <div className="flex justify-start">
              <button
                type="button"
                onClick={goHistoryBack}
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-foreground outline-none",
                  "transition hover:bg-muted/30 active:bg-muted/45",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                )}
                aria-label="Назад"
              >
                <ArrowLeft className="h-[1.35rem] w-[1.35rem]" strokeWidth={2.25} aria-hidden />
              </button>
            </div>
            <div className="min-w-0 px-1 text-center">
              <h1 className="truncate text-[17px] font-semibold leading-tight tracking-tight text-foreground md:text-lg">
                Финансы
              </h1>
            </div>
            <div className="flex justify-end pr-0.5">
              <NotificationBell />
            </div>
          </div>
        </div>

        {user.role === "SUPER_ADMIN" ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-900 dark:text-amber-100/90">
            Лента операций API привязана к ролям инвестора и владельца. Войдите под таким пользователем, чтобы видеть
            движения, или пользуйтесь разделами управления.
          </div>
        ) : null}

        <section className="flex flex-col overflow-visible rounded-xl border border-border/25 p-2 sm:p-3 md:rounded-2xl md:p-4" style={glassCard}>
          <DashboardOperationsHistory
            embedded
            financeProminentFilters
            financePageScroll
            enabled={movementsEnabled}
            glassCard={glassCard}
            showMultiPositionLabels={myInvestors.length > 1}
            operationsHistoryScope={operationsHistoryScope}
            onOperationClick={(item) => setDetailItem(item)}
          />
        </section>

        <MobileBottomNav active="finance" />
      </div>

      <FinanceOperationDetailModal item={detailItem} open={detailItem != null} onClose={() => setDetailItem(null)} />
    </Container>
  );
}
