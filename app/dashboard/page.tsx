"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";
import { formatCurrency, cn } from "@/lib/utils";
import { investorsDashboardListQueryKey, investorsDashboardNetworkParam } from "@/lib/investors-query";
import { DASHBOARD_STICKY_BAR_CLASS } from "@/lib/dashboard-sticky-bar";
import { Container } from "@/components/ui/Container";
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
import ThemeToggle from "@/components/ThemeToggle";
import { WeekCycleStrip } from "@/components/dashboard/WeekCycleStrip";
import { StatusBadge } from "@/components/investors/InvestorsTable";
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

function DashboardAuthSkeleton() {
  return (
    <Container>
      <div className="thai-dashboard-root min-h-screen space-y-3 py-3 pb-24 md:space-y-5 md:py-8 md:pb-28">
        <div className={DASHBOARD_STICKY_BAR_CLASS}>
          <div className="h-11 max-w-[220px] flex-1 rounded-xl bg-muted/45 animate-pulse" />
          <div className="ml-auto flex items-center gap-2">
            <div className="h-10 w-10 rounded-full bg-muted/45 animate-pulse" />
            <div className="h-9 w-[5.5rem] rounded-xl bg-muted/45 animate-pulse" />
          </div>
        </div>
        <div className="thai-glass h-64 rounded-2xl bg-muted/25 animate-pulse md:h-72" />
        <div className="thai-glass h-40 rounded-2xl bg-muted/25 animate-pulse" />
      </div>
    </Container>
  );
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

  const parseAmountInput = (value: string) => Number(value.replace(/[^\d]/g, ""));
  const formatAmountInput = (value: string) => {
    const amount = parseAmountInput(value);
    if (!amount) return "";
    return `${amount.toLocaleString("ru-RU")} ฿`;
  };

  const investorsQueryKey = investorsDashboardListQueryKey(user?.role);

  const { data: investorsData, isLoading: loadingInvestors } = useQuery({
    queryKey: investorsQueryKey,
    queryFn: () =>
      apiClient.get<{ investors: InvestorRow[] }>(
        `/api/investors?network=${investorsDashboardNetworkParam(user!.role)}&lean=1`
      ),
    enabled: !!user,
    placeholderData: keepPreviousData,
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

  /** ≈ сумма недельных начислений по активным позициям (месячная ставка / 4). */
  const nextWeeklyAccrual = useMemo(
    () =>
      myInvestors
        .filter((i) => i.status === "active")
        .reduce((s, i) => s + (i.body * (i.rate / 100)) / 4, 0),
    [myInvestors]
  );

  const bestDueInvestor = useMemo(() => {
    const list = myInvestors.filter((i) => i.due > 0.005);
    if (!list.length) return null;
    return list.reduce((a, b) => (b.due > a.due ? b : a));
  }, [myInvestors]);

  const canRequestWithdraw = bestDueInvestor != null;
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

  if (authLoading) return <DashboardAuthSkeleton />;
  if (!user) return null;

  function openWithdrawForBestDue() {
    if (!bestDueInvestor) return;
    setWithdrawForm((prev) => ({
      ...prev,
      investorId: String(bestDueInvestor.id),
      type: "interest",
    }));
    setSelectedInvestorCardId(bestDueInvestor.id);
  }

  return (
    <Container>
      <div className="thai-dashboard-root min-h-screen space-y-4 py-4 pb-28 md:space-y-5 md:py-8 md:pb-28">
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
            <ThemeToggle />
          </div>
        </div>

        {isSuperAdmin && !hasLinkedCommonInvestment ? (
          <div className="thai-glass rounded-2xl p-2.5 md:p-4">
            <Button size="sm" variant="outline" className="w-full" onClick={() => setShowBecomeModal(true)}>
              Стать инвестором Семёна
            </Button>
          </div>
        ) : null}

        <section className="thai-glass relative overflow-hidden rounded-2xl p-2.5 md:p-5">
          <div
            className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-primary/15 blur-3xl dark:bg-primary/20"
            aria-hidden
          />
          <div className="relative space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1.5">
                <div className="thai-hero-accent" />
                <h1 className="text-xl font-bold tracking-tight md:text-2xl">Главная</h1>
                <Text className="text-xs text-muted-foreground md:text-sm">{pageSubtitle}</Text>
                <Text className="text-[11px] text-muted-foreground/90">
                  Неделя {currentWeek.start} — {currentWeek.end}
                </Text>
              </div>
              <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:pt-6">
                {metricsSectionTitle}
              </Text>
            </div>

            <WeekCycleStrip payoutLabel={currentWeek.nextPayout} />

            <div className="grid gap-2.5 md:grid-cols-2 md:gap-3">
              <div
                className={cn(
                  "relative overflow-hidden rounded-2xl p-4",
                  "bg-gradient-to-br from-primary/18 via-primary/[0.06] to-cyan-500/10",
                  "ring-1 ring-primary/25 dark:from-primary/22 dark:ring-primary/30"
                )}
              >
                <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Следующее начисление
                </Text>
                <p className="mt-1.5 tabular-nums text-2xl font-bold tracking-tight md:text-3xl">
                  {formatCurrency(nextWeeklyAccrual)}
                </p>
                <Text className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  Ориентир на {currentWeek.nextPayout}: недельная доля (ставка ÷ 4) по активным позициям.
                </Text>
              </div>

              <button
                type="button"
                onClick={openWithdrawForBestDue}
                disabled={!canRequestWithdraw}
                className={cn(
                  "relative overflow-hidden rounded-2xl p-4 text-left transition duration-200",
                  "bg-gradient-to-br from-amber-500/14 via-orange-500/[0.07] to-transparent",
                  "ring-1 ring-amber-500/25 dark:from-amber-500/18 dark:ring-amber-400/25",
                  canRequestWithdraw &&
                    "cursor-pointer hover:ring-amber-500/50 hover:shadow-[0_0_28px_-8px_rgba(245,158,11,0.45)] active:scale-[0.99]",
                  !canRequestWithdraw && "cursor-not-allowed opacity-55"
                )}
              >
                <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  К выплате сейчас
                </Text>
                <p
                  className={cn(
                    "mt-1.5 tabular-nums text-2xl font-bold tracking-tight md:text-3xl",
                    "thai-text-metric-warn"
                  )}
                >
                  {formatCurrency(stats.due)}
                </p>
                <Text className="mt-1 text-[11px] text-muted-foreground">
                  {canRequestWithdraw
                    ? `Запросить вывод · ${bestDueInvestor?.name ?? ""} · нажмите здесь`
                    : "Нет доступной суммы к выводу по накопленным процентам."}
                </Text>
                {canRequestWithdraw ? (
                  <span className="mt-2 inline-flex items-center text-xs font-medium text-amber-600 dark:text-amber-400">
                    Вывести →
                  </span>
                ) : null}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1.5 md:gap-3">
              <GradientStat title={capitalStatTitle} value={stats.capital} tone="neutral" />
              <GradientStat title="Начислено" value={stats.accrued} tone="info" />
              <GradientStat title="Выплачено" value={stats.paid} tone="ok" />
            </div>
          </div>
        </section>

        {isOwner || isSuperAdmin ? (
          <section className="thai-panel-muted space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Центр управления
              </Text>
              <Text className="text-[11px] text-muted-foreground">
                Быстрый доступ к основным действиям
              </Text>
            </div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 sm:gap-2">
              <button
                type="button"
                onClick={() => router.push("/dashboard/investors")}
                className="thai-row-interactive thai-glass rounded-xl border border-border/40 p-3 text-left"
              >
                <Text className="text-sm font-semibold text-foreground">Инвесторы</Text>
                <Text className="mt-1 text-xs text-muted-foreground">
                  Поиск, фильтры, карточки, контроль статусов и выплат
                </Text>
              </button>
              <button
                type="button"
                onClick={() => router.push("/dashboard/manage")}
                className="thai-row-interactive thai-glass rounded-xl border border-border/40 p-3 text-left"
              >
                <Text className="text-sm font-semibold text-foreground">Управление</Text>
                <Text className="mt-1 text-xs text-muted-foreground">
                  Создание инвесторов, системная готовность, ставка сети
                </Text>
              </button>
              <button
                type="button"
                onClick={() => router.push("/dashboard/reports")}
                className="thai-row-interactive thai-glass rounded-xl border border-border/40 p-3 text-left"
              >
                <Text className="text-sm font-semibold text-foreground">Отчёты</Text>
                <Text className="mt-1 text-xs text-muted-foreground">
                  Очереди заявок, пополнения тела, история действий
                </Text>
              </button>
              <button
                type="button"
                onClick={() => router.push("/dashboard/profile")}
                className="thai-row-interactive thai-glass rounded-xl border border-border/40 p-3 text-left"
              >
                <Text className="text-sm font-semibold text-foreground">Профиль и безопасность</Text>
                <Text className="mt-1 text-xs text-muted-foreground">
                  Настройки аккаунта и критические действия SUPER_ADMIN
                </Text>
              </button>
            </div>
          </section>
        ) : null}

        <div className="thai-glass rounded-2xl p-2.5 md:p-4">
          <div className="flex items-center justify-between mb-2">
            <Text className="text-xs font-semibold text-muted-foreground">{positionsSectionTitle}</Text>
          </div>
          {loadingInvestors && !investorsData ? (
            <div className="space-y-2.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="thai-glass animate-pulse rounded-xl p-3 ring-1 ring-black/5 dark:ring-white/10"
                >
                  <div className="h-4 w-36 rounded-md bg-muted/45" />
                  <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
                    {[0, 1, 2, 3].map((j) => (
                      <div key={j} className="h-11 rounded-lg bg-muted/30" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : myInvestors.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">{positionsEmptyHint}</div>
          ) : (
            <div className="space-y-2.5">
              {myInvestors.map((inv) => (
                <div
                  key={inv.id}
                  onClick={() => router.push(`/dashboard/investors/${inv.id}`)}
                  className="thai-row-interactive thai-glass w-full cursor-pointer border-0 p-3 text-left ring-1 ring-black/5 dark:ring-white/10"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Text className="font-semibold tracking-tight">{inv.name}</Text>
                    <StatusBadge status={inv.status} />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
                    <MiniStat label="Тело" value={formatCurrency(inv.body)} />
                    <MiniStat label="Начислено" value={formatCurrency(inv.accrued)} valueClass="thai-text-metric-info" />
                    <MiniStat label="Выплачено" value={formatCurrency(inv.paid)} valueClass="thai-text-metric-ok" />
                    <MiniStat
                      label="К выплате"
                      value={formatCurrency(inv.due)}
                      valueClass="thai-text-metric-warn"
                      highlightAction={inv.due > 0.005}
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
        </div>

        {showBecomeModal ? (
          <div className="thai-modal-overlay fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="thai-glass w-full max-w-md space-y-4 rounded-2xl p-5 shadow-2xl">
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
            </div>
          </div>
        ) : null}

        {selectedInvestorCard ? (
          <div className="thai-modal-overlay fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="thai-glass w-full max-w-md space-y-4 rounded-2xl p-5 shadow-2xl">
              <div className="flex items-center justify-between">
                <Text className="text-base font-semibold">{selectedInvestorCard.name}</Text>
                <Text className="text-xs text-muted-foreground">{selectedInvestorCard.status}</Text>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <MiniStat label="Тело" value={formatCurrency(selectedInvestorCard.body)} />
                <MiniStat
                  label="Начислено"
                  value={formatCurrency(selectedInvestorCard.accrued)}
                  valueClass="thai-text-metric-info"
                />
                <MiniStat
                  label="К выплате"
                  value={formatCurrency(selectedInvestorCard.due)}
                  valueClass="thai-text-metric-warn"
                />
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
              <div className="thai-glass space-y-2 rounded-xl p-3">
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
            </div>
          </div>
        ) : null}
        <MobileBottomNav active="home" />
      </div>
    </Container>
  );
}

function GradientStat({
  title,
  value,
  tone,
}: {
  title: string;
  value: number;
  tone: "neutral" | "info" | "ok";
}) {
  const toneClass =
    tone === "info"
      ? "from-blue-500/12 via-blue-500/[0.04] to-transparent ring-blue-500/15 dark:from-blue-400/14 dark:ring-blue-400/20"
      : tone === "ok"
        ? "from-emerald-500/12 via-emerald-500/[0.04] to-transparent ring-emerald-500/15 dark:from-emerald-400/14 dark:ring-emerald-400/20"
        : "from-foreground/[0.07] via-transparent to-transparent ring-black/[0.06] dark:from-white/[0.08] dark:ring-white/10";

  const valueClass =
    tone === "info" ? "thai-text-metric-info" : tone === "ok" ? "thai-text-metric-ok" : "text-foreground";

  return (
    <div
      className={cn(
        "rounded-xl bg-gradient-to-br p-3 ring-1 transition duration-200 hover:brightness-[1.02] dark:hover:brightness-110",
        toneClass
      )}
    >
      <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</Text>
      <div className={cn("mt-1 tabular-nums text-base font-bold tracking-tight md:text-lg", valueClass)}>
        {formatCurrency(value)}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  valueClass,
  onQuickAction,
  highlightAction,
}: {
  label: string;
  value: string;
  valueClass?: string;
  onQuickAction?: () => void;
  /** Подсветка «можно вывести» для кликабельного блока. */
  highlightAction?: boolean;
}) {
  const actionRing = highlightAction
    ? "ring-2 ring-amber-500/45 shadow-[0_0_14px_-4px_rgba(245,158,11,0.35)] dark:ring-amber-400/40"
    : "ring-1 ring-black/[0.05] dark:ring-white/[0.08]";

  if (onQuickAction) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onQuickAction();
        }}
        className={cn(
          "thai-glass rounded-lg border-0 p-2 text-left transition hover:brightness-[1.03] active:scale-[0.99] dark:hover:brightness-110",
          actionRing
        )}
      >
        <Text className="text-xs text-muted-foreground">{label}</Text>
        <Text className={cn("mt-0.5 text-sm font-semibold", valueClass)}>{value}</Text>
      </button>
    );
  }
  return (
    <div className="thai-glass rounded-lg border-0 p-2 ring-1 ring-black/[0.05] dark:ring-white/[0.08]">
      <Text className="text-xs text-muted-foreground">{label}</Text>
      <Text className={cn("mt-0.5 text-sm font-semibold", valueClass)}>{value}</Text>
    </div>
  );
}
