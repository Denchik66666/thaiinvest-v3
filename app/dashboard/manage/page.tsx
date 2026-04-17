"use client";

import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { Container } from "@/components/ui/Container";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import { BusinessRateControlCenter } from "@/components/manage/BusinessRateControlCenter";
import { apiClient } from "@/lib/api-client";
import { formatCurrency, cn } from "@/lib/utils";
import { DASHBOARD_STICKY_BAR_CLASS } from "@/lib/dashboard-sticky-bar";
import MobileBottomNav from "@/components/navigation/MobileBottomNav";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { UserAvatar } from "@/components/user/UserAvatar";
import NotificationBell from "@/components/notifications/NotificationBell";
import { persistAppTheme } from "@/lib/app-theme";

import { InvestorsTable } from "@/components/investors/InvestorsTable";
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

type InvestorRow = {
  id: number;
  name: string;
  body: number;
  rate: number;
  accrued: number;
  paid: number;
  due: number;
  status: string;
  isPrivate: boolean;
  investorUserId?: number | null;
  investorUser?: {
    username: string;
  } | null;
  owner: {
    username: string;
    role: string;
  };
  payments?: PaymentRow[];
};

type PaymentRow = {
  id: number;
  type: "interest" | "body" | "close";
  amount: number;
  status: string;
  comment?: string | null;
  createdAt: string;
  approvedAt?: string | null;
  acceptedAt?: string | null;
};

type WeeklyLedgerRow = {
  weekStart: string;
  weekEnd: string;
  bodyStart: number;
  weeklyRatePercent: number;
  accruedAdded: number;
  interestPaid: number;
  bodyPaid: number;
  closingPaid: number;
  accruedEnd: number;
  bodyEnd: number;
};

type WeeklyLedgerResponse = {
  investor: {
    id: number;
    name: string;
    rate: number;
  };
  summary: {
    weeks: number;
    totalAccruedAdded: number;
    totalInterestPaid: number;
    totalBodyPaid: number;
  };
  note: string;
  rows: WeeklyLedgerRow[];
};

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
  investor: InvestorRow;
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

  const [networkFilter, setNetworkFilter] = useState<"common" | "private" | "all">("common");
  const [showModal, setShowModal] = useState(false);
  const [selectedInvestorId, setSelectedInvestorId] = useState<number | null>(null);
  const [showReadinessDetails, setShowReadinessDetails] = useState(false);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpForm, setTopUpForm] = useState({
    investorId: "",
    amount: "",
    comment: "",
  });
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
  const toggleDarkMode = () => {
    const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
    persistAppTheme("theme-linear", !isDark);
  };

  const { data: investorsData, isLoading: loadingInvestors } = useQuery({
    queryKey: ["investors", networkFilter],
    queryFn: () => apiClient.get<{ investors: InvestorRow[] }>(`/api/investors?network=${networkFilter}`),
    enabled: !!user,
  });

  const investors = useMemo(() => investorsData?.investors ?? [], [investorsData]);
  const selectedInvestor = useMemo(
    () => investors.find((inv) => inv.id === selectedInvestorId) ?? null,
    [investors, selectedInvestorId]
  );

  const { data: ledgerData, isLoading: loadingLedger } = useQuery({
    queryKey: ["weekly-ledger", selectedInvestorId],
    queryFn: () => apiClient.get<WeeklyLedgerResponse>(`/api/investors/${selectedInvestorId}/weekly-ledger`),
    enabled: !!selectedInvestorId && !!user,
  });

  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const { data: readinessData, isLoading: loadingReadiness } = useQuery({
    queryKey: ["system-readiness"],
    queryFn: () => apiClient.get<SystemReadinessResponse>("/api/system/readiness"),
    enabled: !!user && isSuperAdmin,
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

  const { data: privateCreateCtxData, isLoading: loadingPrivateCreateCtx } = useQuery({
    queryKey: ["investors-private-create-context"],
    queryFn: () =>
      apiClient.get<{ success: boolean; context: PrivateInvestorCreateContext }>(
        "/api/investors/private-create-context"
      ),
    enabled: !!user && user.role === "SUPER_ADMIN" && showModal,
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
  const createTopUpMutation = useMutation({
    mutationFn: () =>
      apiClient.post("/api/body-topup-requests", {
        investorId: Number(topUpForm.investorId),
        amount: parseAmountInput(topUpForm.amount),
        comment: topUpForm.comment.trim() || undefined,
      }),
    onSuccess: () => {
      setShowTopUpModal(false);
      setTopUpForm({ investorId: "", amount: "", comment: "" });
      queryClient.invalidateQueries({ queryKey: ["body-topup-requests"] });
      queryClient.invalidateQueries({ queryKey: ["reports-feed"] });
    },
  });
  const deleteInvestorMutation = useMutation({
    mutationFn: (investorId: number) => apiClient.delete(`/api/investors/${investorId}`),
    onSuccess: () => {
      setSelectedInvestorId(null);
      queryClient.invalidateQueries({ queryKey: ["investors"] });
      toast.success("Инвестор удалён");
    },
  });
  const resetCredentialsMutation = useMutation({
    mutationFn: (investorId: number) =>
      apiClient.patch<{ success: boolean; credentials: { username: string; password: string } }>(
        `/api/investors/${investorId}`,
        {}
      ),
    onSuccess: (result) => {
      setLatestCredentials(result.credentials);
      toast.success("Доступ обновлён");
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

  const stats = useMemo(() => {
    return investors.reduce(
      (acc, inv) => ({
        aum: acc.aum + (inv.body || 0),
        paid: acc.paid + (inv.paid || 0),
        due: acc.due + (inv.due || 0),
      }),
      { aum: 0, paid: 0, due: 0 }
    );
  }, [investors]);

  const currentWeek = getCurrentWeek();
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

  if (authLoading) return <div className="flex items-center justify-center min-h-screen"><Text>Загрузка...</Text></div>;
  if (!user) return null;

  const createDisabled = createMutation.isPending || !systemReady;
  return (
        <Container>
      <div className="min-h-screen py-4 pb-28 md:py-8 md:pb-28 space-y-4 md:space-y-5">
        <div className={DASHBOARD_STICKY_BAR_CLASS}>
          <button
            type="button"
            onClick={() => router.push("/dashboard/profile")}
            className="flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-muted/60 transition"
          >
            <UserAvatar name={user.username} src={user.avatarUrl} size={36} />
            <span className="truncate text-base font-semibold">{user.username}</span>
            <span className="text-muted-foreground" aria-hidden>
              ›
            </span>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <Button
              onClick={() => apiClient.post("/api/auth/logout", {}).then(() => (window.location.href = "/login"))}
              variant="outline"
              size="sm"
            >
              Выйти
            </Button>
            <NotificationBell />
            <button
              type="button"
              onClick={toggleDarkMode}
              aria-label="Переключить дневную и ночную тему"
              title="Светлая/тёмная тема"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-background/70 text-xl transition hover:bg-muted/60"
            >
              🇹🇭
            </button>
          </div>
        </div>

        <Card className="p-3 md:p-4">
          {isSuperAdmin && (
            <div className="mb-3">
              <CollapsibleSection
                title="Система"
                subtitle={systemReady ? "Готова к учёту" : "Требуется настройка"}
                defaultOpen={!systemReady}
              >
                <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "inline-block h-2.5 w-2.5 rounded-full",
                          systemReady ? "bg-emerald-500" : "bg-red-500"
                        )}
                      />
                      <Text className={cn("text-xs font-semibold", systemReady ? "text-emerald-600" : "text-red-600")}>
                        {systemReady ? "Система готова к учету" : "Система не готова к учету"}
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
                    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
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

          <Text className="text-xs font-semibold text-muted-foreground mb-2">Действия</Text>
          {!loadingReadiness && !systemReady && (
            <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5">
              <Text className="text-xs font-medium text-amber-700 dark:text-amber-300">
                Перед стартом учета нужно завершить базовую настройку системы.
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button onClick={() => setShowModal(true)} size="sm" className="w-full" disabled={createDisabled}>
              Создать инвестора
            </Button>
            {user.role === "OWNER" ? (
              <Button size="sm" variant="outline" className="w-full" onClick={() => setShowTopUpModal(true)}>
                Запросить пополнение тела
              </Button>
            ) : null}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <StatCard title="Баланс" value={stats.aum} color="text-foreground" compact />
            <StatCard title="К выплате" value={stats.due} color="text-orange-600" compact />
            <StatCard title="Выплачено" value={stats.paid} color="text-green-600" compact />
          </div>
          <div className="mt-2">
            <Text className="text-xs text-muted-foreground">
              Цикл: {currentWeek.start} - {currentWeek.end} | Выплата: {currentWeek.nextPayout}
            </Text>
          </div>
        </Card>

        {(user.role === "OWNER" || user.role === "SUPER_ADMIN") && (
          <Card className="space-y-3 p-3 md:p-4">
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
          </Card>
        )}

        <Card className="border border-border/60 bg-card/40 p-3 md:p-4">
          <Text className="text-sm text-muted-foreground">
            Одобрение заявок на вывод и принудительные решения по выплатам перенесены в раздел{" "}
            <button
              type="button"
              className="font-medium text-primary underline"
              onClick={() => router.push("/dashboard/reports")}
            >
              Отчёты
            </button>
            .
          </Text>
        </Card>

        {isSuperAdmin && (
          <div className="flex flex-wrap gap-2 pb-1">
            {(["common", "private", "all"] as const).map((f) => (
              <Button
                key={f}
                onClick={() => setNetworkFilter(f)}
                variant={networkFilter === f ? "primary" : "outline"}
                size="sm"
                className="capitalize rounded-full"
              >
                {f === "common" ? "Общая сеть" : f === "private" ? "Личная сеть" : "Все сети"}
              </Button>
            ))}
          </div>
        )}

        <Card className="p-3 md:p-4">
          <div className="flex items-center justify-between mb-2">
            <Text className="text-xs font-semibold text-muted-foreground">Список инвесторов</Text>
            <Text className="text-xs text-muted-foreground">
              {networkFilter === "common" ? "Общая сеть" : networkFilter === "private" ? "Личная сеть" : "Все сети"}
            </Text>
          </div>
          {loadingInvestors ? (
            <div className="py-12 text-center text-muted-foreground">Загрузка данных...</div>
          ) : (
            <InvestorsTable
              investors={investors}
              onOpenInvestor={(id) => {
                router.push(`/dashboard/manage/investors/${id}`);
              }}
              onResetCredentials={(investorId) => resetCredentialsMutation.mutate(investorId)}
              onDeleteInvestor={
                isSuperAdmin
                  ? (investorId) => {
                      void (async () => {
                        const ok = await confirm({
                          title: "Удалить инвестора?",
                          description: "Действие необратимо: учётная запись и связи будут удалены.",
                          confirmLabel: "Удалить",
                          cancelLabel: "Отмена",
                          tone: "danger",
                        });
                        if (ok) deleteInvestorMutation.mutate(investorId);
                      })();
                    }
                  : undefined
              }
              showNetwork={isSuperAdmin}
            />
          )}
        </Card>
        {latestCredentials ? (
          <Card className="p-3 md:p-4">
            <Text className="text-xs font-semibold text-muted-foreground mb-2">
              Доступ инвестора
            </Text>
            <div className="rounded-xl border border-border/60 bg-card/70 p-3 text-sm">
              <div>Логин: <span className="font-semibold">{latestCredentials.username}</span></div>
              <div className="mt-1">Пароль: <span className="font-semibold">{latestCredentials.password}</span></div>
            </div>
          </Card>
        ) : null}

        {selectedInvestor && (
          <Card className="p-0 overflow-hidden">
            <div className="p-3 md:p-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-sm md:text-base font-semibold">Недельный расчет: {selectedInvestor.name}</h3>
                <Text className="text-xs">{ledgerData?.note ?? "Расчет по закрытым неделям"}</Text>
              </div>
              <Button size="sm" variant="outline" onClick={() => setSelectedInvestorId(null)}>
                Скрыть
              </Button>
            </div>

            {loadingLedger ? (
              <div className="p-6 text-sm text-muted-foreground">Считаем недели...</div>
            ) : !ledgerData ? (
              <div className="p-6 text-sm text-muted-foreground">Нет данных для расчета.</div>
            ) : (
              <>
                <div className="p-3 md:p-4 grid grid-cols-1 md:grid-cols-3 gap-2 border-b border-border bg-muted/20">
                  <Text>Недель: <span className="font-semibold text-foreground">{ledgerData.summary.weeks}</span></Text>
                  <Text>Начислено: <span className="font-semibold text-blue-600">{formatCurrency(ledgerData.summary.totalAccruedAdded)}</span></Text>
                  <Text>Выплачено %: <span className="font-semibold text-green-600">{formatCurrency(ledgerData.summary.totalInterestPaid)}</span></Text>
                </div>
                <div className="overflow-x-auto md:overflow-x-visible">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/40 border-b border-border">
                        <th className="text-left px-3 py-2">Неделя</th>
                        <th className="text-right px-3 py-2">Тело</th>
                        <th className="text-right px-3 py-2">Ставка/нед</th>
                        <th className="text-right px-3 py-2">Начислено</th>
                        <th className="text-right px-3 py-2">Выплата %</th>
                        <th className="text-right px-3 py-2">Остаток %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerData.rows.map((row) => (
                        <tr key={row.weekStart} className="border-b border-border/60">
                          <td className="px-3 py-2">
                            {new Date(row.weekStart).toLocaleDateString("ru-RU")} -{" "}
                            {new Date(row.weekEnd).toLocaleDateString("ru-RU")}
                          </td>
                          <td className="px-3 py-2 text-right">{formatCurrency(row.bodyStart)}</td>
                          <td className="px-3 py-2 text-right">{row.weeklyRatePercent.toFixed(2)}%</td>
                          <td className="px-3 py-2 text-right text-blue-600">{formatCurrency(row.accruedAdded)}</td>
                          <td className="px-3 py-2 text-right text-green-600">{formatCurrency(row.interestPaid)}</td>
                          <td className="px-3 py-2 text-right text-orange-600">{formatCurrency(row.accruedEnd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>
        )}

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
              ? "Система не готова к старту учета. Завершите базовую настройку."
              : createMutation.error instanceof Error
                ? createMutation.error.message
                : undefined
          }
        />

        {showTopUpModal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
            <Card className="w-full max-w-md p-5 space-y-4">
              <Text className="text-base font-semibold">Запрос на пополнение тела</Text>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  createTopUpMutation.mutate();
                }}
              >
                <div className="space-y-1">
                  <Label>Инвестор *</Label>
                  <select
                    className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                    value={topUpForm.investorId}
                    onChange={(e) => setTopUpForm((prev) => ({ ...prev, investorId: e.target.value }))}
                    required
                  >
                    <option value="">Выбери инвестора</option>
                    {investors.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.name} ({formatCurrency(inv.body)})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Сумма пополнения *</Label>
                  <Input
                    type="text"
                    required
                    value={topUpForm.amount}
                    onChange={(e) => setTopUpForm((prev) => ({ ...prev, amount: formatAmountInput(e.target.value) }))}
                    placeholder="100 000 ฿"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Комментарий</Label>
                  <Textarea
                    rows={3}
                    value={topUpForm.comment}
                    onChange={(e) => setTopUpForm((prev) => ({ ...prev, comment: e.target.value }))}
                    placeholder="Комментарий (необязательно)"
                  />
                </div>
                {createTopUpMutation.error instanceof Error ? (
                  <Text className="text-xs text-red-500">{createTopUpMutation.error.message}</Text>
                ) : null}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setShowTopUpModal(false)}>
                    Отмена
                  </Button>
                  <Button type="submit" className="flex-1" disabled={createTopUpMutation.isPending}>
                    {createTopUpMutation.isPending ? "Отправка..." : "Отправить"}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        ) : null}
        <MobileBottomNav active="finance" />
      </div>
    </Container>
  );
}

function StatCard({
  title,
  value,
  color,
  compact = false,
}: {
  title: string;
  value: number;
  color: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("rounded-xl border border-border/60 bg-card/70", compact ? "p-3" : "p-4 md:p-5")}>
      <Text className="text-xs text-muted-foreground mb-1 whitespace-nowrap">{title}</Text>
      <div className={cn(compact ? "text-base md:text-2xl" : "text-xl md:text-3xl", "font-semibold tracking-tight whitespace-nowrap", color)}>
        {formatCurrency(value)}
      </div>
    </div>
  );
}

