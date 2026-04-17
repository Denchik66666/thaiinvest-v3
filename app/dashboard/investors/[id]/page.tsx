"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";
import { DatePicker } from "@/components/ui/DatePicker";
import MobileBottomNav from "@/components/navigation/MobileBottomNav";
import { apiClient } from "@/lib/api-client";
import { cn, formatCurrency } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
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
    status: string;
    isPrivate: boolean;
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
  actions: Array<{
    id: number;
    action: string;
    createdAt: string;
    user: { username: string; role: string };
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
    weeklyRatePercent: number;
    accruedAdded: number;
  }>;
};

export default function InvestorCardPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const investorId = Number(params.id);

  const [form, setForm] = useState({
    type: "interest" as "interest" | "body" | "close",
    amount: "",
    comment: "",
    requestDate: new Date().toISOString().split("T")[0],
  });

  const parseAmountInput = (value: string) => Number(value.replace(/[^\d]/g, ""));
  const formatAmountInput = (value: string) => {
    const amount = parseAmountInput(value);
    if (!amount) return "";
    return `${amount.toLocaleString("ru-RU")} ฿`;
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["investor-detail", investorId],
    queryFn: () => apiClient.get<InvestorDetailResponse>(`/api/investors/${investorId}`),
    enabled: Number.isFinite(investorId),
    refetchInterval: 15_000,
  });

  const { data: ledgerData } = useQuery({
    queryKey: ["weekly-ledger-single", investorId],
    queryFn: () => apiClient.get<LedgerResponse>(`/api/investors/${investorId}/weekly-ledger`),
    enabled: Number.isFinite(investorId),
  });

  const requestWithdrawMutation = useMutation({
    mutationFn: () =>
      apiClient.post("/api/payments", {
        action: "request",
        investorId,
        type: form.type,
        amount: form.type === "close" ? undefined : parseAmountInput(form.amount),
        comment: form.comment.trim() || undefined,
        requestDate: form.requestDate,
      }),
    onSuccess: () => {
      toast.success("Запрос на вывод отправлен");
      setForm((p) => ({ ...p, amount: "", comment: "" }));
      queryClient.invalidateQueries({ queryKey: ["investor-detail", investorId] });
      queryClient.invalidateQueries({ queryKey: ["investors"] });
      queryClient.invalidateQueries({ queryKey: ["reports-investors"] });
    },
  });

  const paymentDecisionMutation = useMutation({
    mutationFn: ({ paymentId, action }: { paymentId: number; action: "investor_accept" | "investor_dispute" }) =>
      apiClient.post("/api/payments", { action, paymentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investor-detail", investorId] });
      queryClient.invalidateQueries({ queryKey: ["investors"] });
      queryClient.invalidateQueries({ queryKey: ["reports-investors"] });
      toast.success("Статус заявки обновлен");
    },
  });

  const investor = data?.investor;
  const topUpRequests = data?.topUpRequests ?? [];
  const actions = data?.actions ?? [];
  const payments = useMemo(() => investor?.payments ?? [], [investor?.payments]);
  const paidCompleted = useMemo(
    () => payments.filter((p) => p.status === "completed").reduce((sum, p) => sum + p.amount, 0),
    [payments]
  );
  const pendingInterest = useMemo(
    () => payments.filter((p) => p.type === "interest" && ["requested", "approved_waiting_accept"].includes(p.status)).reduce((sum, p) => sum + p.amount, 0),
    [payments]
  );
  const pendingBody = useMemo(
    () => payments.filter((p) => p.type === "body" && ["requested", "approved_waiting_accept"].includes(p.status)).reduce((sum, p) => sum + p.amount, 0),
    [payments]
  );

  const availableInterest = Math.max((investor?.accrued ?? 0) - pendingInterest, 0);
  const availableBody = Math.max((investor?.body ?? 0) - pendingBody, 0);
  const pendingPaymentsCount = payments.filter((p) => ["requested", "approved_waiting_accept"].includes(p.status)).length;
  const pendingTopUpsCount = topUpRequests.filter((r) => String(r.status).includes("pending")).length;
  const recentActionsCount = actions.length;
  const canActAsInvestor = !!(user && investor && (
    investor.investorUserId === user.id ||
    (!investor.isPrivate && investor.linkedUserId === user.id) ||
    (investor.isPrivate && investor.owner.id === user.id)
  ));

  return (
    <Container>
      <div className="min-h-screen space-y-4 py-4 pb-28 md:space-y-5 md:py-8 md:pb-28">
        <Card className="p-3 md:p-4 flex items-center justify-between">
          <div className="min-w-0">
            <Text className="text-sm text-muted-foreground">Карточка инвестора</Text>
            <Text className="font-semibold text-base md:text-lg break-words">{investor?.name ?? "..."}</Text>
          </div>
          <Button variant="outline" onClick={() => router.push("/dashboard")}>Назад</Button>
        </Card>

        {isLoading ? <Card className="p-4">Загрузка...</Card> : null}
        {error instanceof Error ? <Card className="p-4 text-red-400">{error.message}</Card> : null}

        {investor ? (
          <>
            <Card className="overflow-hidden border-border/70 p-0">
              <div className="bg-gradient-to-r from-primary/15 via-primary/5 to-transparent p-3 md:p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={pendingPaymentsCount > 0 ? "warn" : "ok"}>
                    Выплаты в ожидании: {pendingPaymentsCount}
                  </StatusPill>
                  <StatusPill tone={pendingTopUpsCount > 0 ? "warn" : "ok"}>
                    Пополнения в ожидании: {pendingTopUpsCount}
                  </StatusPill>
                  <StatusPill tone={recentActionsCount > 0 ? "neutral" : "ok"}>
                    Действий в журнале: {recentActionsCount}
                  </StatusPill>
                </div>
              </div>
              <div className="p-3 md:p-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                <Info title="Тело" value={formatCurrency(investor.body)} />
                <Info title="Ставка" value={`${investor.rate}%`} />
                <Info title="Начислено" value={formatCurrency(investor.accrued)} />
                <Info title="Выплачено" value={formatCurrency(paidCompleted)} />
                <Info title="Статус" value={investor.status} />
              </div>
              </div>
            </Card>

            <Card className="p-3 md:p-4 space-y-3 border-border/70">
              <Text className="text-xs font-semibold text-muted-foreground">Подробный вывод средств</Text>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded-xl border border-blue-500/25 bg-blue-500/5 p-3 text-sm text-muted-foreground">
                  <div>Доступно к выводу процентов: <span className="font-semibold text-blue-600">{formatCurrency(availableInterest)}</span></div>
                  <div className="mt-1 text-xs">Учитываются уже созданные заявки на проценты.</div>
                </div>
                <div className="rounded-xl border border-orange-500/25 bg-orange-500/5 p-3 text-sm text-muted-foreground">
                  <div>Доступно к выводу тела: <span className="font-semibold text-orange-600">{formatCurrency(availableBody)}</span></div>
                  <div className="mt-1 text-xs">Учитываются заявки на частичный вывод тела.</div>
                </div>
              </div>

              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  requestWithdrawMutation.mutate();
                }}
              >
                <div className="space-y-1">
                  <Label>Тип вывода *</Label>
                  <select
                    className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-primary"
                    value={form.type}
                    onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as "interest" | "body" | "close" }))}
                  >
                    <option value="interest">Проценты</option>
                    <option value="body">Тело</option>
                    <option value="close">Полное закрытие</option>
                  </select>
                </div>

                {form.type !== "close" ? (
                  <div className="space-y-1">
                    <Label>Сумма *</Label>
                    <Input
                      required
                      type="text"
                      value={form.amount}
                      onChange={(e) => setForm((p) => ({ ...p, amount: formatAmountInput(e.target.value) }))}
                      placeholder="2 500 ฿"
                    />
                    <Text className="text-xs text-muted-foreground">
                      {form.type === "interest"
                        ? `Максимум по процентам: ${formatCurrency(availableInterest)}`
                        : `Максимум по телу: ${formatCurrency(availableBody)}`}
                    </Text>
                  </div>
                ) : (
                  <Text className="text-xs text-muted-foreground">
                    Полное закрытие сформирует заявку на сумму: {formatCurrency(investor.body + investor.accrued)}
                  </Text>
                )}

                <div className="space-y-1">
                  <Label>Дата вывода *</Label>
                  <DatePicker value={form.requestDate} onChange={(v) => setForm((p) => ({ ...p, requestDate: v }))} />
                </div>
                <div className="space-y-1">
                  <Label>Комментарий</Label>
                  <Input
                    value={form.comment}
                    onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))}
                    placeholder="Комментарий (необязательно)"
                  />
                </div>
                {requestWithdrawMutation.error instanceof Error ? (
                  <Text className="text-xs text-red-500">{requestWithdrawMutation.error.message}</Text>
                ) : null}
                <Button type="submit" className="h-11 w-full text-sm font-semibold" disabled={requestWithdrawMutation.isPending}>
                  {requestWithdrawMutation.isPending ? "Отправка..." : "Отправить заявку"}
                </Button>
              </form>
            </Card>

            <div className="grid gap-3 md:grid-cols-2">
              <Card className="p-3 md:p-4 space-y-2 border-border/70">
              <div className="flex items-center justify-between">
                <Text className="text-xs font-semibold text-muted-foreground">История заявок и действий</Text>
                <Button size="sm" variant="outline" onClick={() => router.push(`/dashboard/reports?investor=${investor.id}`)}>
                  Все в отчётах
                </Button>
              </div>
              {payments.length === 0 ? (
                <Text className="text-sm text-muted-foreground">Пока нет заявок.</Text>
              ) : (
                <div className="space-y-2">
                  {payments.slice(0, 14).map((p) => (
                    <div key={p.id} className="rounded-xl border border-border/60 bg-card/70 p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <Text className="font-semibold">{formatPaymentType(p.type)} • {formatCurrency(p.amount)}</Text>
                        <StatusPill tone={paymentStatusTone(p.status)}>{formatPaymentStatus(p.status)}</StatusPill>
                      </div>
                      <Text className="text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleString("ru-RU")}</Text>
                      {p.comment ? <Text className="mt-1 text-xs text-muted-foreground">{p.comment}</Text> : null}
                      {canActAsInvestor && p.status === "approved_waiting_accept" ? (
                        <div className="mt-2 flex gap-2">
                          <Button size="sm" onClick={() => paymentDecisionMutation.mutate({ paymentId: p.id, action: "investor_accept" })}>
                            Принять
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => paymentDecisionMutation.mutate({ paymentId: p.id, action: "investor_dispute" })}>
                            Спор
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
              </Card>

              <Card className="p-3 md:p-4 space-y-2 border-border/70">
                <Text className="text-xs font-semibold text-muted-foreground">Активность и пополнения</Text>
                <div className="space-y-2">
                  {topUpRequests.length === 0 ? (
                    <Text className="text-sm text-muted-foreground">Пополнений тела пока нет.</Text>
                  ) : (
                    topUpRequests.slice(0, 8).map((r) => (
                      <div key={r.id} className="rounded-xl border border-border/60 bg-card/70 p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <Text className="font-semibold">Пополнение • {formatCurrency(r.amount)}</Text>
                          <StatusPill tone={String(r.status).includes("pending") ? "warn" : "neutral"}>
                            {r.status}
                          </StatusPill>
                        </div>
                        <Text className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString("ru-RU")}</Text>
                        {r.comment ? <Text className="mt-1 text-xs text-muted-foreground">{r.comment}</Text> : null}
                      </div>
                    ))
                  )}
                </div>
                {actions.length > 0 ? (
                  <div className="rounded-xl border border-border/60 bg-card/70 p-3">
                    <Text className="text-xs font-semibold text-muted-foreground mb-2">Последние действия</Text>
                    <div className="space-y-1.5">
                      {actions.slice(0, 6).map((a) => (
                        <div key={a.id} className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{a.user.username}</span> • {a.action} •{" "}
                          {new Date(a.createdAt).toLocaleString("ru-RU")}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </Card>
            </div>

            <Card className="p-3 md:p-4">
              <Text className="text-xs font-semibold text-muted-foreground mb-2">Недельный расчет</Text>
              {ledgerData ? (
                <div className="space-y-2">
                  <Text className="text-sm text-muted-foreground">
                    Недель: {ledgerData.summary.weeks} • Начислено: {formatCurrency(ledgerData.summary.totalAccruedAdded)}
                  </Text>
                  {(ledgerData.rows ?? []).slice(0, 10).map((row) => (
                    <div key={row.weekStart} className="rounded-xl border border-border/60 bg-card/70 p-3 text-sm">
                      {new Date(row.weekStart).toLocaleDateString("ru-RU")} - {new Date(row.weekEnd).toLocaleDateString("ru-RU")} •{" "}
                      {row.weeklyRatePercent.toFixed(2)}% • +{formatCurrency(row.accruedAdded)}
                    </div>
                  ))}
                </div>
              ) : (
                <Text className="text-sm text-muted-foreground">Загрузка расчета...</Text>
              )}
            </Card>
          </>
        ) : null}

        <MobileBottomNav active="home" />
      </div>
    </Container>
  );
}

function formatPaymentType(type: string) {
  if (type === "interest") return "Проценты";
  if (type === "body") return "Тело";
  if (type === "close") return "Полное закрытие";
  return type;
}

function formatPaymentStatus(status: string) {
  if (status === "requested") return "Запрошено";
  if (status === "approved_waiting_accept") return "Одобрено, ждёт принятия";
  if (status === "completed") return "Завершено";
  if (status === "rejected") return "Отклонено";
  if (status === "expired") return "Срок истек";
  if (status === "disputed") return "Спор";
  return status;
}

function Info({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/70 p-3 shadow-sm">
      <Text className="text-xs font-medium text-muted-foreground">{title}</Text>
      <Text className="font-semibold">{value}</Text>
    </div>
  );
}

function StatusPill({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "neutral";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        tone === "ok" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
        tone === "warn" && "border-orange-500/30 bg-orange-500/10 text-orange-600",
        tone === "neutral" && "border-border/60 bg-muted/40 text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}

function paymentStatusTone(status: string): "ok" | "warn" | "neutral" {
  if (status === "completed") return "ok";
  if (status === "requested" || status === "approved_waiting_accept") return "warn";
  return "neutral";
}

