"use client";

import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { Container } from "@/components/ui/Container";
import { BusinessRateControlCenter } from "@/components/manage/BusinessRateControlCenter";
import { apiClient } from "@/lib/api-client";
import { formatCurrency, cn } from "@/lib/utils";
import { glassAccentSurface } from "@/lib/dashboard-glass-accent";
import { DASHBOARD_STICKY_BAR_CLASS } from "@/lib/dashboard-sticky-bar";
import MobileBottomNav from "@/components/navigation/MobileBottomNav";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { UserAvatar } from "@/components/user/UserAvatar";
import NotificationBell from "@/components/notifications/NotificationBell";

import { SuperAdminNetworkOverviewCard } from "@/components/dashboard/SuperAdminNetworkOverviewCard";
import { CreateInvestorModal } from "@/components/investors/CreateInvestorModal";
import type { PrivateInvestorCreateContext } from "@/lib/private-investor-create-context";
import type { BusinessRateHistoryRow } from "@/lib/business-rate-history-display";
import { useAppDialogs } from "@/components/feedback/AppDialogsProvider";
import { toast } from "@/lib/notify";

function getCurrentWeek() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);

  const format = (date: Date) => {
    const days = ["ВС", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];
    const d = date.getDate().toString().padStart(2, "0");
    const m = (date.getMonth() + 1).toString().padStart(2, "0");
    return `${days[date.getDay()]} ${d}.${m}`;
  };

  return { start: format(monday), end: format(sunday), nextPayout: format(nextMonday) };
}

type SystemReadinessResponse = {
  ready: boolean;
  missing: string[];
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
  investor: any;
  credentials?: {
    username: string;
    password: string;
  };
};

export default function DashboardManagePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { confirm } = useAppDialogs();

  const [showModal, setShowModal] = useState(false);
  const [showReadinessDetails, setShowReadinessDetails] = useState(false);
  const [latestCredentials, setLatestCredentials] = useState<{ username: string; password: string } | null>(null);

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
  const formatAmountInput = (value: string) => {
    const amount = parseAmountInput(value);
    if (!amount) return "";
    return `${amount.toLocaleString("ru-RU")} ฿`;
  };
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
    mutationFn: (data: typeof formData) =>
      apiClient.post<InvestorCreateResponse>("/api/investors", {
        ...data,
        body: parseAmountInput(data.body),
        rate: Number(data.rate || 0),
      }),
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
      setLatestCredentials(result.credentials ?? null);
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

  const currentWeek = getCurrentWeek();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const systemReady = !isSuperAdmin || readinessData?.ready !== false;
  const missingChecks = readinessData?.missing ?? [];
  const checklistItems = [
    {
      key: "owner",
      label: "OWNER пользователь создан",
      ok: !isSuperAdmin || !missingChecks.includes("OWNER user"),
    },
    {
      key: "super-admin",
      label: "SUPER_ADMIN пользователь активен",
      ok: !isSuperAdmin || !missingChecks.includes("SUPER_ADMIN user"),
    },
    {
      key: "base-investor",
      label: "Базовый инвестор SUPER_ADMIN создан",
      ok: !isSuperAdmin || !missingChecks.includes("SUPER_ADMIN base investor in common network"),
    },
  ];

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
        <div className="thai-dashboard-root flex min-h-screen items-center justify-center py-16">
          <div className="thai-glass flex flex-col items-center gap-3 rounded-2xl px-8 py-6">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <Text className="text-foreground">Загрузка…</Text>
          </div>
        </div>
      </Container>
    );
  }
  if (!user) return null;

  const createDisabled = createMutation.isPending || !systemReady;
  return (
    <Container>
      <div className="thai-dashboard-root min-h-screen space-y-3 py-3 pb-24 md:space-y-5 md:py-8 md:pb-28">
        <div className={DASHBOARD_STICKY_BAR_CLASS}>
          <button
            type="button"
            onClick={() => router.push("/dashboard/profile")}
            className="thai-glass flex min-w-0 items-center gap-2 rounded-xl px-2.5 py-1.5 transition hover:brightness-[1.03] dark:hover:brightness-110"
          >
            <UserAvatar name={user.username} src={user.avatarUrl} size={38} />
            <span className="truncate text-base font-semibold tracking-tight">{user.username}</span>
            <span className="text-muted-foreground" aria-hidden>
              ›
            </span>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />
          </div>
        </div>

        <div className="thai-glass space-y-2.5 rounded-2xl p-2.5 md:p-4">
          <div className="flex flex-col gap-1.5">
            <div className="thai-hero-accent" aria-hidden />
            <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Управление</Text>
            <Text className="text-base font-semibold tracking-tight text-foreground">
              Центр операционных действий
            </Text>
          </div>
          {isSuperAdmin && (
            <div className="mb-3">
              <CollapsibleSection
                title="Система"
                subtitle={systemReady ? "Готова к учёту" : "Требуется настройка"}
                defaultOpen={!systemReady}
              >
                <div className="rounded-xl border border-border/50 bg-muted/15 p-2.5 backdrop-blur-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "inline-block h-2.5 w-2.5 rounded-full",
                          systemReady ? "bg-emerald-500" : "bg-red-500"
                        )}
                      />
                      <Text className={cn("text-xs font-semibold", systemReady ? "text-emerald-600" : "text-red-600")}>
                        {systemReady ? "Система готова к учёту" : "Система не готова к учёту"}
                      </Text>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowReadinessDetails((v) => !v)}
                    >
                      {showReadinessDetails ? "Скрыть" : "Подробнее"}
                    </Button>
                  </div>

                  {showReadinessDetails && (
                    <div className="mt-2 grid grid-cols-1 gap-1.5 md:grid-cols-2 md:gap-2">
                      {checklistItems.map((item) => (
                        <div
                          key={item.key}
                          className={cn(
                            "rounded-lg border p-2 text-xs font-medium",
                            item.ok
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
                          )}
                        >
                          <span className="mr-1">{item.ok ? "✓" : "!"}</span>
                          {item.label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CollapsibleSection>
            </div>
          )}

          {isSuperAdmin ? <SuperAdminNetworkOverviewCard /> : null}

          <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Действия</Text>
          {!loadingReadiness && !systemReady && (
            <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5">
              <Text className="text-xs font-medium text-amber-700 dark:text-amber-300">
                Перед стартом учёта нужно завершить базовую настройку системы.
              </Text>
              {readinessData?.missing?.length ? (
                <ul className="mt-1 text-xs text-amber-700/90 dark:text-amber-300/90">
                  {readinessData.missing.map((item) => (
                    <li key={item}>- {item}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 sm:gap-2">
            <Button
              onClick={() => setShowModal(true)}
              size="sm"
              variant="outline"
              className={cn("w-full", glassAccentSurface)}
              disabled={createDisabled}
            >
              Создать инвестора
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              className="w-full" 
              onClick={() => router.push("/dashboard/investors")}
            >
              Список инвесторов
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3 sm:gap-2">
            <button
              type="button"
              onClick={() => router.push("/dashboard/investors")}
              className="thai-row-interactive thai-glass rounded-xl border border-border/40 p-2.5 text-left md:p-3"
            >
              <Text className="text-sm font-semibold text-foreground">Реестр инвесторов</Text>
              <Text className="mt-1 text-xs text-muted-foreground">Поиск, фильтры и контроль статусов</Text>
            </button>
            <button
              type="button"
              onClick={() => router.push("/dashboard/finance")}
              className="thai-row-interactive thai-glass rounded-xl border border-border/40 p-2.5 text-left md:p-3"
            >
              <Text className="text-sm font-semibold text-foreground">Финансы и очереди</Text>
              <Text className="mt-1 text-xs text-muted-foreground">Выводы, пополнения тела, аудит действий</Text>
            </button>
            <button
              type="button"
              onClick={() => router.push("/dashboard/profile")}
              className="thai-row-interactive thai-glass rounded-xl border border-border/40 p-2.5 text-left md:p-3"
            >
              <Text className="text-sm font-semibold text-foreground">Профиль и безопасность</Text>
              <Text className="mt-1 text-xs text-muted-foreground">Учётная запись и админ-безопасность</Text>
            </button>
          </div>
          <div className="mt-2">
            <Text className="text-xs text-muted-foreground">
              Цикл: {currentWeek.start} - {currentWeek.end} | Выплата: {currentWeek.nextPayout}
            </Text>
          </div>
        </div>

        {(user.role === "OWNER" || user.role === "SUPER_ADMIN") && (
          <div className="thai-glass space-y-2.5 rounded-2xl p-2.5 md:p-4">
            <Text className="text-xs font-semibold text-muted-foreground">Центр управления ставкой</Text>
            <BusinessRateControlCenter
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

        <div className="thai-glass rounded-2xl p-2.5 md:p-4">
          <Text className="text-sm text-muted-foreground">
            Детальная информация по инвесторам доступна в разделе{" "}
            <button
              type="button"
              className="font-medium text-primary underline transition hover:opacity-90"
              onClick={() => router.push("/dashboard/investors")}
            >
              Инвесторы
            </button>
            .
          </Text>
        </div>

        {latestCredentials ? (
          <div className="thai-glass rounded-2xl p-2.5 md:p-4">
            <Text className="text-xs font-semibold text-muted-foreground mb-2">
              Доступ инвестора
            </Text>
            <div className="rounded-xl border border-border/50 bg-muted/10 p-2.5 text-sm backdrop-blur-sm md:p-3">
              <div>Логин: <span className="font-semibold">{latestCredentials.username}</span></div>
              <div className="mt-1">Пароль: <span className="font-semibold">{latestCredentials.password}</span></div>
            </div>
          </div>
        ) : null}

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
