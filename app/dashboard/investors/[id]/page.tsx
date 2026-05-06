"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";

import { Container } from "@/components/ui/Container";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";
import { InvestorCard } from "@/components/investors/InvestorCard";
import MobileBottomNav from "@/components/navigation/MobileBottomNav";
import NotificationBell from "@/components/notifications/NotificationBell";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { DASHBOARD_STICKY_BAR_CLASS } from "@/lib/dashboard-sticky-bar";
import { useAppDialogs } from "@/components/feedback/AppDialogsProvider";
import { toast } from "@/lib/notify";

type InvestorDetailResponse = {
  success: boolean;
  investor: {
    id: number;
    name: string;
    owner: { id: number; username: string; role: string };
    investorUser?: { id: number; username: string } | null;
    linkedUserId?: number | null;
    investorUserId?: number | null;
    body: number;
    rate: number;
    accrued: number;
    paid: number;
    due: number;
    status: string;
    isPrivate: boolean;
    entryDate?: string;
    activationDate?: string;
    payments: Array<{
      id: number;
      type: "interest" | "body" | "close";
      amount: number;
      status: string;
      comment?: string | null;
      createdAt: string;
      approvedAt?: string | null;
      acceptedAt?: string | null;
    }>;
  };
  topUpRequests: Array<{
    id: number;
    amount: number;
    status: string;
    comment?: string | null;
    createdAt: string;
  }>;
};

type LedgerResponse = {
  note?: string;
  summary: {
    weeks: number;
    totalAccruedAdded: number;
    totalInterestPaid: number;
    totalBodyPaid?: number;
  };
  rows: Array<{
    weekStart: string;
    weekEnd: string;
    body: number;
    rate: number;
    weeklyInterest: number;
    accruedChange: number;
    interestPaid: number;
    bodyPaid: number;
    closePaid: number;
    balance: number;
  }>;
};

type PaymentForm = {
  type: "interest" | "body" | "close";
  amount: string;
  comment: string;
};

export default function InvestorDetailPage() {
  const { user, loading: authLoading } = useAuth();
  const { confirm } = useAppDialogs();
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const investorId = params.id as string;

  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null);
  const [form, setForm] = useState<PaymentForm>({
    type: "interest",
    amount: "",
    comment: "",
  });

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  const { data: investorData, isLoading, error } = useQuery({
    queryKey: ["investor", investorId],
    queryFn: async () => {
      const response: unknown = await apiClient.get(`/api/investors/${investorId}`);
      const r = response as { success?: boolean; error?: string };
      if (!r.success) throw new Error(r.error || "Ошибка загрузки инвестора");
      return response as InvestorDetailResponse;
    },
    enabled: !!user && !!investorId,
  });

  const { data: ledgerData } = useQuery({
    queryKey: ["investor-ledger", investorId],
    queryFn: async () => {
      const response: unknown = await apiClient.get(`/api/investors/${investorId}/weekly-ledger`);
      const r = response as { success?: boolean; error?: string };
      if (!r.success) throw new Error(r.error || "Ошибка загрузки реестра");
      return response as LedgerResponse;
    },
    enabled: !!user && !!investorId,
  });

  const summary = useMemo(() => ledgerData?.summary, [ledgerData]);
  const rows = useMemo(() => ledgerData?.rows || [], [ledgerData]);
  const investor = useMemo(() => investorData?.investor, [investorData]);

  const availableInterest = useMemo(() => {
    if (!summary || !investor) return 0;
    return summary.totalAccruedAdded - summary.totalInterestPaid - (investor.paid || 0);
  }, [summary, investor]);

  const resetMutation = useMutation({
    mutationFn: () =>
      apiClient.patch<{ success: boolean; credentials: { username: string; password: string } }>(
        `/api/investors/${investorId}`,
        {}
      ),
    onSuccess: (res) => {
      setCredentials(res.credentials);
      queryClient.invalidateQueries({ queryKey: ["investor", investorId] });
      toast.success("Доступ обновлён");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.delete(`/api/investors/${investorId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investors"] });
      queryClient.invalidateQueries({ queryKey: ["investors", "operations-history"] });
      toast.success("Инвестор удалён");
      router.push("/dashboard/investors");
    },
  });

  const requestWithdrawMutation = useMutation({
    mutationFn: (data: PaymentForm) =>
      apiClient.post("/api/payments", {
        action: "request",
        investorId: Number(investorId),
        type: data.type,
        amount: data.type === "close" ? undefined : Number(String(data.amount).replace(/\s/g, "").replace(",", ".")),
        comment: data.comment.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success("Заявка на вывод отправлена");
      setForm({ type: "interest", amount: "", comment: "" });
      queryClient.invalidateQueries({ queryKey: ["investor", investorId] });
      queryClient.invalidateQueries({ queryKey: ["investor-ledger", investorId] });
      queryClient.invalidateQueries({ queryKey: ["investors", "operations-history"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const isAdmin = user?.role === "OWNER" || user?.role === "SUPER_ADMIN";

  if (authLoading) {
    return (
      <Container>
        <div className="thai-dashboard-root min-h-screen space-y-4 py-4 pb-28">
          <div className="h-11 rounded-xl bg-muted/40 animate-pulse" />
          <div className="thai-glass h-56 rounded-2xl animate-pulse bg-muted/20" />
          <div className="thai-glass h-40 rounded-2xl animate-pulse bg-muted/20" />
        </div>
      </Container>
    );
  }

  if (!user) return null;

  if (isLoading) {
    return (
      <Container>
        <div className="thai-dashboard-root flex min-h-screen items-center justify-center py-16">
          <div className="thai-glass flex flex-col items-center gap-3 rounded-2xl px-8 py-6">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <Text className="text-foreground">Загрузка инвестора…</Text>
          </div>
        </div>
      </Container>
    );
  }

  if (error instanceof Error || !investorData?.success || !investor) {
    return (
      <Container>
        <div className="thai-dashboard-root flex min-h-screen items-center justify-center py-16">
          <div className="thai-panel-admin max-w-md text-center">
            <Text className="mb-3 text-base font-medium text-foreground">Ошибка загрузки инвестора</Text>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Обновить страницу
            </Button>
          </div>
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <div className="thai-dashboard-root min-h-screen space-y-3 py-3 pb-24 md:space-y-5 md:py-8 md:pb-28">
        <div className={DASHBOARD_STICKY_BAR_CLASS}>
          <button
            type="button"
            onClick={() => router.back()}
            className="thai-glass flex min-w-0 items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm font-medium transition hover:brightness-[1.03] dark:hover:brightness-110"
          >
            <ChevronLeft className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
            <span className="truncate">Назад</span>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />
          </div>
        </div>

        <InvestorCard investor={investor} variant={isAdmin ? "manage" : "view"} />

        {isAdmin ? (
          <div className="thai-panel-muted grid grid-cols-1 gap-1.5 sm:grid-cols-3 md:gap-2">
            <button
              type="button"
              onClick={() => router.push("/dashboard/investors")}
              className="thai-row-interactive thai-glass rounded-xl border border-border/40 p-2.5 text-left md:p-3"
            >
              <Text className="text-sm font-semibold text-foreground">Список инвесторов</Text>
              <Text className="mt-1 text-xs text-muted-foreground">Вернуться к поиску и фильтрам</Text>
            </button>
            <button
              type="button"
              onClick={() => router.push("/dashboard/manage")}
              className="thai-row-interactive thai-glass rounded-xl border border-border/40 p-2.5 text-left md:p-3"
            >
              <Text className="text-sm font-semibold text-foreground">Управление</Text>
              <Text className="mt-1 text-xs text-muted-foreground">Создание инвесторов и настройка системы</Text>
            </button>
            <button
              type="button"
              onClick={() => router.push(`/dashboard/finance?investor=${investor.id}`)}
              className="thai-row-interactive thai-glass rounded-xl border border-border/40 p-2.5 text-left md:p-3"
            >
              <Text className="text-sm font-semibold text-foreground">Финансы по инвестору</Text>
              <Text className="mt-1 text-xs text-muted-foreground">Очереди, история выплат и аудит</Text>
            </button>
          </div>
        ) : null}

        {isAdmin ? (
          <div className="thai-panel-admin space-y-3 md:space-y-4">
            <Text className="text-sm font-semibold text-foreground">Административные действия</Text>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
                className="transition-transform duration-200 active:scale-[0.98]"
              >
                {resetMutation.isPending ? "Сброс…" : investor.investorUser ? "Сбросить доступ" : "Выдать доступ"}
              </Button>
              <Button
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => {
                  void (async () => {
                    const ok = await confirm({
                      title: "Удалить инвестора?",
                      description: "Действие необратимо.",
                      confirmLabel: "Удалить",
                      cancelLabel: "Отмена",
                      tone: "danger",
                    });
                    if (ok) deleteMutation.mutate();
                  })();
                }}
                disabled={deleteMutation.isPending}
              >
                Удалить инвестора
              </Button>
            </div>

            {credentials ? (
              <div className="thai-glass rounded-xl border border-border/60 p-2.5 text-sm md:p-3">
                <Text className="mb-2 text-xs font-semibold text-muted-foreground">Доступ создан</Text>
                <div className="space-y-1 font-mono text-foreground">
                  <div>
                    Логин: <span className="font-semibold">{credentials.username}</span>
                  </div>
                  <div>
                    Пароль: <span className="font-semibold">{credentials.password}</span>
                  </div>
                </div>
              </div>
            ) : (
              <Text className="text-xs text-muted-foreground">
                Текущий пользователь:{" "}
                <span className="font-medium text-foreground">{investor.investorUser?.username ?? "нет"}</span>
              </Text>
            )}
          </div>
        ) : null}

        {ledgerData ? (
          <div className="thai-panel-muted space-y-3 md:space-y-4">
            <Text className="text-base font-semibold text-foreground">История и расчёт</Text>
            <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4 md:gap-3">
              <div className="thai-stat-tile thai-glass border border-border/35 text-center">
                <Text className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Недель
                </Text>
                <Text className="text-xl font-bold tabular-nums text-foreground">{ledgerData.summary.weeks}</Text>
              </div>
              <div className="thai-stat-tile thai-glass border border-border/35 text-center">
                <Text className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Сумма недель
                </Text>
                <Text className="text-xl font-bold tabular-nums" style={{ color: "#60a5fa" }}>
                  ฿{ledgerData.summary.totalAccruedAdded.toLocaleString("ru-RU")}
                </Text>
                <Text className="mt-1 block text-[10px] leading-tight text-muted-foreground/90">
                  Начисления по закрытым неделям в модели реестра
                </Text>
              </div>
              <div className="thai-stat-tile thai-glass border border-border/35 text-center">
                <Text className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Выплачено %
                </Text>
                <Text className="text-xl font-bold tabular-nums" style={{ color: "#4ade80" }}>
                  ฿{ledgerData.summary.totalInterestPaid.toLocaleString("ru-RU")}
                </Text>
                <Text className="mt-1 block text-[10px] leading-tight text-muted-foreground/90">
                  Проценты по строкам реестра
                </Text>
              </div>
              <div className="thai-stat-tile thai-glass border border-border/35 text-center">
                <Text className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Остаток в реестре
                </Text>
                <Text className="text-xl font-bold tabular-nums" style={{ color: "#fbbf24" }}>
                  ฿
                  {(ledgerData.summary.totalAccruedAdded - ledgerData.summary.totalInterestPaid).toLocaleString("ru-RU")}
                </Text>
                <Text className="mt-1 block text-[10px] leading-tight text-muted-foreground/90">
                  Сумма недель минус выплаты %
                </Text>
              </div>
            </div>

            {ledgerData.note ? (
              <Text className="text-[11px] leading-snug text-muted-foreground">{ledgerData.note}</Text>
            ) : null}

            <Text className="text-xs font-medium text-muted-foreground">Последние недели</Text>
            <div className="space-y-1.5 md:space-y-2">
              {rows.slice(0, 6).map((row, index) => (
                <div
                  key={row.weekStart}
                  className={cn(
                    "thai-row-interactive flex gap-2.5 rounded-xl border border-border/40 bg-card/30 p-2.5 md:gap-3 md:p-3",
                    index > 0 && "mt-1"
                  )}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary md:h-10 md:w-10">
                    {new Date(row.weekStart).getDate()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Text className="text-sm font-medium text-foreground">
                        {new Date(row.weekStart).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} —{" "}
                        {new Date(row.weekEnd).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                      </Text>
                      <Text className="text-sm font-semibold tabular-nums" style={{ color: "#60a5fa" }}>
                        +฿{row.weeklyInterest.toLocaleString("ru-RU")}
                      </Text>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>Ставка: {row.rate.toFixed(2)}%</span>
                      <span>
                        Тело:{" "}
                        <span style={{ color: "#ffffff" }}>฿{row.body.toLocaleString("ru-RU")}</span>
                      </span>
                      <span>
                        Остаток:{" "}
                        <span style={{ color: "#fbbf24" }}>฿{row.balance.toLocaleString("ru-RU")}</span>
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {!isAdmin ? (
          <div className="thai-glass space-y-3 rounded-2xl border border-primary/20 p-3 md:space-y-4 md:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Text className="text-base font-semibold text-foreground">Заявка на вывод</Text>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={form.type === "interest" ? "primary" : "outline"}
                  onClick={() => setForm((p) => ({ ...p, type: "interest" }))}
                >
                  Проценты
                </Button>
                <Button
                  size="sm"
                  variant={form.type === "close" ? "primary" : "outline"}
                  onClick={() => setForm((p) => ({ ...p, type: "close" }))}
                >
                  Закрытие
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Сумма (฿)</Label>
              <Input
                type="number"
                value={form.amount}
                onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                placeholder="1000"
              />
            </div>

            {form.type === "interest" ? (
              <Text className="text-xs text-muted-foreground">
                Максимум по процентам:{" "}
                <span style={{ color: "#fbbf24" }}>฿{availableInterest.toLocaleString("ru-RU")}</span>
              </Text>
            ) : (
              <Text className="text-xs text-muted-foreground">
                Полное закрытие:{" "}
                <span style={{ color: "#ffffff" }}>฿{investor.body.toLocaleString("ru-RU")}</span>
                {" + "}
                <span style={{ color: "#60a5fa" }}>฿{investor.accrued.toLocaleString("ru-RU")}</span>
                {" = "}
                <span style={{ color: "#ffffff" }}>
                  ฿{(investor.body + investor.accrued).toLocaleString("ru-RU")}
                </span>
              </Text>
            )}

            <div className="space-y-2">
              <Label>Комментарий</Label>
              <Input
                value={form.comment}
                onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))}
                placeholder="Необязательно"
              />
            </div>
            {requestWithdrawMutation.error instanceof Error ? (
              <Text className="text-sm text-destructive">{requestWithdrawMutation.error.message}</Text>
            ) : null}
            <Button
              className="w-full transition-transform duration-200 active:scale-[0.99]"
              disabled={requestWithdrawMutation.isPending}
              onClick={() => requestWithdrawMutation.mutate(form)}
            >
              {requestWithdrawMutation.isPending ? "Отправка…" : "Отправить заявку"}
            </Button>
          </div>
        ) : null}

        <MobileBottomNav active={isAdmin ? "manage" : "home"} />
      </div>
    </Container>
  );
}
