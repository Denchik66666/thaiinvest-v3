"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";
import { formatCurrency, cn } from "@/lib/utils";
import { DASHBOARD_STICKY_BAR_CLASS } from "@/lib/dashboard-sticky-bar";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { DatePicker } from "@/components/ui/DatePicker";
import MobileBottomNav from "@/components/navigation/MobileBottomNav";
import { UserAvatar } from "@/components/user/UserAvatar";
import NotificationBell from "@/components/notifications/NotificationBell";
import { toast } from "@/lib/notify";
import { notifyWithAttention } from "@/lib/attention-notify";
import {
  persistAppTheme,
} from "@/lib/app-theme";
import {
  readNotificationPreferences,
  subscribeNotificationPreferences,
} from "@/lib/notification-preferences";

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
  linkedUserId?: number | null;
  investorUserId?: number | null;
  payments?: PaymentRow[];
  owner: {
    username: string;
    role: string;
  };
};

type PaymentRow = {
  id: number;
  type: "interest" | "body" | "close";
  amount: number;
  status: string;
  comment?: string | null;
  createdAt: string;
  approvedAt?: string | null;
};

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

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showBecomeModal, setShowBecomeModal] = useState(false);
  const [selectedInvestorCardId, setSelectedInvestorCardId] = useState<number | null>(null);
  const [becomeForm, setBecomeForm] = useState({
    name: "",
    body: "",
    rate: "",
    entryDate: new Date().toISOString().split("T")[0],
    allowMultiple: false,
  });
  const [withdrawForm, setWithdrawForm] = useState({
    investorId: "",
    type: "interest" as "interest" | "body" | "close",
    amount: "",
    comment: "",
    requestDate: new Date().toISOString().split("T")[0],
  });
  const [pageVisible, setPageVisible] = useState(true);
  const notifyPrefs = useSyncExternalStore(
    subscribeNotificationPreferences,
    readNotificationPreferences,
    readNotificationPreferences
  );

  function toggleDarkMode() {
    const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
    persistAppTheme("theme-linear", !isDark);
  }

  const parseAmountInput = (value: string) => Number(value.replace(/[^\d]/g, ""));
  const formatAmountInput = (value: string) => {
    const amount = parseAmountInput(value);
    if (!amount) return "";
    return `${amount.toLocaleString("ru-RU")} ฿`;
  };

  const { data: investorsData, isLoading: loadingInvestors } = useQuery({
    queryKey: ["investors", "all"],
    queryFn: () => apiClient.get<{ investors: InvestorRow[] }>("/api/investors?network=all"),
    enabled: !!user,
    refetchInterval:
      user?.role === "INVESTOR"
        ? notifyPrefs.pollingMode === "fast"
          ? pageVisible
            ? 8_000
            : 20_000
          : notifyPrefs.pollingMode === "standard"
            ? pageVisible
              ? 15_000
              : 30_000
            : pageVisible
              ? 30_000
              : 60_000
        : false,
  });

  const investors = useMemo(() => investorsData?.investors ?? [], [investorsData]);
  const myInvestors = useMemo(
    () =>
      user?.role === "SUPER_ADMIN"
        ? investors.filter((inv) => !inv.isPrivate && inv.linkedUserId === user.id)
        : user?.role === "OWNER"
          ? investors.filter((inv) => inv.owner.username === user?.username)
          : investors.filter((inv) => inv.investorUserId === user?.id),
    [investors, user]
  );
  const stats = useMemo(() => {
    return myInvestors.reduce(
      (acc, inv) => ({
        capital: acc.capital + (inv.body || 0),
        accrued: acc.accrued + (inv.accrued || 0),
        paid: acc.paid + (inv.paid || 0),
        due: acc.due + (inv.due || 0),
      }),
      { capital: 0, accrued: 0, paid: 0, due: 0 }
    );
  }, [myInvestors]);
  const hasLinkedCommonInvestment = useMemo(
    () => myInvestors.length > 0,
    [myInvestors]
  );
  const selectedInvestorCard = useMemo(
    () => myInvestors.find((inv) => inv.id === selectedInvestorCardId) ?? null,
    [myInvestors, selectedInvestorCardId]
  );

  const currentWeek = getCurrentWeek();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const isOwner = user?.role === "OWNER";
  const isInvestor = user?.role === "INVESTOR";
  const pageSubtitle = isOwner ? "Сводка по общей сети" : isInvestor ? "Кабинет инвестора" : "Мой кабинет инвестора";
  const metricsSectionTitle = isOwner ? "Показатели сети" : "Мои показатели";
  const capitalStatTitle = isOwner ? "Тело в сети" : "Баланс";
  const positionsSectionTitle = isOwner ? "Инвесторы в сети" : "Мои позиции";
  const positionsEmptyHint = isOwner
    ? "В общей сети пока нет инвесторов. Добавьте первого в разделе «Управление»."
    : "У тебя пока нет инвесторов. Когда появятся позиции, они будут отображаться здесь.";
  const paymentStatusRef = useRef<Record<string, string> | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const apply = () => setPageVisible(document.visibilityState === "visible");
    apply();
    document.addEventListener("visibilitychange", apply);
    return () => document.removeEventListener("visibilitychange", apply);
  }, []);

  useEffect(() => {
    if (user?.role !== "INVESTOR") return;
    const key = `investor-payment-status-map:${user.id}`;
    const currentMap: Record<string, string> = {};
    for (const inv of myInvestors) {
      for (const p of inv.payments ?? []) currentMap[String(p.id)] = p.status;
    }

    // First hydrate: preload known map without toasts.
    if (paymentStatusRef.current == null) {
      try {
        const raw = localStorage.getItem(key);
        paymentStatusRef.current = raw ? (JSON.parse(raw) as Record<string, string>) : currentMap;
      } catch {
        paymentStatusRef.current = currentMap;
      }
      try {
        localStorage.setItem(key, JSON.stringify(currentMap));
      } catch {}
      return;
    }

    const prevMap = paymentStatusRef.current;
    for (const inv of myInvestors) {
      for (const p of inv.payments ?? []) {
        const prev = prevMap[String(p.id)];
        if (!prev || prev === p.status) continue;
        if (p.status === "rejected") {
          notifyWithAttention("error", `Заявка отклонена: ${inv.name}`, notifyPrefs);
        } else if (p.status === "approved_waiting_accept") {
          notifyWithAttention("success", `Заявка одобрена: ${inv.name}. Откройте «Отчёты» для решения.`, notifyPrefs);
        } else if (p.status === "completed") {
          notifyWithAttention("success", `Выплата завершена: ${inv.name}`, notifyPrefs);
        } else if (p.status === "expired") {
          notifyWithAttention("error", `Срок заявки истёк: ${inv.name}`, notifyPrefs);
        }
      }
    }

    paymentStatusRef.current = currentMap;
    try {
      localStorage.setItem(key, JSON.stringify(currentMap));
    } catch {}
  }, [user, myInvestors, notifyPrefs]);
  const becomeMutation = useMutation({
    mutationFn: () =>
      apiClient.post("/api/investors/become-semen-investor", {
        name: becomeForm.name.trim(),
        body: parseAmountInput(becomeForm.body),
        rate: Number(becomeForm.rate),
        entryDate: becomeForm.entryDate,
        allowMultiple: becomeForm.allowMultiple,
      }),
    onSuccess: () => {
      setShowBecomeModal(false);
      setBecomeForm({
        name: "",
        body: "",
        rate: "",
        entryDate: new Date().toISOString().split("T")[0],
        allowMultiple: false,
      });
      queryClient.invalidateQueries({ queryKey: ["investors"] });
    },
  });
  const requestWithdrawMutation = useMutation({
    mutationFn: () =>
      apiClient.post("/api/payments", {
        action: "request",
        investorId: Number(withdrawForm.investorId),
        type: withdrawForm.type,
        amount: withdrawForm.type === "close" ? undefined : parseAmountInput(withdrawForm.amount),
        comment: withdrawForm.comment.trim() || undefined,
        requestDate: withdrawForm.requestDate,
      }),
    onSuccess: () => {
      setSelectedInvestorCardId(null);
      setWithdrawForm({
        investorId: "",
        type: "interest",
        amount: "",
        comment: "",
        requestDate: new Date().toISOString().split("T")[0],
      });
      queryClient.invalidateQueries({ queryKey: ["investors"] });
      queryClient.invalidateQueries({ queryKey: ["reports-investors"] });
      toast.success("Запрос на вывод отправлен");
    },
  });
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

  if (authLoading) return <div className="flex items-center justify-center min-h-screen"><Text>Загрузка...</Text></div>;
  if (!user) return null;

  return (
    <Container>
      <div className="min-h-screen py-4 pb-28 md:py-8 md:pb-28 space-y-4">
        <div className={DASHBOARD_STICKY_BAR_CLASS}>
          <button
            type="button"
            onClick={() => router.push("/dashboard/profile")}
            className="flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-muted/60 transition"
          >
            <UserAvatar name={user.username} src={user.avatarUrl} size={38} />
            <span className="truncate text-base font-semibold">{user.username}</span>
            <span className="text-muted-foreground" aria-hidden>
              ›
            </span>
          </button>
          <div className="ml-auto flex items-center gap-2">
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
        <Text className="text-xs text-muted-foreground">{pageSubtitle}</Text>
        {isSuperAdmin && !hasLinkedCommonInvestment ? (
          <Card className="p-3">
            <Button size="sm" variant="outline" className="w-full" onClick={() => setShowBecomeModal(true)}>
              Стать инвестором Семёна
            </Button>
          </Card>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <Card className="p-3 md:p-4 lg:col-span-2">
            <Text className="text-xs font-semibold text-muted-foreground mb-2">{metricsSectionTitle}</Text>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <StatCard title={capitalStatTitle} value={stats.capital} color="text-foreground" />
              <StatCard title="Начислено" value={stats.accrued} color="text-blue-600" />
              <StatCard title="К выплате" value={stats.due} color="text-orange-600" />
              <StatCard title="Выплачено" value={stats.paid} color="text-green-600" />
            </div>
          </Card>

          <Card className="p-3 md:p-4">
            <Text className="text-xs font-semibold text-muted-foreground mb-2">Цикл</Text>
            <InfoRow label="Текущая неделя" value={`${currentWeek.start} - ${currentWeek.end}`} />
            <div className="mt-2" />
            <InfoRow label="Следующая выплата" value={currentWeek.nextPayout} />
          </Card>
        </div>

        <Card className="p-3 md:p-4">
          <div className="flex items-center justify-between mb-2">
            <Text className="text-xs font-semibold text-muted-foreground">{positionsSectionTitle}</Text>
          </div>
          {loadingInvestors ? (
            <div className="py-10 text-center text-muted-foreground">Загрузка данных...</div>
          ) : myInvestors.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">{positionsEmptyHint}</div>
          ) : (
            <div className="space-y-2">
              {myInvestors.map((inv) => (
                <div
                  key={inv.id}
                  onClick={() => router.push(`/dashboard/investors/${inv.id}`)}
                  className="w-full cursor-pointer rounded-xl border border-border/60 bg-card/70 p-3 text-left hover:bg-muted/20 transition"
                >
                  <div className="flex items-center justify-between">
                    <Text className="font-semibold">{inv.name}</Text>
                    <Text className="text-xs text-muted-foreground">{inv.status}</Text>
                  </div>
                  <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                    <MiniStat label="Тело" value={formatCurrency(inv.body)} />
                    <MiniStat label="Начислено" value={formatCurrency(inv.accrued)} valueClass="text-blue-600" />
                    <MiniStat label="Выплачено" value={formatCurrency(inv.paid)} valueClass="text-green-600" />
                    <MiniStat
                      label="К выплате"
                      value={formatCurrency(inv.due)}
                      valueClass="text-orange-600"
                      onQuickAction={() => {
                        setWithdrawForm((prev) => ({ ...prev, investorId: String(inv.id) }));
                        setSelectedInvestorCardId(inv.id);
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        

        {showBecomeModal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
            <Card className="w-full max-w-md p-5 space-y-4">
              <Text className="text-base font-semibold">Стать инвестором Семёна</Text>
              <Text className="text-xs text-muted-foreground">
                Будет создан инвестор в общей сети Семёна и привязан к твоему кабинету.
              </Text>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  becomeMutation.mutate();
                }}
              >
                <div className="space-y-1">
                  <Label>Имя *</Label>
                  <Input
                    required
                    value={becomeForm.name}
                    onChange={(e) => setBecomeForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Например, Denis"
                    disabled={becomeMutation.isPending}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Тело (бат) *</Label>
                  <Input
                    required
                    type="text"
                    value={becomeForm.body}
                    onChange={(e) =>
                      setBecomeForm((prev) => ({ ...prev, body: formatAmountInput(e.target.value) }))
                    }
                    placeholder="100 000 ฿"
                    disabled={becomeMutation.isPending}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Ставка входа (%) *</Label>
                  <Input
                    required
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={becomeForm.rate}
                    onChange={(e) => setBecomeForm((prev) => ({ ...prev, rate: e.target.value }))}
                    placeholder="10"
                    disabled={becomeMutation.isPending}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Дата входа *</Label>
                  <DatePicker
                    value={becomeForm.entryDate}
                    onChange={(v) => setBecomeForm((prev) => ({ ...prev, entryDate: v }))}
                    className={becomeMutation.isPending ? "opacity-60 pointer-events-none" : undefined}
                    placeholder="Выбери дату"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={becomeForm.allowMultiple}
                    onChange={(e) => setBecomeForm((prev) => ({ ...prev, allowMultiple: e.target.checked }))}
                    disabled={becomeMutation.isPending}
                  />
                  Разрешить создание второго вклада у Семёна
                </label>
                {becomeMutation.error instanceof Error ? (
                  <Text className="text-xs text-red-500">{becomeMutation.error.message}</Text>
                ) : null}
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowBecomeModal(false)}
                    disabled={becomeMutation.isPending}
                  >
                    Отмена
                  </Button>
                  <Button type="submit" className="flex-1" disabled={becomeMutation.isPending}>
                    {becomeMutation.isPending ? "Создание..." : "Создать"}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        ) : null}

        {selectedInvestorCard ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
            <Card className="w-full max-w-md p-5 space-y-4">
              <div className="flex items-center justify-between">
                <Text className="text-base font-semibold">{selectedInvestorCard.name}</Text>
                <Text className="text-xs text-muted-foreground">{selectedInvestorCard.status}</Text>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <MiniStat label="Тело" value={formatCurrency(selectedInvestorCard.body)} />
                <MiniStat label="Начислено" value={formatCurrency(selectedInvestorCard.accrued)} valueClass="text-blue-600" />
                <MiniStat label="К выплате" value={formatCurrency(selectedInvestorCard.due)} valueClass="text-orange-600" />
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
                    className="w-full px-3 py-2 rounded-md bg-input text-foreground border border-border focus:ring-2 focus:ring-primary transition outline-none"
                    value={withdrawForm.type}
                    onChange={(e) =>
                      setWithdrawForm((prev) => ({
                        ...prev,
                        type: e.target.value as "interest" | "body" | "close",
                      }))
                    }
                  >
                    <option value="interest">Проценты</option>
                    <option value="body">Тело</option>
                    <option value="close">Полное закрытие</option>
                  </select>
                </div>
                {withdrawForm.type !== "close" ? (
                  <div className="space-y-1">
                    <Label>Сумма *</Label>
                    <Input
                      required
                      type="text"
                      value={withdrawForm.amount}
                      onChange={(e) => setWithdrawForm((prev) => ({ ...prev, amount: formatAmountInput(e.target.value) }))}
                      placeholder="2 500 ฿"
                    />
                    <Text className="text-[11px] text-muted-foreground">
                      Доступно:{" "}
                      {withdrawForm.type === "interest"
                        ? formatCurrency(
                            Math.max(
                              selectedInvestorCard.accrued -
                                (selectedInvestorCard.payments ?? [])
                                  .filter((p) => p.type === "interest" && ["requested", "approved_waiting_accept"].includes(p.status))
                                  .reduce((sum, p) => sum + p.amount, 0),
                              0
                            )
                          )
                        : formatCurrency(
                            Math.max(
                              selectedInvestorCard.body -
                                (selectedInvestorCard.payments ?? [])
                                  .filter((p) => p.type === "body" && ["requested", "approved_waiting_accept"].includes(p.status))
                                  .reduce((sum, p) => sum + p.amount, 0),
                              0
                            )
                          )}
                    </Text>
                  </div>
                ) : null}
                <div className="space-y-1">
                  <Label>Дата вывода *</Label>
                  <DatePicker
                    value={withdrawForm.requestDate}
                    onChange={(v) => setWithdrawForm((prev) => ({ ...prev, requestDate: v }))}
                    placeholder="Выбери дату"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Комментарий</Label>
                  <Input
                    value={withdrawForm.comment}
                    onChange={(e) => setWithdrawForm((prev) => ({ ...prev, comment: e.target.value }))}
                    placeholder="Комментарий (необязательно)"
                  />
                </div>
                {requestWithdrawMutation.error instanceof Error ? (
                  <Text className="text-xs text-red-500">{requestWithdrawMutation.error.message}</Text>
                ) : null}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setSelectedInvestorCardId(null)}>
                    Отмена
                  </Button>
                  <Button type="submit" className="flex-1" disabled={requestWithdrawMutation.isPending}>
                    {requestWithdrawMutation.isPending ? "Запрос..." : "Запросить"}
                  </Button>
                </div>
              </form>
              <div className="rounded-xl border border-border/60 bg-card/70 p-3 space-y-2">
                <Text className="text-xs text-muted-foreground">
                  История выплат, запросы на пополнение тела и действия по ним (принять, отклонить, спор) — в разделе «Отчёты» для этой позиции.
                </Text>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => router.push(`/dashboard/reports?investor=${selectedInvestorCard.id}`)}
                >
                  Открыть отчёты
                </Button>
              </div>
            </Card>
          </div>
        ) : null}
        <MobileBottomNav active="home" />
      </div>
    </Container>
  );
}

function StatCard({ title, value, color }: { title: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/70 p-3">
      <Text className="text-xs text-muted-foreground mb-1 whitespace-nowrap">{title}</Text>
      <div className={cn("text-base md:text-2xl font-semibold tracking-tight whitespace-nowrap", color)}>{formatCurrency(value)}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/70 p-2.5">
      <Text className="text-xs font-medium text-muted-foreground">{label}</Text>
      <Text className="text-sm font-semibold mt-0.5">{value}</Text>
    </div>
  );
}

function MiniStat({
  label,
  value,
  valueClass,
  onQuickAction,
}: {
  label: string;
  value: string;
  valueClass?: string;
  onQuickAction?: () => void;
}) {
  if (onQuickAction) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onQuickAction();
        }}
        className="rounded-lg border border-border/50 bg-background/40 p-2 text-left transition hover:bg-muted/40"
      >
        <Text className="text-xs text-muted-foreground">{label}</Text>
        <Text className={cn("text-sm font-semibold mt-0.5", valueClass)}>{value}</Text>
      </button>
    );
  }
  return (
    <div className="rounded-lg border border-border/50 bg-background/40 p-2">
      <Text className="text-xs text-muted-foreground">{label}</Text>
      <Text className={cn("text-sm font-semibold mt-0.5", valueClass)}>{value}</Text>
    </div>
  );
}
