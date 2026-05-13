"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import NotificationBell from "@/components/notifications/NotificationBell";
import MobileBottomNav from "@/components/navigation/MobileBottomNav";
import { useAuth, type AuthUser } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";
import {
  INVESTORS_LIST_QUERY_ROOT,
  investorsDashboardListQueryKey,
  investorsDashboardNetworkParam,
  type SuperAdminInvestorsNetwork,
} from "@/lib/investors-query";
import { investorDisplayHandle } from "@/lib/investor-display-handle";
import { DashboardOperationsHistory } from "@/components/dashboard/DashboardOperationsHistory";
import {
  FinanceInvestorAccordionCards,
  type FinanceInvestorAccordionExpanded,
} from "@/components/dashboard/finance/FinanceInvestorAccordionCards";
import { FinanceBodyTopUpModal } from "@/components/dashboard/finance/FinanceBodyTopUpModal";
import { FinanceOperationDetailModal } from "@/components/dashboard/finance/FinanceOperationDetailModal";
import { PaymentCorrectionQueue } from "@/components/dashboard/finance/PaymentCorrectionQueue";
import type { FinanceOperationItem } from "@/types/finance-operations";
import type { OperationsHistoryResponse } from "@/types/operations-finance-api";
import type { FinanceOperationsHistoryOpFilter } from "@/types/finance-operations-filter";

type LeanInvestor = {
  id: number;
  ownerId?: number;
  name: string;
  handle?: string | null;
  investorUser?: { username: string; avatarUrl?: string | null } | null;
  linkedUser?: { id: number; username: string; avatarUrl?: string | null } | null;
  body: number;
  accrued: number;
  paid?: number;
  entryDate?: string | null;
  status: string;
  isPrivate?: boolean;
  linkedUserId?: number | null;
  investorUserId?: number | null;
  owner?: { username: string; role?: string };
  isSystemOwner?: boolean;
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

function FinanceHubFinanceBody({ user }: { user: AuthUser }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [detailItem, setDetailItem] = useState<FinanceOperationItem | null>(null);
  const [bodyTopUpOpen, setBodyTopUpOpen] = useState(false);
  const [networkExpanded, setNetworkExpanded] = useState(false);
  /** Владелец с одной позицией: лента под карточкой по умолчанию свёрнута; раскрытие только по клику (состояние живёт на странице до обновления). */
  const [ownerSingleInvestorFeedCollapsed, setOwnerSingleInvestorFeedCollapsed] = useState(true);

  const saFinanceNetwork: SuperAdminInvestorsNetwork = useMemo(() => {
    if (user?.role !== "SUPER_ADMIN") return "common";
    const v = searchParams.get("network");
    if (v === "private" || v === "all") return v;
    return "common";
  }, [user?.role, searchParams]);

  const replaceSaNetwork = useCallback(
    (next: SuperAdminInvestorsNetwork) => {
      const p = new URLSearchParams(searchParams.toString());
      p.delete("investor");
      p.delete("payment");
      if (next === "common") p.delete("network");
      else p.set("network", next);
      const qs = p.toString();
      router.replace(qs ? `/dashboard/finance?${qs}` : "/dashboard/finance");
    },
    [router, searchParams]
  );

  const isDark = useSyncExternalStore(subscribeHtmlDark, snapshotHtmlDark, serverHtmlDark);
  const glassCard = isDark ? GLASS_CARD_DARK : GLASS_CARD_LIGHT;
  const queryClient = useQueryClient();

  const { data: investorsData } = useQuery({
    queryKey: investorsDashboardListQueryKey(
      user?.role,
      user?.role === "SUPER_ADMIN" ? saFinanceNetwork : undefined
    ),
    queryFn: () =>
      apiClient.get<{ investors: LeanInvestor[] }>(
        `/api/investors?network=${investorsDashboardNetworkParam(
          user!.role,
          user!.role === "SUPER_ADMIN" ? saFinanceNetwork : undefined
        )}&lean=1`
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
    if (user.role === "SUPER_ADMIN") return investors;
    if (user.role === "OWNER") {
      return investors.filter((inv) =>
        inv.ownerId != null ? inv.ownerId === user.id : inv.owner?.username === user.username
      );
    }
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

  const rawPaymentParam = searchParams.get("payment");
  const paymentIdFromUrl = useMemo(() => {
    if (!rawPaymentParam) return null;
    const n = Number(rawPaymentParam);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  }, [rawPaymentParam]);

  /** Позиция для подстановки выплаты из адреса: явно в ссылке или единственная позиция пользователя. */
  const resolvedInvestorForPaymentDeepLink = useMemo(() => {
    if (validatedInvestorFilterId != null) return validatedInvestorFilterId;
    if (paymentIdFromUrl != null && myInvestors.length === 1) return myInvestors[0].id;
    return null;
  }, [validatedInvestorFilterId, myInvestors, paymentIdFromUrl]);

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
    if (validatedInvestorFilterId == null && !networkExpanded) return;
    queueMicrotask(() => setOwnerSingleInvestorFeedCollapsed(false));
  }, [validatedInvestorFilterId, networkExpanded]);

  // Сворачиваем “сеть” сразу в обработчике выбора инвестора; отдельный effect не нужен.

  const accordionExpanded: FinanceInvestorAccordionExpanded = useMemo(() => {
    if (validatedInvestorFilterId != null) return { kind: "investor", id: validatedInvestorFilterId };
    /** Явный выбор «Вся сеть» — до дефолта одной позиции OWNER, иначе при одном инвесторе сеть никогда не раскрывалась (`renderFeed(null)` не вызывался). */
    if (networkExpanded) return { kind: "network" };
    /** Одна позиция у владельца: по умолчанию узкая лента без «вся сеть»; явное сворачивание — `ownerSingleInvestorFeedCollapsed`. */
    if (user?.role === "OWNER" && myInvestors.length === 1) {
      if (ownerSingleInvestorFeedCollapsed) return { kind: "collapsed" };
      return { kind: "investor", id: myInvestors[0].id };
    }
    return { kind: "collapsed" };
  }, [validatedInvestorFilterId, networkExpanded, user, myInvestors, ownerSingleInvestorFeedCollapsed]);

  const effectiveFilterInvestorId = accordionExpanded.kind === "investor" ? accordionExpanded.id : null;

  const hasOwnerCommonTopUpTargets = useMemo(
    () => user.role === "OWNER" && myInvestors.some((inv) => !inv.isPrivate),
    [user.role, myInvestors]
  );

  const { data: ownerBodyTopUpListData } = useQuery({
    queryKey: ["body-topup-requests"] as const,
    queryFn: () =>
      apiClient.get<{ requests: { investorId: number; status: string }[] }>("/api/body-topup-requests"),
    enabled: hasOwnerCommonTopUpTargets,
    staleTime: 30_000,
  });

  const pendingBodyTopUpIds = useMemo(() => {
    const ids = new Set<number>();
    for (const r of ownerBodyTopUpListData?.requests ?? []) {
      if (r.status === "pending_investor") ids.add(r.investorId);
    }
    return ids;
  }, [ownerBodyTopUpListData?.requests]);

  const networkTotals = useMemo(
    () => ({
      body: myInvestors.reduce((s, i) => s + (i.body ?? 0), 0),
      accrued: myInvestors.reduce((s, i) => s + (i.accrued ?? 0), 0),
      paid: myInvestors.reduce((s, i) => s + (i.paid ?? 0), 0),
      requestedPayments: myInvestors.reduce((s, i) => s + (i.payments?.filter((p) => p.status === "requested").length ?? 0), 0),
    }),
    [myInvestors]
  );

  const movementsEnabled =
    user?.role === "INVESTOR" || user?.role === "OWNER" || user?.role === "SUPER_ADMIN";
  const operationsHistoryScope = user?.role === "OWNER" ? "owner" : "investor";
  const backFallbackHref =
    user?.role === "INVESTOR" || user?.role === "SUPER_ADMIN" ? "/dashboard" : "/dashboard/manage";

  /**
   * Карточки позиций + «Вся сеть» (аккордеон): без них SUPER_ADMIN видел только нижнюю «Ленту»
   * из‑за пустого/ещё не подгруженного lean‑списка при том же network в истории.
   */
  const showInvestorFilter =
    user?.role === "SUPER_ADMIN" || (user?.role === "OWNER" && myInvestors.length > 0);

  const deepLinkHistoryEnabled =
    movementsEnabled &&
    paymentIdFromUrl != null &&
    resolvedInvestorForPaymentDeepLink != null &&
    !!user;

  const { data: deepLinkHistoryData } = useQuery({
    queryKey: ["investors", "operations-history", operationsHistoryScope, resolvedInvestorForPaymentDeepLink ?? -1] as const,
    queryFn: () =>
      apiClient.get<OperationsHistoryResponse>(
        `/api/investors/operations-history?investorId=${encodeURIComponent(String(resolvedInvestorForPaymentDeepLink))}`
      ),
    enabled: deepLinkHistoryEnabled && resolvedInvestorForPaymentDeepLink != null,
    staleTime: 45_000,
  });

  const deepLinkOpenedRef = useRef<string | null>(null);
  useEffect(() => {
    if (paymentIdFromUrl == null) {
      deepLinkOpenedRef.current = null;
      return;
    }
    if (resolvedInvestorForPaymentDeepLink == null) return;
    const dedupeKey = `${resolvedInvestorForPaymentDeepLink}:${paymentIdFromUrl}`;
    const items = deepLinkHistoryData?.items;
    if (!items?.length) return;
    const hit = items.find(
      (i): i is Extract<FinanceOperationItem, { kind: "payment" }> =>
        i.kind === "payment" &&
        i.paymentId === paymentIdFromUrl &&
        i.investorId === resolvedInvestorForPaymentDeepLink
    );
    if (!hit) return;
    if (deepLinkOpenedRef.current === dedupeKey) return;
    deepLinkOpenedRef.current = dedupeKey;
    queueMicrotask(() => setDetailItem(hit));
  }, [paymentIdFromUrl, resolvedInvestorForPaymentDeepLink, deepLinkHistoryData?.items]);

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

  const clearPaymentFromUrl = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (!params.has("payment")) return;
    params.delete("payment");
    const qs = params.toString();
    router.replace(qs ? `/dashboard/finance?${qs}` : "/dashboard/finance");
  }, [router, searchParams]);

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
      const singleOwner = user?.role === "OWNER" && myInvestors.length === 1;
      const soleId = singleOwner ? myInvestors[0]?.id : undefined;
      const isSoleCard = singleOwner && soleId === id;

      if (validatedInvestorFilterId === id) {
        pushInvestorQuery(null);
        if (isSoleCard) setOwnerSingleInvestorFeedCollapsed(true);
        return;
      }

      if (isSoleCard && validatedInvestorFilterId == null && ownerSingleInvestorFeedCollapsed) {
        setOwnerSingleInvestorFeedCollapsed(false);
        return;
      }

      if (isSoleCard && validatedInvestorFilterId == null && !ownerSingleInvestorFeedCollapsed) {
        setOwnerSingleInvestorFeedCollapsed(true);
        return;
      }

      setOwnerSingleInvestorFeedCollapsed(false);
      pushInvestorQuery(id);
    },
    [validatedInvestorFilterId, pushInvestorQuery, user, myInvestors, ownerSingleInvestorFeedCollapsed]
  );

  const investorCardsSlot = showInvestorFilter
    ? ({
        renderFeed,
        periodValue,
        operationsHistoryScope,
        opFilter,
        applyOperationFilter,
      }: {
        renderFeed: (investorId: number | null) => ReactNode;
        periodValue: import("@/components/dashboard/HistoryPeriodPopover").HistoryPeriodValue;
        operationsHistoryScope: "investor" | "owner";
        opFilter: FinanceOperationsHistoryOpFilter;
        applyOperationFilter: (filter: FinanceOperationsHistoryOpFilter) => void;
      }) => (
        <FinanceInvestorAccordionCards
          superAdminHistoryNetwork={user?.role === "SUPER_ADMIN" ? saFinanceNetwork : null}
          investors={myInvestors.map((inv) => ({
            id: inv.id,
            name: inv.name,
            handle: investorDisplayHandle(inv),
            avatarUrl: inv.linkedUser?.avatarUrl ?? inv.investorUser?.avatarUrl ?? null,
            body: inv.body ?? 0,
            accrued: inv.accrued ?? 0,
            paid: inv.paid ?? 0,
            status: inv.status ?? "",
            isPrivate: inv.isPrivate,
            requestedPayments: inv.payments?.filter((p) => p.status === "requested").length ?? 0,
            ownerRole: inv.owner?.role ?? null,
            ownerUsername: inv.owner?.username ?? null,
            isSystemOwner: inv.isSystemOwner,
          }))}
          networkTotals={networkTotals}
          expanded={accordionExpanded}
          onToggleNetwork={onToggleNetwork}
          onToggleInvestor={onToggleInvestor}
          onOpenInvestorProfile={(id) => router.push(`/dashboard/investors/${id}`)}
          renderFeed={renderFeed}
          periodValue={periodValue}
          operationsHistoryScope={operationsHistoryScope}
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
          {user.role === "SUPER_ADMIN" ? (
            <div
              className="mt-2 flex justify-center gap-1 border-t border-border/20 pt-2 dark:border-white/[0.06]"
              role="group"
              aria-label="Сеть позиций"
            >
              {(
                [
                  { id: "common" as const, label: "Общая" },
                  { id: "private" as const, label: "Личная" },
                  { id: "all" as const, label: "Все" },
                ] as const
              ).map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => replaceSaNetwork(id)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide outline-none transition",
                    "focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    saFinanceNetwork === id
                      ? "bg-primary/[0.14] text-primary ring-1 ring-primary/30"
                      : "text-muted-foreground hover:bg-muted/30 active:bg-muted/40"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <section className="flex flex-col overflow-visible rounded-xl border border-border/25 p-2 sm:p-3 md:rounded-2xl md:p-4" style={glassCard}>
          {movementsEnabled ? <PaymentCorrectionQueue /> : null}
          <DashboardOperationsHistory
            embedded
            embeddedCollapsible={
              showInvestorFilter && (user.role === "OWNER" || user.role === "SUPER_ADMIN")
            }
            embeddedInitiallyExpanded={effectiveFilterInvestorId != null}
            financeProminentFilters
            financePageScroll
            enabled={movementsEnabled}
            glassCard={glassCard}
            showMultiPositionLabels={effectiveFilterInvestorId == null && myInvestors.length > 1}
            operationsHistoryScope={operationsHistoryScope}
            filterInvestorId={effectiveFilterInvestorId}
            financeInvestorCardsSlot={investorCardsSlot}
            financeSuppressBottomFeed={showInvestorFilter}
            financeSuperAdminNetwork={user.role === "SUPER_ADMIN" ? saFinanceNetwork : null}
            onOperationClick={(item) => setDetailItem(item)}
            financeFeedHeaderSlot={
              hasOwnerCommonTopUpTargets ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 whitespace-nowrap rounded-full border border-border/45 bg-background/40 px-2.5 py-0 text-[10px] font-semibold uppercase leading-none tracking-wide text-muted-foreground hover:border-border/65 hover:bg-muted/20 hover:text-foreground dark:border-white/[0.08] dark:bg-transparent dark:hover:bg-white/[0.05]"
                  title="Запросить пополнение тела в общей сети (инвестор подтверждает)"
                  onClick={() => setBodyTopUpOpen(true)}
                >
                  Пополнение
                </Button>
              ) : null
            }
          />
        </section>

        <MobileBottomNav active="finance" />
      </div>

      <FinanceOperationDetailModal
        item={detailItem}
        open={detailItem != null}
        onClose={() => {
          setDetailItem(null);
          clearPaymentFromUrl();
        }}
      />

      {hasOwnerCommonTopUpTargets ? (
        <FinanceBodyTopUpModal
          open={bodyTopUpOpen}
          onClose={() => setBodyTopUpOpen(false)}
          investors={myInvestors.map((inv) => ({
            id: inv.id,
            name: inv.name,
            handle: inv.handle ?? null,
            body: inv.body ?? 0,
            entryDate: inv.entryDate != null ? String(inv.entryDate) : null,
            status: inv.status ?? "",
            isPrivate: inv.isPrivate,
            investorUser: inv.investorUser ?? null,
            linkedUser: inv.linkedUser ?? null,
            investorUserId: inv.investorUserId ?? null,
            linkedUserId: inv.linkedUserId ?? null,
          }))}
          hintInvestorId={effectiveFilterInvestorId}
          pendingTopUpIds={pendingBodyTopUpIds}
          onSuccess={() => {
            void queryClient.invalidateQueries({ queryKey: ["body-topup-requests"] });
            void queryClient.invalidateQueries({ queryKey: ["body-topup-requests-dashboard"] });
            void queryClient.invalidateQueries({ queryKey: [INVESTORS_LIST_QUERY_ROOT] });
            void queryClient.invalidateQueries({ queryKey: ["investors", "operations-history"] });
            void queryClient.invalidateQueries({ queryKey: ["reports-feed"] });
          }}
        />
      ) : null}

    </Container>
  );
}

/** Пока `useSearchParams` не готов — тот же каркас страницы без второго полноэкранного спиннера. */
function FinanceHubSuspensePlaceholder({
  isDark,
  glassCard,
}: {
  isDark: boolean;
  glassCard: CSSProperties;
}) {
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
            <div className="h-10 w-10 rounded-xl bg-muted/25" aria-hidden />
            <div className="min-w-0 px-1 text-center">
              <h1 className="truncate text-[17px] font-semibold leading-tight tracking-tight text-foreground md:text-lg">
                Финансы
              </h1>
            </div>
            <div className="flex justify-end pr-0.5">
              <div className="h-10 w-10 rounded-full bg-muted/25" aria-hidden />
            </div>
          </div>
        </div>

        <section className="flex flex-col overflow-visible rounded-xl border border-border/25 p-2 sm:p-3 md:rounded-2xl md:p-4" style={glassCard}>
          <div className="min-h-[42vh] animate-pulse rounded-lg bg-muted/12" aria-hidden />
        </section>

        <MobileBottomNav active="finance" />
      </div>
    </Container>
  );
}

export function FinanceHubInner() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const isDark = useSyncExternalStore(subscribeHtmlDark, snapshotHtmlDark, serverHtmlDark);
  const glassCard = isDark ? GLASS_CARD_DARK : GLASS_CARD_LIGHT;

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    document.documentElement.classList.add("thai-finance-touch-scroll");
    return () => document.documentElement.classList.remove("thai-finance-touch-scroll");
  }, [user]);

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
    <Suspense fallback={<FinanceHubSuspensePlaceholder isDark={isDark} glassCard={glassCard} />}>
      <FinanceHubFinanceBody user={user} />
    </Suspense>
  );
}
