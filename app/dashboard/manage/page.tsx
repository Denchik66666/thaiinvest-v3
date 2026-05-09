"use client";

import type { CSSProperties } from "react";
import { useState, useMemo, useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Text } from "@/components/ui/Text";
import { Container } from "@/components/ui/Container";
import { BusinessRateControlCenter } from "@/components/manage/BusinessRateControlCenter";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import MobileBottomNav from "@/components/navigation/MobileBottomNav";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import NotificationBell from "@/components/notifications/NotificationBell";

import { SuperAdminNetworkOverviewCard } from "@/components/dashboard/SuperAdminNetworkOverviewCard";
import { CreateInvestorModal } from "@/components/investors/CreateInvestorModal";
import {
  InvestorCredentialsReveal,
  type InvestorCredentials,
} from "@/components/investors/InvestorCredentialsReveal";
import { investorsDashboardListQueryKey, investorsDashboardNetworkParam } from "@/lib/investors-query";
import type { PrivateInvestorCreateContext } from "@/lib/private-investor-create-context";
import type { BusinessRateHistoryRow } from "@/lib/business-rate-history-display";
import { toast } from "@/lib/notify";
import type { Investor } from "@/types/investor";

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

const STICKY_HEADER_SHELL =
  "sticky top-0 z-30 -mx-1 mb-2 rounded-2xl px-2 py-2.5 border border-white/[0.18] bg-white/[0.42] backdrop-blur-2xl supports-[backdrop-filter]:bg-white/[0.32] shadow-[0_8px_32px_-12px_rgba(0,0,0,0.14),inset_0_1px_0_0_rgba(255,255,255,0.55)] dark:border-white/[0.09] dark:bg-[#0d0d14]/32 dark:supports-[backdrop-filter]:bg-[#0d0d14]/22 dark:shadow-[0_12px_40px_-16px_rgba(0,0,0,0.65),inset_0_1px_0_0_rgba(255,255,255,0.08)]";

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

type SystemReadinessResponse = {
  ready: boolean;
  missing: string[];
  missingBlocking?: string[];
  missingOptional?: string[];
};

/** Lean-снимок для счётчиков OWNER (совпадает с главным дашбордом). */
type ManageLeanInvestor = {
  id: number;
  owner: { username: string };
  payments?: { status: string }[];
};

type BusinessRateResponse = {
  success: boolean;
  current: {
    rate: number;
    effectiveDate: string;
  } | null;
};

type BusinessRateHistoryResponse = {
  success: boolean;
  rates: BusinessRateHistoryRow[];
};

type InvestorCreateResponse = {
  success: boolean;
  investor: Investor;
  credentials?: {
    username: string;
    password: string;
  };
};

const manageGhostLink =
  "text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground underline-offset-2 transition hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm";

const manageGhostLinkPrimary =
  "text-[10px] font-semibold uppercase tracking-[0.1em] text-primary/90 underline-offset-2 transition hover:text-primary hover:underline disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm";

const roleStripShell =
  "rounded-xl border border-foreground/[0.06] border-l-2 border-l-primary/45 bg-foreground/[0.02] px-2.5 py-1.5 dark:border-white/[0.07] dark:bg-white/[0.02]";

export default function DashboardManagePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const isDark = useSyncExternalStore(subscribeHtmlDark, snapshotHtmlDark, serverHtmlDark);
  const glassCard = isDark ? GLASS_CARD_DARK : GLASS_CARD_LIGHT;

  const [showModal, setShowModal] = useState(false);
  const [showReadinessDetails, setShowReadinessDetails] = useState(false);
  const [credentialsDialog, setCredentialsDialog] = useState<InvestorCredentials | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    handle: "",
    phone: "",
    body: "",
    rate: "",
    entryDate: new Date().toISOString().split("T")[0],
    isPrivate: false,
  });

  const parseAmountInput = (value: string) => Number(value.replace(/[^\d]/g, ""));
  const { data: privateCreateCtxData, isLoading: loadingPrivateCreateCtx } = useQuery({
    queryKey: ["investors-private-create-context"],
    queryFn: () =>
      apiClient.get<{ success: boolean; context: PrivateInvestorCreateContext }>(
        "/api/investors/private-create-context"
      ),
    enabled: !!user && user.role === "SUPER_ADMIN" && showModal,
  });

  const { data: readinessData, isLoading: loadingReadiness } = useQuery({
    queryKey: ["system-readiness"],
    queryFn: () => apiClient.get<SystemReadinessResponse>("/api/system/readiness"),
    enabled: !!user && user.role === "SUPER_ADMIN",
  });
  const { data: businessRateData } = useQuery({
    queryKey: ["business-rate-current"],
    queryFn: () => apiClient.get<BusinessRateResponse>("/api/system/business-rate"),
    enabled: !!user && (user.role === "OWNER" || user.role === "SUPER_ADMIN"),
  });

  const { data: businessRateHistoryData, isPending: businessRateHistoryPending } = useQuery({
    queryKey: ["business-rate-history"],
    queryFn: () => apiClient.get<BusinessRateHistoryResponse>("/api/system/business-rate/history"),
    enabled: !!user && (user.role === "OWNER" || user.role === "SUPER_ADMIN"),
  });

  const { data: ownerInvestorsData } = useQuery({
    queryKey: investorsDashboardListQueryKey(user?.role),
    queryFn: () =>
      apiClient.get<{ investors: ManageLeanInvestor[] }>(
        `/api/investors?network=${investorsDashboardNetworkParam(user!.role)}&lean=1`
      ),
    enabled: !!user && user.role === "OWNER",
    placeholderData: keepPreviousData,
    refetchInterval: 45_000,
    refetchOnWindowFocus: true,
  });

  const { data: ownerBodyTopUpData } = useQuery({
    queryKey: ["body-topup-requests"],
    queryFn: () =>
      apiClient.get<{ requests: { status: string }[] }>("/api/body-topup-requests"),
    enabled: !!user && user.role === "OWNER",
    staleTime: 120_000,
  });

  const businessNext = useMemo(() => {
    const rates = businessRateHistoryData?.rates;
    if (!rates?.length) return null;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const future = rates
      .filter((r) => {
        const d = new Date(r.effectiveDate);
        d.setHours(0, 0, 0, 0);
        return d.getTime() > start.getTime();
      })
      .sort((a, b) => +new Date(a.effectiveDate) - +new Date(b.effectiveDate));
    const row = future[0];
    if (!row) return null;
    return { rate: row.newRate, effectiveDate: row.effectiveDate };
  }, [businessRateHistoryData]);

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => {
      const base = {
        name: data.name,
        handle: data.handle,
        phone: data.phone,
        body: parseAmountInput(data.body),
        entryDate: data.entryDate,
        isPrivate: data.isPrivate,
      };
      /** Ставка карточки в общей сети всегда с сервера по дате входа; в личной — из контекста SUPER_ADMIN. */
      return apiClient.post<InvestorCreateResponse>("/api/investors", base);
    },
    onSuccess: (result) => {
      toast.success("Инвестор создан");
      setShowModal(false);
      setFormData({
        name: "",
        handle: "",
        phone: "",
        body: "",
        rate: "",
        entryDate: new Date().toISOString().split("T")[0],
        isPrivate: false,
      });
      if (result.credentials) setCredentialsDialog(result.credentials);
      queryClient.invalidateQueries({ queryKey: ["investors"] });
      queryClient.invalidateQueries({ queryKey: ["investors-private-create-context"] });
    },
    onError: (error: unknown) => {
      console.error("Create investor error:", error);
    },
  });

  const setBusinessRateMutation = useMutation({
    meta: { skipErrorToast: true },
    mutationFn: (payload: { newRate: number; effectiveDate: string; comment?: string }) =>
      apiClient.post("/api/system/business-rate", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["business-rate-current"] });
      queryClient.invalidateQueries({ queryKey: ["business-rate-history"] });
      queryClient.invalidateQueries({ queryKey: ["investors"] });
      queryClient.invalidateQueries({ queryKey: ["reports-feed"] });
    },
  });

  const patchBusinessRateHistoryMutation = useMutation({
    meta: { skipErrorToast: true },
    mutationFn: (vars: { id: number; newRate: number; effectiveDate: string; comment: string | null }) =>
      apiClient.patch(`/api/system/business-rate/history/${vars.id}`, {
        newRate: vars.newRate,
        effectiveDate: vars.effectiveDate,
        comment: vars.comment,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["business-rate-current"] });
      queryClient.invalidateQueries({ queryKey: ["business-rate-history"] });
      queryClient.invalidateQueries({ queryKey: ["investors"] });
      queryClient.invalidateQueries({ queryKey: ["reports-feed"] });
    },
  });

  const deleteBusinessRateHistoryMutation = useMutation({
    meta: { skipErrorToast: true },
    mutationFn: (id: number) => apiClient.delete(`/api/system/business-rate/history/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["business-rate-current"] });
      queryClient.invalidateQueries({ queryKey: ["business-rate-history"] });
      queryClient.invalidateQueries({ queryKey: ["investors"] });
      queryClient.invalidateQueries({ queryKey: ["reports-feed"] });
    },
  });

  const planSectionBusy =
    patchBusinessRateHistoryMutation.isPending || deleteBusinessRateHistoryMutation.isPending;

  const planBusyRowId =
    patchBusinessRateHistoryMutation.isPending && patchBusinessRateHistoryMutation.variables
      ? patchBusinessRateHistoryMutation.variables.id
      : deleteBusinessRateHistoryMutation.isPending && typeof deleteBusinessRateHistoryMutation.variables === "number"
        ? deleteBusinessRateHistoryMutation.variables
        : null;

  const planActionError =
    patchBusinessRateHistoryMutation.isError && patchBusinessRateHistoryMutation.error instanceof Error
      ? patchBusinessRateHistoryMutation.error.message
      : deleteBusinessRateHistoryMutation.isError && deleteBusinessRateHistoryMutation.error instanceof Error
        ? deleteBusinessRateHistoryMutation.error.message
        : null;

  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const isOwner = user?.role === "OWNER";
  const systemReady = !isSuperAdmin || readinessData?.ready !== false;
  const missingBlockingChecks = readinessData?.missingBlocking ?? readinessData?.missing ?? [];
  const missingOptionalChecks = readinessData?.missingOptional ?? [];

  const ownerMyInvestors = useMemo(() => {
    if (!isOwner || !user?.username) return [];
    const list = ownerInvestorsData?.investors ?? [];
    return list.filter((inv) => inv.owner.username === user.username);
  }, [isOwner, user?.username, ownerInvestorsData?.investors]);

  const ownerWithdrawRequestedCount = useMemo(() => {
    let n = 0;
    for (const inv of ownerMyInvestors) {
      for (const p of inv.payments ?? []) {
        if (p.status === "requested") n += 1;
      }
    }
    return n;
  }, [ownerMyInvestors]);

  const ownerBodyTopUpPendingCount = useMemo(() => {
    const all = ownerBodyTopUpData?.requests ?? [];
    return all.filter((r) => r.status === "pending_investor").length;
  }, [ownerBodyTopUpData?.requests]);
  const checklistItems = [
    {
      key: "owner",
      label: "OWNER пользователь создан",
      ok: !isSuperAdmin || !missingBlockingChecks.includes("OWNER user"),
    },
    {
      key: "super-admin",
      label: "SUPER_ADMIN пользователь активен",
      ok: !isSuperAdmin || !missingBlockingChecks.includes("SUPER_ADMIN user"),
    },
    {
      key: "base-investor",
      label: "Базовый инвестор SUPER_ADMIN создан",
      ok: !isSuperAdmin || !missingOptionalChecks.includes("SUPER_ADMIN base investor in common network"),
      optional: true,
    },
  ];

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/dashboard");
  };

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
      const timeoutId = window.setTimeout(() => {
        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
      }, 120);
      return () => window.clearTimeout(timeoutId);
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!authLoading && user?.role === "INVESTOR") {
      router.replace("/dashboard");
    }
  }, [authLoading, user, router]);

  if (authLoading) {
    return (
      <Container>
        <div
          className="thai-dashboard-root flex min-h-screen items-center justify-center py-16"
          style={isDark ? DASHBOARD_DARK_ROOT_STYLE : undefined}
        >
          <div className="flex flex-col items-center gap-3 rounded-2xl px-8 py-6" style={glassCard}>
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <Text className="text-sm text-muted-foreground">Загрузка…</Text>
          </div>
        </div>
      </Container>
    );
  }
  if (!user) return null;

  const createDisabled = createMutation.isPending || !systemReady;

  return (
    <Container>
      <div
        className="thai-dashboard-root min-h-screen space-y-3 py-3 pb-24 md:space-y-4 md:py-6 md:pb-28"
        style={isDark ? DASHBOARD_DARK_ROOT_STYLE : undefined}
      >
        <div className={STICKY_HEADER_SHELL}>
          <div className="grid grid-cols-[minmax(2.75rem,auto)_1fr_minmax(2.75rem,auto)] items-center gap-1">
            <div className="flex justify-start">
              <button
                type="button"
                onClick={goBack}
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
            <div className="flex min-w-0 flex-col items-center px-1 text-center">
              <h1 className="truncate text-[17px] font-semibold leading-tight tracking-tight text-foreground md:text-lg">
                Управление
              </h1>
              <span
                className="mt-1 h-0.5 w-10 rounded-full bg-gradient-to-r from-transparent via-primary/65 to-transparent"
                aria-hidden
              />
            </div>
            <div className="flex justify-end pr-0.5">
              <NotificationBell />
            </div>
          </div>
        </div>

        <section
          className="flex flex-col gap-2.5 overflow-visible rounded-2xl border border-foreground/[0.06] p-2.5 sm:p-3 md:gap-3 md:p-4 dark:border-white/[0.07]"
          style={glassCard}
        >
          {isSuperAdmin && !loadingReadiness && !systemReady ? (
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-2 py-1.5">
              <Text className="text-[11px] font-medium leading-snug text-amber-950/95 dark:text-amber-50/95">
                Завершите базовую настройку перед стартом учёта.
              </Text>
              {missingBlockingChecks?.length ? (
                <ul className="mt-1 space-y-0.5 text-[10px] leading-snug text-amber-900/90 dark:text-amber-100/85">
                  {missingBlockingChecks.map((item: string) => (
                    <li key={item}>· {item}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {isOwner ? (
            <div className={roleStripShell}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] leading-snug">
                <span className="font-semibold uppercase tracking-[0.14em] text-muted-foreground">Owner</span>
                <span className="text-muted-foreground/45" aria-hidden>
                  ·
                </span>
                {ownerWithdrawRequestedCount > 0 || ownerBodyTopUpPendingCount > 0 ? (
                  <span className="text-muted-foreground">
                    вывод{" "}
                    <span className="tabular-nums font-semibold text-foreground">{ownerWithdrawRequestedCount}</span>
                    <span className="mx-0.5 text-muted-foreground/50">·</span>
                    пополнения{" "}
                    <span className="tabular-nums font-semibold text-foreground">{ownerBodyTopUpPendingCount}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">нет активных запросов</span>
                )}
                <span className="text-muted-foreground/45" aria-hidden>
                  ·
                </span>
                <button type="button" className={manageGhostLink} onClick={() => router.push("/dashboard")}>
                  Главная
                </button>
                <button type="button" className={manageGhostLink} onClick={() => router.push("/dashboard/investors")}>
                  Реестр
                </button>
                <button type="button" className={manageGhostLink} onClick={() => router.push("/dashboard/finance")}>
                  Финансы
                </button>
              </div>
            </div>
          ) : null}

          {isSuperAdmin ? (
            <div className={cn(roleStripShell, !systemReady && "border-l-amber-500/50")}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] leading-snug">
                <span className="font-semibold uppercase tracking-[0.14em] text-muted-foreground">Super admin</span>
                <span
                  className={cn(
                    "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                    systemReady ? "bg-emerald-500" : "bg-red-500"
                  )}
                  title={systemReady ? "Учёт доступен" : "Учёт заблокирован"}
                  aria-hidden
                />
                <span className={cn("font-medium tabular-nums", systemReady ? "text-emerald-600" : "text-red-500")}>
                  {systemReady ? "учёт активен" : "нужна настройка"}
                </span>
                <span className="text-muted-foreground/45" aria-hidden>
                  ·
                </span>
                <button type="button" className={manageGhostLink} onClick={() => router.push("/dashboard")}>
                  Главная
                </button>
                <button type="button" className={manageGhostLink} onClick={() => router.push("/dashboard/investors")}>
                  Реестр
                </button>
                <button type="button" className={manageGhostLink} onClick={() => router.push("/dashboard/finance")}>
                  Финансы
                </button>
              </div>
            </div>
          ) : null}

          {(user.role === "OWNER" || user.role === "SUPER_ADMIN") && (
            <div className="border-t border-foreground/[0.06] pt-2.5 dark:border-white/[0.07]">
              <BusinessRateControlCenter
                viewerRole={user.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "OWNER"}
                current={businessRateData?.current ?? null}
                rates={businessRateHistoryData?.rates ?? []}
                isHistoryLoading={businessRateHistoryPending}
                onSubmit={(payload) => setBusinessRateMutation.mutateAsync(payload)}
                isSubmitting={setBusinessRateMutation.isPending}
                submitError={
                  setBusinessRateMutation.isError && setBusinessRateMutation.error instanceof Error
                    ? setBusinessRateMutation.error.message
                    : null
                }
                onPatchPlanRow={(payload) => patchBusinessRateHistoryMutation.mutateAsync(payload)}
                onDeletePlanRow={(id) => deleteBusinessRateHistoryMutation.mutateAsync(id)}
                planSectionBusy={planSectionBusy}
                planBusyRowId={planBusyRowId}
                planActionError={planActionError}
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-foreground/[0.06] pt-2.5 dark:border-white/[0.07]">
            <button
              type="button"
              disabled={createDisabled}
              onClick={() => setShowModal(true)}
              className={manageGhostLinkPrimary}
            >
              Создать инвестора
            </button>
            <span className="text-[10px] text-muted-foreground/35" aria-hidden>
              ·
            </span>
            <button type="button" className={manageGhostLink} onClick={() => router.push("/dashboard/investors")}>
              Реестр
            </button>
            <span className="text-[10px] text-muted-foreground/35" aria-hidden>
              ·
            </span>
            <button type="button" className={manageGhostLink} onClick={() => router.push("/dashboard/finance")}>
              Финансы
            </button>
            <span className="text-[10px] text-muted-foreground/35" aria-hidden>
              ·
            </span>
            <button type="button" className={manageGhostLink} onClick={() => router.push("/dashboard/profile")}>
              Профиль
            </button>
          </div>

          {isSuperAdmin ? (
            <SuperAdminNetworkOverviewCard
              compact
              className="rounded-2xl border border-foreground/[0.06] border-l-primary/30 bg-gradient-to-b from-card/40 to-transparent shadow-none dark:border-white/[0.07] md:p-2"
            />
          ) : null}

          {isSuperAdmin ? (
            <CollapsibleSection
              key={
                loadingReadiness
                  ? "readiness-loading"
                  : systemReady
                    ? "readiness-ok"
                    : "readiness-blocked"
              }
              title="Система"
              subtitle={systemReady ? "Чеклист по запросу" : "Требуется настройка"}
              defaultOpen={!systemReady}
              className="rounded-2xl border border-foreground/[0.06] bg-foreground/[0.02] shadow-none dark:border-white/[0.07] dark:bg-white/[0.03]"
              contentClassName="px-2.5 py-2"
            >
              <div className="rounded-xl border border-foreground/[0.05] bg-background/30 p-2.5 dark:border-white/[0.06] dark:bg-black/20">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        "inline-block h-2 w-2 shrink-0 rounded-full",
                        systemReady ? "bg-emerald-500" : "bg-red-500"
                      )}
                    />
                    <Text
                      className={cn("truncate text-[11px] font-semibold", systemReady ? "text-emerald-600" : "text-red-600")}
                    >
                      {systemReady ? "Учёт доступен" : "Учёт заблокирован"}
                    </Text>
                  </div>
                  <button
                    type="button"
                    className={manageGhostLink}
                    onClick={() => setShowReadinessDetails((v) => !v)}
                  >
                    {showReadinessDetails ? "Скрыть чеклист" : "Чеклист"}
                  </button>
                </div>

                {showReadinessDetails ? (
                  <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-3">
                    {checklistItems.map((item) => (
                      <div
                        key={item.key}
                        className={cn(
                          "rounded-md border px-2 py-1.5 text-[10px] font-medium leading-tight",
                          item.ok
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                            : item.optional
                              ? "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100"
                              : "border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-200"
                        )}
                      >
                        <span className="mr-0.5">{item.ok ? "✓" : item.optional ? "·" : "!"}</span>
                        {item.label}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </CollapsibleSection>
          ) : null}
        </section>

        <InvestorCredentialsReveal
          open={credentialsDialog !== null}
          credentials={credentialsDialog}
          onDismiss={() => setCredentialsDialog(null)}
        />

        <CreateInvestorModal
          open={showModal}
          onClose={() => setShowModal(false)}
          onSubmit={() => createMutation.mutate(formData)}
          formData={formData}
          setFormData={setFormData}
          userRole={user.role}
          loading={createDisabled}
          privateContext={privateCreateCtxData?.context ?? null}
          privateContextLoading={loadingPrivateCreateCtx}
          businessCurrent={businessRateData?.current ?? null}
          businessNext={businessNext}
          error={
            !systemReady
              ? "Система не готова к старту учёта. Завершите базовую настройку."
              : createMutation.error instanceof Error
                ? createMutation.error.message
                : undefined
          }
        />

        <MobileBottomNav active="manage" />
      </div>
    </Container>
  );
}
