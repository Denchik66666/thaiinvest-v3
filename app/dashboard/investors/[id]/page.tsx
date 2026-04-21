"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";
import { DatePicker } from "@/components/ui/DatePicker";
import { InvestorCard } from "@/components/investors/InvestorCard";
import MobileBottomNav from "@/components/navigation/MobileBottomNav";
import { apiClient } from "@/lib/api-client";
import { formatCurrency, cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
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
  summary: {
    weeks: number;
    totalAccruedAdded: number;
    totalInterestPaid: number;
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
  requestDate: string;
  comment: string;
};

export default function InvestorDetailPage() {
  const { user } = useAuth();
  const { confirm } = useAppDialogs();
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const investorId = params.id as string;

  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null);
  const [form, setForm] = useState<PaymentForm>({
    type: "interest",
    amount: "",
    requestDate: new Date().toISOString().split("T")[0],
    comment: "",
  });

  const { data: investorData, isLoading, error } = useQuery({
    queryKey: ["investor", investorId],
    queryFn: async () => {
      const response: any = await apiClient.get(`/api/investors/${investorId}`);
      if (!response.success) throw new Error(response.error || "Ошибка загрузки инвестора");
      return response as InvestorDetailResponse;
    },
  });

  const { data: ledgerData } = useQuery({
    queryKey: ["investor-ledger", investorId],
    queryFn: async () => {
      const response: any = await apiClient.get(`/api/investors/${investorId}/weekly-ledger`);
      if (!response.success) throw new Error(response.error || "Ошибка загрузки реестра");
      return response as LedgerResponse;
    },
  });

  const summary = useMemo(() => ledgerData?.summary, [ledgerData]);
  const rows = useMemo(() => ledgerData?.rows || [], [ledgerData]);
  const investor = useMemo(() => investorData?.investor, [investorData]);

  const availableInterest = useMemo(() => {
    if (!summary || !investor) return 0;
    return summary.totalAccruedAdded - summary.totalInterestPaid - (investor.paid || 0);
  }, [summary, investor]);

  const availableBody = useMemo(() => {
    if (!investor) return 0;
    return investor.body - (investor.paid || 0);
  }, [investor]);

  // Admin mutations
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
      toast.success("Инвестор удалён");
      router.push("/dashboard/investors");
    },
  });

  const requestWithdrawMutation = useMutation({
    mutationFn: (data: PaymentForm) =>
      apiClient.post(`/api/investors/${investorId}/request-withdraw`, data),
    onSuccess: () => {
      toast.success("Заявка на вывод отправлена");
      setForm({ type: "interest", amount: "", requestDate: new Date().toISOString().split("T")[0], comment: "" });
      queryClient.invalidateQueries({ queryKey: ["investor", investorId] });
      queryClient.invalidateQueries({ queryKey: ["investor-ledger", investorId] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const isAdmin = user?.role === "OWNER" || user?.role === "SUPER_ADMIN";

  if (isLoading) {
    return (
      <Container>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
            <Text>Загрузка инвестора...</Text>
          </div>
        </div>
      </Container>
    );
  }

  if (error instanceof Error || !investorData?.success || !investor) {
    return (
      <Container>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="mb-4 text-6xl">⚠️</div>
            <Text className="text-red-500 mb-2">Ошибка загрузки инвестора</Text>
            <Button 
              variant="outline" 
              onClick={() => router.push("/dashboard/investors")}
            >
              ← Назад к списку
            </Button>
          </div>
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <MobileBottomNav />
      
      <div className="space-y-6 mb-20">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            onClick={() => router.push("/dashboard/investors")}
          >
            ← Назад
          </Button>
          <div>
            <Text className="text-2xl font-bold text-foreground">{investor.name}</Text>
            <Text className="text-sm text-muted-foreground">Детальная информация</Text>
          </div>
        </div>

        {/* Unified Investor Card */}
        <InvestorCard 
          investor={investor} 
          variant={isAdmin ? "manage" : "view"}
        />

        {/* Admin Actions - только для админов */}
        {isAdmin && (
          <Card className="p-6 border-border/60 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950/20 dark:to-red-900/10">
            <div className="flex items-center justify-between mb-4">
              <Text className="text-sm font-semibold text-foreground">🔧 Административные действия</Text>
            </div>
            
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <Button 
                  onClick={() => resetMutation.mutate()} 
                  disabled={resetMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {resetMutation.isPending
                    ? "Сброс..."
                    : investor.investorUser
                      ? "🔄 Сбросить доступ"
                      : "👤 Выдать доступ"}
                </Button>
                <Button
                  variant="outline"
                  className="border-red-500/40 text-red-400 hover:bg-red-500/10"
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
                  🗑️ Удалить инвестора
                </Button>
              </div>
              
              {credentials ? (
                <div className="mt-4 rounded-xl border border-border/60 bg-card/70 p-4">
                  <Text className="text-sm font-semibold mb-3 text-green-600">✅ Доступ создан</Text>
                  <div className="space-y-2 text-sm">
                    <div>🔑 Логин: <span className="font-mono font-semibold">{credentials.username}</span></div>
                    <div>🔒 Пароль: <span className="font-mono font-semibold">{credentials.password}</span></div>
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-xs text-muted-foreground">
                  👤 Текущий пользователь: <span className="font-semibold">{investor.investorUser?.username ?? "нет"}</span>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Weekly Calculation - для всех */}
        {ledgerData && (
          <Card className="p-6 border-border/60 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/20 dark:to-blue-900/10">
            <Text className="text-sm font-semibold text-foreground mb-4">📊 Недельный расчет</Text>
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="text-center p-3 rounded-lg bg-background/60">
                  <Text className="text-xs text-muted-foreground mb-1">Недель</Text>
                  <Text className="text-xl font-bold text-foreground">{ledgerData.summary.weeks}</Text>
                </div>
                <div className="text-center p-3 rounded-lg bg-background/60">
                  <Text className="text-xs text-muted-foreground mb-1">Начислено</Text>
                  <Text className="text-xl font-bold text-blue-600">{formatCurrency(ledgerData.summary.totalAccruedAdded)}</Text>
                </div>
                <div className="text-center p-3 rounded-lg bg-background/60">
                  <Text className="text-xs text-muted-foreground mb-1">Выплачено %</Text>
                  <Text className="text-xl font-bold text-green-600">{formatCurrency(ledgerData.summary.totalInterestPaid)}</Text>
                </div>
              </div>
              
              <div className="space-y-2">
                <Text className="text-sm font-medium text-muted-foreground">Последние недели:</Text>
                {rows.slice(0, 4).map((row) => (
                  <div key={row.weekStart} className="rounded-lg border border-border/40 bg-card/70 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span>
                        {new Date(row.weekStart).toLocaleDateString("ru-RU")} - {new Date(row.weekEnd).toLocaleDateString("ru-RU")}
                      </span>
                      <span className="font-semibold text-blue-600">+{formatCurrency(row.weeklyInterest)}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                      <span>Ставка: {row.rate.toFixed(2)}%</span>
                      <span>Тело: {formatCurrency(row.body)}</span>
                      <span>Остаток: {formatCurrency(row.balance)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* Withdraw Request Section - только для инвесторов */}
        {!isAdmin && (
          <Card className="p-6 border-border/60 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/20 dark:to-green-900/10">
            <div className="flex items-center justify-between mb-4">
              <Text className="text-sm font-semibold text-foreground">💸 Создать заявку на вывод</Text>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={form.type === "interest" ? "primary" : "outline"}
                  onClick={() => setForm((p) => ({ ...p, type: "interest" }))}
                >
                  📈 Проценты
                </Button>
                <Button
                  size="sm"
                  variant={form.type === "close" ? "primary" : "outline"}
                  onClick={() => setForm((p) => ({ ...p, type: "close" }))}
                >
                  🔒 Закрытие
                </Button>
              </div>
            </div>
              
            <div className="space-y-4">
              <div>
                <Label>💰 Сумма (฿)</Label>
                <Input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                  placeholder="1000"
                  className="text-lg"
                />
              </div>
              
              {form.type === "interest" ? (
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-3">
                  <Text className="text-sm text-blue-700 dark:text-blue-300">
                    💡 Максимум по процентам: {formatCurrency(availableInterest)}
                  </Text>
                </div>
              ) : (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 p-3">
                  <Text className="text-sm text-amber-700 dark:text-amber-300">
                    💡 Полное закрытие сформирует заявку на сумму: {formatCurrency(investor.body + investor.accrued)}
                  </Text>
                </div>
              )}

              <div className="space-y-2">
                <Label>📅 Дата вывода *</Label>
                <DatePicker 
                  value={form.requestDate} 
                  onChange={(v) => setForm((p) => ({ ...p, requestDate: v }))} 
                />
              </div>
              <div className="space-y-2">
                <Label>📝 Комментарий</Label>
                <Input
                  value={form.comment}
                  onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))}
                  placeholder="Комментарий (необязательно)"
                />
              </div>
              {requestWithdrawMutation.error instanceof Error ? (
                <div className="rounded-lg bg-red-50 dark:bg-red-950/20 p-3">
                  <Text className="text-sm text-red-600">{requestWithdrawMutation.error.message}</Text>
                </div>
              ) : null}
              <Button 
                type="submit" 
                className="h-12 w-full text-base font-semibold bg-green-600 hover:bg-green-700" 
                disabled={requestWithdrawMutation.isPending}
                onClick={() => requestWithdrawMutation.mutate(form)}
              >
                {requestWithdrawMutation.isPending ? "📤 Отправка..." : "📤 Отправить заявку"}
              </Button>
            </div>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex gap-3">
          <Button 
            variant="outline" 
            onClick={() => router.push("/dashboard/investors")}
          >
            ← Назад к инвесторам
          </Button>
          <Button 
            onClick={() => router.push(`/dashboard/reports?investor=${investor.id}`)}
          >
            📊 Детальные отчёты
          </Button>
        </div>
      </div>
    </Container>
  );
}