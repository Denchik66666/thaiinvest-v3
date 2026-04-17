"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import MobileBottomNav from "@/components/navigation/MobileBottomNav";

type InvestorRow = {
  id: number;
  name: string;
  body: number;
  accrued: number;
  due: number;
  status: string;
  owner: { username: string };
};

export default function FinancePage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!loading && user && user.role !== "INVESTOR") {
      router.replace("/dashboard/manage");
    }
  }, [loading, user, router]);

  const { data, isLoading } = useQuery({
    queryKey: ["finance-investors"],
    queryFn: () => apiClient.get<{ investors: InvestorRow[] }>("/api/investors?network=all"),
    enabled: !!user && user.role === "INVESTOR",
  });

  const investors = useMemo(() => data?.investors ?? [], [data?.investors]);
  const totals = useMemo(
    () =>
      investors.reduce(
        (acc, inv) => ({
          body: acc.body + (inv.body || 0),
          accrued: acc.accrued + (inv.accrued || 0),
          due: acc.due + (inv.due || 0),
        }),
        { body: 0, accrued: 0, due: 0 }
      ),
    [investors]
  );

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Text>Загрузка...</Text>
      </div>
    );
  }

  if (user.role !== "INVESTOR") return null;

  return (
    <Container>
      <div className="min-h-screen space-y-4 py-4 pb-28 md:py-8 md:pb-28">
        <Card className="p-3 md:p-4">
          <Text className="text-xs font-semibold text-muted-foreground">Финансы</Text>
          <Text className="mt-1 text-base font-semibold">Твои финансовые показатели</Text>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Stat title="Тело" value={formatCurrency(totals.body)} />
            <Stat title="Начислено" value={formatCurrency(totals.accrued)} />
            <Stat title="К выплате" value={formatCurrency(totals.due)} />
          </div>
        </Card>

        <Card className="p-3 md:p-4">
          <div className="mb-2 flex items-center justify-between">
            <Text className="text-xs font-semibold text-muted-foreground">Мои позиции</Text>
            <Button size="sm" variant="outline" onClick={() => router.push("/dashboard/reports")}>
              Открыть отчёты
            </Button>
          </div>
          {isLoading ? (
            <Text className="text-sm text-muted-foreground">Загрузка...</Text>
          ) : investors.length === 0 ? (
            <Text className="text-sm text-muted-foreground">Пока нет инвестиций.</Text>
          ) : (
            <div className="space-y-2">
              {investors.map((inv) => (
                <button
                  key={inv.id}
                  type="button"
                  onClick={() => router.push(`/dashboard/investors/${inv.id}`)}
                  className="w-full rounded-xl border border-border/60 bg-card/70 p-3 text-left transition hover:bg-muted/30"
                >
                  <div className="flex items-center justify-between">
                    <Text className="font-semibold">{inv.name}</Text>
                    <Text className="text-xs text-muted-foreground">{inv.status}</Text>
                  </div>
                  <Text className="mt-1 text-xs text-muted-foreground">OWNER: {inv.owner.username}</Text>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                    <StatMini label="Тело" value={formatCurrency(inv.body)} />
                    <StatMini label="Начислено" value={formatCurrency(inv.accrued)} />
                    <StatMini label="К выплате" value={formatCurrency(inv.due)} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        <MobileBottomNav active="finance" />
      </div>
    </Container>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/70 p-3">
      <Text className="text-xs text-muted-foreground">{title}</Text>
      <Text className="font-semibold">{value}</Text>
    </div>
  );
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/30 p-2">
      <Text className="text-xs text-muted-foreground">{label}</Text>
      <Text className="text-sm font-semibold">{value}</Text>
    </div>
  );
}

