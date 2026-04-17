"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import MobileBottomNav from "@/components/navigation/MobileBottomNav";
import { apiClient } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils";
import { useAppDialogs } from "@/components/feedback/AppDialogsProvider";
import { toast } from "@/lib/notify";

type InvestorDetailResponse = {
  success: boolean;
  investor: {
    id: number;
    name: string;
    owner: { username: string; role: string };
    investorUser?: { id: number; username: string } | null;
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
    interestPaid: number;
    accruedEnd: number;
  }>;
};

export default function InvestorManagePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { confirm } = useAppDialogs();
  const investorId = Number(params.id);

  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["investor-detail", investorId],
    queryFn: () => apiClient.get<InvestorDetailResponse>(`/api/investors/${investorId}`),
    enabled: Number.isFinite(investorId),
  });

  const { data: ledgerData } = useQuery({
    queryKey: ["weekly-ledger-single", investorId],
    queryFn: () => apiClient.get<LedgerResponse>(`/api/investors/${investorId}/weekly-ledger`),
    enabled: Number.isFinite(investorId),
  });

  const resetMutation = useMutation({
    mutationFn: () =>
      apiClient.patch<{ success: boolean; credentials: { username: string; password: string } }>(
        `/api/investors/${investorId}`,
        {}
      ),
    onSuccess: (res) => {
      setCredentials(res.credentials);
      queryClient.invalidateQueries({ queryKey: ["investor-detail", investorId] });
      toast.success("Доступ обновлён");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.delete(`/api/investors/${investorId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investors"] });
      toast.success("Инвестор удалён");
      router.push("/dashboard/manage");
    },
  });

  const investor = data?.investor;

  return (
    <Container>
      <div className="min-h-screen py-4 pb-28 md:py-8 md:pb-28 space-y-4">
        <Card className="p-3 md:p-4 flex items-center justify-between">
          <div className="min-w-0">
            <Text className="text-sm text-muted-foreground">Карточка инвестора</Text>
            <Text className="font-semibold text-base md:text-lg break-words">{investor?.name ?? "..."}</Text>
          </div>
          <Button variant="outline" onClick={() => router.push("/dashboard/manage")}>
            Назад
          </Button>
        </Card>

        {isLoading ? <Card className="p-4">Загрузка...</Card> : null}
        {error instanceof Error ? <Card className="p-4 text-red-400">{error.message}</Card> : null}

        {investor ? (
          <>
            <Card className="p-3 md:p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Info title="Тело" value={formatCurrency(investor.body)} />
                <Info title="Ставка" value={`${investor.rate}%`} />
                <Info title="Начислено" value={formatCurrency(investor.accrued)} />
                <Info title="Статус" value={investor.status} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => resetMutation.mutate()} disabled={resetMutation.isPending}>
                  {resetMutation.isPending
                    ? "Сброс..."
                    : investor.investorUser
                      ? "Сбросить доступ"
                      : "Выдать доступ"}
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
                  Удалить инвестора
                </Button>
              </div>
              {credentials ? (
                <div className="mt-3 rounded-xl border border-border/60 bg-card/70 p-3 text-sm">
                  <div>Логин: <span className="font-semibold">{credentials.username}</span></div>
                  <div className="mt-1">Пароль: <span className="font-semibold">{credentials.password}</span></div>
                </div>
              ) : (
                <div className="mt-2 text-xs text-muted-foreground">
                  Логин: <span className="font-semibold">{investor.investorUser?.username ?? "нет"}</span>
                </div>
              )}
            </Card>

            <Card className="p-3 md:p-4 space-y-3">
              <Text className="text-xs font-semibold text-muted-foreground">Журналы и история</Text>
              <Text className="text-sm text-muted-foreground">
                Выплаты, запросы на пополнение тела и журнал действий по этому инвестору собраны в разделе «Отчёты».
              </Text>
              <Button type="button" variant="outline" onClick={() => router.push(`/dashboard/reports?investor=${investor.id}`)}>
                Открыть отчёты
              </Button>
            </Card>

            <Card className="p-3 md:p-4">
              <Text className="text-xs font-semibold text-muted-foreground mb-2">Недельный расчет</Text>
              {ledgerData ? (
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">
                    Недель: {ledgerData.summary.weeks} • Начислено: {formatCurrency(ledgerData.summary.totalAccruedAdded)}
                  </div>
                  {(ledgerData.rows ?? []).slice(0, 12).map((row) => (
                    <div key={row.weekStart} className="rounded-xl border border-border/60 bg-card/70 p-3 text-sm">
                      {new Date(row.weekStart).toLocaleDateString("ru-RU")} - {new Date(row.weekEnd).toLocaleDateString("ru-RU")} •{" "}
                      {row.weeklyRatePercent.toFixed(2)}% • +{formatCurrency(row.accruedAdded)}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Загрузка расчета...</div>
              )}
            </Card>
          </>
        ) : null}

        <MobileBottomNav active="finance" />
      </div>
    </Container>
  );
}

function Info({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/70 p-3">
      <Text className="text-xs font-medium text-muted-foreground">{title}</Text>
      <Text className="font-semibold">{value}</Text>
    </div>
  );
}
