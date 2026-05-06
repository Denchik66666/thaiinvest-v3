"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { investorDisplayHandle } from "@/lib/investor-display-handle";
import { DashboardOperationsHistory } from "@/components/dashboard/DashboardOperationsHistory";
import {
  FinanceInvestorAccordionCards,
  type FinanceInvestorAccordionExpanded,
} from "@/components/dashboard/finance/FinanceInvestorAccordionCards";
import { FinanceOperationDetailModal } from "@/components/dashboard/finance/FinanceOperationDetailModal";
import type { FinanceOperationItem } from "@/types/finance-operations";
import type { FinanceOperationsHistoryOpFilter } from "@/types/finance-operations-filter";

type LeanInvestor = {
  id: number;
  name: string;
  handle?: string | null;
  investorUser?: { username: string } | null;
  linkedUser?: { id: number; username: string } | null;
  body: number;
  accrued: number;
  due: number;
  status: string;
  isPrivate?: boolean;
  linkedUserId?: number | null;
  investorUserId?: number | null;
  owner?: { username: string };
  payments?: { status: string }[];
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
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [detailItem, setDetailItem] = useState<FinanceOperationItem | null>(null);
  const [networkExpanded, setNetworkExpanded] = useState(false);

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
    refetchInterval:
      user?.role === "INVESTOR" || user?.role === "SUPER_ADMIN"
        ? 30_000
        : user?.role === "OWNER"
          ? 45_000
          : false,
    refetchOnWindowFocus: user?.role === "OWNER" || user?.role === "SUPER_ADMIN",
  });

  const myInvestors = useMemo(() => {
    const investors = investorsData?.investors ?? [];
    if (!user) return [];
    if (user.role === "SUPER_ADMIN")
      return investors.filter((inv) => !inv.isPrivate && inv.linkedUserId === user.id);
    if (user.role === "OWNER") return investors.filter((inv) => inv.owner?.username === user.username);
    return investors.filter((inv) => inv.investorUserId === user.id);
  }, [investorsData, user]);

  const rawInvestorParam = searchParams.get("investor");
  const investorIdFromUrl = useMemo(() => {
    if (!rawInvestorParam) return null;
    const n = Number(rawInvestorParam);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [rawInvestorParam]);

  const validatedInvestorFilterId = useMemo(() => {
    if (investorIdFromUrl == null) return null;
    if (!myInvestors.some((i) => i.id === investorIdFromUrl)) return null;
    return investorIdFromUrl;
  }, [investorIdFromUrl, myInvestors]);

  useEffect(() => {
    if (investorIdFromUrl == null) return;
    if (investorsData == null) return;
    if (validatedInvestorFilterId != null) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("investor");
    const qs = params.toString();
    router.replace(qs ? `/dashboard/finance?${qs}` : "/dashboard/finance");
  }, [investorIdFromUrl, validatedInvestorFilterId, investorsData, searchParams, router]);

  useEffect(() => {
    if (validatedInvestorFilterId != null) setNetworkExpanded(false);
  }, [validatedInvestorFilterId]);

  const accordionExpanded: FinanceInvestorAccordionExpanded = useMemo(() => {
    if (validatedInvestorFilterId != null) return { kind: "investor", id: validatedInvestorFilterId };
    if (networkExpanded) return { kind: "network" };
    return { kind: "collapsed" };
  }, [validatedInvestorFilterId, networkExpanded]);

  const effectiveFilterInvestorId = accordionExpanded.kind === "investor" ? accordionExpanded.id : null;

  const networkTotals = useMemo(
    () => ({
      body: myInvestors.reduce((s, i) => s + (i.body ?? 0), 0),
      accrued: myInvestors.reduce((s, i) => s + (i.accrued ?? 0), 0),
      due: myInvestors.reduce((s, i) => s + (i.due ?? 0), 0),
    }),
    [myInvestors]
  );

  const movementsEnabled =
    user?.role === "INVESTOR" || user?.role === "OWNER" || user?.role === "SUPER_ADMIN";
  const operationsHistoryScope = user?.role === "OWNER" ? "owner" : "investor";
  const backFallbackHref =
    user?.role === "INVESTOR" || user?.role === "SUPER_ADMIN" ? "/dashboard" : "/dashboard/manage";

  const showInvestorFilter =
    (user?.role === "OWNER" || user?.role === "SUPER_ADMIN") && myInvestors.length > 0;

  const pushInvestorQuery = useCallback(
    (next: number | null) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("payment");
      if (next == null) params.delete("investor");
      else params.set("investor", String(next));
      const qs = params.toString();
      router.replace(qs ? `/dashboard/finance?${qs}` : "/dashboard/finance");
    },
    [router, searchParams]
  );

  const onToggleNetwork = useCallback(() => {
    if (validatedInvestorFilterId != null) {
      pushInvestorQuery(null);
      setNetworkExpanded(true);
      return;
    }
    setNetworkExpanded((v) => !v);
  }, [validatedInvestorFilterId, pushInvestorQuery]);

  const onToggleInvestor = useCallback(
    (id: number) => {
      setNetworkExpanded(false);
      if (validatedInvestorFilterId === id) {
        pushInvestorQuery(null);
        return;
      }
      pushInvestorQuery(id);
    },
    [validatedInvestorFilterId, pushInvestorQuery]
  );

  const investorCardsSlot = showInvestorFilter
    ? ({
        renderFeed,
        opFilter,
        applyOperationFilter,
      }: {
        renderFeed: (investorId: number | null) => ReactNode;
        opFilter: FinanceOperationsHistoryOpFilter;
        applyOperationFilter: (filter: FinanceOperationsHistoryOpFilter) => void;
      }) => (
        <FinanceInvestorAccordionCards
          investors={myInvestors.map((inv) => ({
            id: inv.id,
            name: inv.name,
            handle: investorDisplayHandle(inv),
            due: inv.due ?? 0,
            body: inv.body ?? 0,
            accrued: inv.accrued ?? 0,
            status: inv.status ?? "",
            isPrivate: inv.isPrivate,
            requestedPayments: inv.payments?.filter((p) => p.status === "requested").length ?? 0,
          }))}
          networkTotals={networkTotals}
          expanded={accordionExpanded}
          onToggleNetwork={onToggleNetwork}
          onToggleInvestor={onToggleInvestor}
          onOpenInvestorProfile={(id) => router.push(`/dashboard/investors/${id}`)}
          renderFeed={renderFeed}
          opFilter={opFilter}
          onApplyMetricFilter={(filter, scope) => {
            if (scope.kind === "network") {
              if (validatedInvestorFilterId != null) pushInvestorQuery(null);
              setNetworkExpanded(true);
            } else {
              setNetworkExpanded(false);
              if (validatedInvestorFilterId !== scope.id) pushInvestorQuery(scope.id);
            }
            applyOperationFilter(filter);
          }}
        />
      )
    : undefined;

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

        <section className="flex flex-col overflow-visible rounded-xl border border-border/25 p-2 sm:p-3 md:rounded-2xl md:p-4" style={glassCard}>
          <DashboardOperationsHistory
            embedded
            financeProminentFilters
            financePageScroll
            enabled={movementsEnabled}
            glassCard={glassCard}
            showMultiPositionLabels={effectiveFilterInvestorId == null && myInvestors.length > 1}
            operationsHistoryScope={operationsHistoryScope}
            filterInvestorId={effectiveFilterInvestorId}
            financeInvestorCardsSlot={investorCardsSlot}
            financeSuppressBottomFeed={showInvestorFilter}
            onOperationClick={(item) => setDetailItem(item)}
          />
        </section>

        <MobileBottomNav active="finance" />
      </div>

      <FinanceOperationDetailModal item={detailItem} open={detailItem != null} onClose={() => setDetailItem(null)} />
    </Container>
  );
}
