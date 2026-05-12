"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";
import { formatCurrency, cn } from "@/lib/utils";
import { investorsDashboardListQueryKey, investorsDashboardNetworkParam } from "@/lib/investors-query";
import { investorDisplayHandle } from "@/lib/investor-display-handle";
import { getPreviousOrCurrentMonday } from "@/lib/weekly";
import { sumExpectedFullOpenWeekAccrualRounded } from "@/lib/open-week-forecast";
import { parseDeskAmountDigits, deskAmountBackspaceInSuffix, useDeskAmountCursorRestore } from "@/lib/desk-amount-input";
import { DASHBOARD_STICKY_BAR_CLASS } from "@/lib/dashboard-sticky-bar";
import { Container } from "@/components/ui/Container";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import MobileBottomNav from "@/components/navigation/MobileBottomNav";
import { toast } from "@/lib/notify";
import { notifyWithAttention } from "@/lib/attention-notify";
import {
  readNotificationPreferences,
  subscribeNotificationPreferences,
} from "@/lib/notification-preferences";
import {
  InvestorWithdrawalStatusBanner,
  pickLatestWithdrawalRequest,
} from "@/components/dashboard/investor-withdrawal-request-status";
import { DashboardOperationsHistory } from "@/components/dashboard/DashboardOperationsHistory";
import { InvestorPremiumDashboard, type InvestorForecastStrip } from "@/components/dashboard/InvestorPremiumDashboard";
import { DashboardTopbar } from "@/components/dashboard/DashboardTopbar";
import type { OwnerPendingPaymentRow } from "@/components/dashboard/OwnerPendingPaymentsQueue";
import { OwnerPremiumDashboard } from "@/components/dashboard/OwnerPremiumDashboard";
import { InvestorPositionAvatarHeading } from "@/components/dashboard/InvestorPositionAvatarHeading";
type InvestorRow = {
  id: number;
  ownerId?: number;
  name: string;
  handle?: string | null;
  investorUser?: { username: string; avatarUrl?: string | null } | null;
  linkedUser?: { id: number; username: string; avatarUrl?: string | null } | null;
  body: number;
  rate: number;
  accrued: number;
  lifetimeInterestPaid?: number;
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
  const isDark = useSyncExternalStore(subscribeHtmlDark, snapshotHtmlDark, serverHtmlDark);
  const glassCard = isDark ? GLASS_CARD_DARK : GLASS_CARD_LIGHT;
  return (
    <Container>
      <div
        className="thai-dashboard-root min-h-screen space-y-3 py-3 pb-24 md:space-y-5 md:py-8 md:pb-28"
        style={isDark ? DASHBOARD_DARK_ROOT_STYLE : undefined}
      >
        <div className={DASHBOARD_STICKY_BAR_CLASS}>
          <div className="h-11 max-w-[220px] flex-1 rounded-xl bg-muted/45 animate-pulse" />
          <div className="ml-auto flex items-center gap-2">
            <div className="h-10 w-10 rounded-full bg-muted/45 animate-pulse" />
            <div className="h-9 w-[5.5rem] rounded-xl bg-muted/45 animate-pulse" />
          </div>
        </div>
        <div className="thai-glass h-28 animate-pulse" style={glassCard} />
        <div className="thai-glass h-24 animate-pulse" style={glassCard} />
      </div>
    </Container>
  );
}

export default function DashboardPage() {
  const { user, loading: authLoading, refresh: refreshAuth } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedInvestorCardId, setSelectedInvestorCardId] = useState<number | null>(null);
  const [withdrawForm, setWithdrawForm] = useState({
    investorId: "",
    type: "interest" as "interest" | "body" | "close",
    amount: "",
    comment: "",
  });
  const withdrawAmountCursor = useDeskAmountCursorRestore(withdrawForm.amount);
  const onWithdrawAmountKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const hit = deskAmountBackspaceInSuffix(e, withdrawForm.amount);
    if (!hit) return;
    withdrawAmountCursor.armCursor(hit.cursor);
    setWithdrawForm((prev) => ({ ...prev, amount: hit.nextFormatted }));
  };
  const [pageVisible, setPageVisible] = useState(true);
  const [barScrolled, setBarScrolled] = useState(false);
  const notifyPrefs = useSyncExternalStore(
    subscribeNotificationPreferences,
    readNotificationPreferences,
    readNotificationPreferences
  );
  const isDark = useSyncExternalStore(subscribeHtmlDark, snapshotHtmlDark, serverHtmlDark);
  const glassCard = isDark ? GLASS_CARD_DARK : GLASS_CARD_LIGHT;

  const investorsQueryKey = investorsDashboardListQueryKey(user?.role);

  const { data: investorsData, isLoading: loadingInvestors, isError: investorsQueryError } = useQuery({
    queryKey: investorsQueryKey,
    queryFn: () =>
      apiClient.get<{ investors: InvestorRow[] }>(
        `/api/investors?network=${investorsDashboardNetworkParam(user!.role)}&lean=1`
      ),
    enabled: !!user,
    placeholderData: keepPreviousData,
    /**
     * INVESTOR: частый опрос позиции.
     * OWNER: без опроса заявки из другого браузера не появятся (глобально refetchOnWindowFocus: false).
     * Лёгкий lean-список раз в 45 с + обновление при возврате на вкладку.
     */
    refetchInterval:
      user?.role === "INVESTOR" || user?.role === "SUPER_ADMIN"
        ? 30_000
        : user?.role === "OWNER"
          ? 45_000
          : false,
    refetchOnWindowFocus: user?.role === "OWNER",
  });

  const openWeekMondayIso = getPreviousOrCurrentMonday(new Date()).toISOString();
  const needsWeeklyForecastRate =
    user?.role === "INVESTOR" || user?.role === "SUPER_ADMIN" || user?.role === "OWNER";
  const { data: investorBusinessRate } = useQuery({
    queryKey: ["system", "business-rate", openWeekMondayIso] as const,
    queryFn: () =>
      apiClient.get<{ success: boolean; current: { rate: number } | null }>(
        `/api/system/business-rate?at=${encodeURIComponent(openWeekMondayIso)}`
      ),
    enabled: !!user && needsWeeklyForecastRate,
    staleTime: 60_000,
  });

  const investors = useMemo(() => investorsData?.investors ?? [], [investorsData]);
  const myInvestors = useMemo(
    () =>
      user?.role === "SUPER_ADMIN"
        ? investors.filter((inv) => !inv.isPrivate && inv.linkedUserId === user.id)
        : user?.role === "OWNER"
          ? investors.filter((inv) =>
              inv.ownerId != null && user?.id != null ? inv.ownerId === user.id : inv.owner.username === user?.username
            )
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

  const forecastPositions = useMemo(
    () => myInvestors.map((i) => ({ body: i.body, isPrivate: i.isPrivate })),
    [myInvestors]
  );

  const weeklyForecastSumBahtRounded =
    user?.role === "INVESTOR" || user?.role === "SUPER_ADMIN" || user?.role === "OWNER"
      ? sumExpectedFullOpenWeekAccrualRounded(forecastPositions, investorBusinessRate?.current?.rate ?? null)
      : null;

  const bestDueInvestor = useMemo(() => {
    const list = myInvestors.filter((i) => i.due > 0.005);
    if (!list.length) return null;
    return list.reduce((a, b) => (b.due > a.due ? b : a));
  }, [myInvestors]);

  const canRequestWithdraw = bestDueInvestor != null;
  const selectedInvestorCard = useMemo(
    () => myInvestors.find((inv) => inv.id === selectedInvestorCardId) ?? null,
    [myInvestors, selectedInvestorCardId]
  );

  const currentWeek = getCurrentWeek();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const isOwner = user?.role === "OWNER";
  const isInvestor = user?.role === "INVESTOR";

  const buildForecastStrip = useCallback(
    (sum: number | null): InvestorForecastStrip | null => {
      if (sum == null || myInvestors.length === 0 || sum < 1) return null;
      const amt = new Intl.NumberFormat("ru-RU", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(sum);
      return {
        amountPlusBaht: `+${amt} ฿`,
        payoutDate: currentWeek.nextPayout,
      };
    },
    [myInvestors.length, currentWeek.nextPayout]
  );

  const investorForecastStrip = useMemo(
    () =>
      isInvestor || isSuperAdmin ? buildForecastStrip(weeklyForecastSumBahtRounded) : null,
    [isInvestor, isSuperAdmin, buildForecastStrip, weeklyForecastSumBahtRounded]
  );

  const ownerForecastStrip = useMemo(
    () => (isOwner ? buildForecastStrip(weeklyForecastSumBahtRounded) : null),
    [isOwner, buildForecastStrip, weeklyForecastSumBahtRounded]
  );

  const latestInvestorWithdrawalMeta = useMemo(() => {
    if ((!isInvestor && !isSuperAdmin) || investorsQueryError) return null;
    return pickLatestWithdrawalRequest(myInvestors);
  }, [isInvestor, isSuperAdmin, investorsQueryError, myInvestors]);

  const latestWithdrawalInvestorName = useMemo(() => {
    if (!latestInvestorWithdrawalMeta) return undefined;
    return myInvestors.find((i) => i.id === latestInvestorWithdrawalMeta.investorId)?.name;
  }, [latestInvestorWithdrawalMeta, myInvestors]);

  const activeInvestorsCount = useMemo(
    () => myInvestors.filter((i) => i.status === "active").length,
    [myInvestors]
  );

  const ownerPendingPayments = useMemo((): OwnerPendingPaymentRow[] => {
    if (!isOwner) return [];
    const rows: OwnerPendingPaymentRow[] = [];
    for (const inv of myInvestors) {
      for (const p of inv.payments ?? []) {
        if (p.status !== "requested") continue;
        rows.push({
          id: p.id,
          investorId: inv.id,
          investorName: inv.name,
          type: p.type,
          amount: p.amount,
          comment: p.comment,
          createdAt: p.createdAt,
        });
      }
    }
    return rows.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [isOwner, myInvestors]);

  const headlineLine1 = useMemo(() => {
    if (!isOwner) return "";
    return `Моя сеть · ${activeInvestorsCount} активных инвесторов`;
  }, [isOwner, activeInvestorsCount]);

  const paymentStatusRef = useRef<Record<string, string> | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const apply = () => setPageVisible(document.visibilityState === "visible");
    apply();
    document.addEventListener("visibilitychange", apply);
    return () => document.removeEventListener("visibilitychange", apply);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const next = window.scrollY > 10;
      setBarScrolled((prev) => (prev === next ? prev : next));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (user?.role !== "INVESTOR" && user?.role !== "SUPER_ADMIN") return;
    const key = `investor-payment-status-map:${user.id}`;
    const currentMap: Record<string, string> = {};
    for (const inv of myInvestors) {
      for (const p of inv.payments ?? []) currentMap[String(p.id)] = p.status;
    }

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
          notifyWithAttention("success", `Заявка одобрена: ${inv.name}. Откройте «Финансы» для решения.`, notifyPrefs);
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

  const requestWithdrawMutation = useMutation({
    mutationFn: () =>
      apiClient.post("/api/payments", {
        action: "request",
        investorId: Number(withdrawForm.investorId),
        type: withdrawForm.type,
        amount: withdrawForm.type === "close" ? undefined : parseDeskAmountDigits(withdrawForm.amount),
        comment: withdrawForm.comment.trim() || undefined,
      }),
    onSuccess: () => {
      setSelectedInvestorCardId(null);
      setWithdrawForm({
        investorId: "",
        type: "interest",
        amount: "",
        comment: "",
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

  const showDueAction = canRequestWithdraw && stats.due > 0.005;

  return (
    <Container>
      <div
        className={cn(
          "thai-dashboard-root py-4 pb-28 md:py-8 md:pb-28",
          isInvestor || isOwner || isSuperAdmin
            ? "flex min-h-[calc(100dvh-5.5rem)] flex-col space-y-3 md:space-y-4"
            : "min-h-screen space-y-4 md:space-y-5"
        )}
        style={isDark ? DASHBOARD_DARK_ROOT_STYLE : undefined}
      >
        <DashboardTopbar
          barScrolled={barScrolled}
          username={user.username}
          avatarUrl={user.avatarUrl}
          dashboardPositionsActive={myInvestors.some((i) => i.status === "active")}
        />

        {isInvestor || isSuperAdmin ? (
          <InvestorPremiumDashboard
            glassCard={glassCard}
            payoutDue={stats.due}
            canWithdraw={Boolean(showDueAction)}
            onWithdraw={openWithdrawForBestDue}
            statsBody={stats.capital}
            statsAccrued={stats.accrued}
            statsPaid={stats.paid}
            forecastStrip={investorForecastStrip}
            paymentStatusSlot={
              !investorsQueryError && latestInvestorWithdrawalMeta ? (
                <InvestorWithdrawalStatusBanner
                  payment={latestInvestorWithdrawalMeta.payment}
                  investorId={latestInvestorWithdrawalMeta.investorId}
                  investorName={latestWithdrawalInvestorName}
                  onOpenDecision={() =>
                    router.push(
                      `/dashboard/finance?investor=${latestInvestorWithdrawalMeta.investorId}&payment=${latestInvestorWithdrawalMeta.payment.id}`
                    )
                  }
                />
              ) : null
            }
            historySlot={
              <DashboardOperationsHistory
                embedded
                enabled
                glassCard={glassCard}
                showMultiPositionLabels={myInvestors.length > 1}
                superAdminLinkedCommonHome={isSuperAdmin}
                splitPendingActionQueue
                operationRowPredicate={(item) => item.kind === "payment"}
                onOperationClick={(item) => {
                  if (item.kind === "payment") {
                    router.push(`/dashboard/finance?investor=${item.investorId}&payment=${item.paymentId}`);
                    return;
                  }
                  if (item.kind === "topup") {
                    const q = new URLSearchParams();
                    q.set("investor", String(item.investorId));
                    q.set("topup", String(item.requestId));
                    router.push(`/dashboard/finance?${q.toString()}`);
                  }
                }}
              />
            }
          />
        ) : isOwner ? (
          <OwnerPremiumDashboard
            glassCard={glassCard}
            headline={headlineLine1}
            nextPayoutLabel={currentWeek.nextPayout}
            forecastStrip={ownerForecastStrip}
            stats={stats}
            investors={myInvestors}
            pendingPayments={ownerPendingPayments}
            loading={loadingInvestors}
            hasData={Boolean(investorsData)}
            onOpenInvestor={(id) => router.push(`/dashboard/investors/${id}`)}
            onOpenReports={() => router.push("/dashboard/finance")}
            onOpenInvestorReports={(id) => router.push(`/dashboard/finance?investor=${id}`)}
          />
        ) : null}

        {selectedInvestorCard ? (
          <div className="thai-modal-overlay fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="thai-glass w-full max-w-md space-y-4 p-5 shadow-2xl" style={glassCard}>
              <div className="min-w-0">
                <InvestorPositionAvatarHeading
                  name={selectedInvestorCard.name}
                  avatarInitialsSource={investorDisplayHandle(selectedInvestorCard)}
                  avatarUrl={selectedInvestorCard.linkedUser?.avatarUrl ?? selectedInvestorCard.investorUser?.avatarUrl ?? null}
                  status={selectedInvestorCard.status}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <MiniStat label="Тело" value={formatCurrency(selectedInvestorCard.body)} valueStyle={{ color: "var(--thai-color-text-primary)" }} />
                <MiniStat
                  label="Начислено"
                  value={formatCurrency(selectedInvestorCard.accrued)}
                  valueStyle={{ color: "var(--thai-color-accrued)" }}
                />
                <MiniStat
                  label="К выплате"
                  value={formatCurrency(selectedInvestorCard.due)}
                  valueStyle={{ color: "var(--thai-color-due)" }}
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
                      ref={withdrawAmountCursor.inputRef}
                      value={withdrawForm.amount}
                      onChange={(e) =>
                        setWithdrawForm((prev) => ({
                          ...prev,
                          amount: withdrawAmountCursor.captureFromChangeEvent(e),
                        }))
                      }
                      onKeyDown={onWithdrawAmountKeyDown}
                      placeholder="2 500 ฿"
                    />
                    <Text className="text-[11px] text-muted-foreground">
                      Доступно:{" "}
                      <span
                        style={{
                          color:
                            withdrawForm.type === "interest"
                              ? "var(--thai-color-due)"
                              : "var(--thai-color-text-primary)",
                        }}
                      >
                        {withdrawForm.type === "interest"
                          ? formatCurrency(
                              Math.max(
                                selectedInvestorCard.due -
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
                      </span>
                    </Text>
                  </div>
                ) : null}
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
              <div className="thai-glass space-y-2 p-3" style={glassCard}>
                <Text className="text-xs text-muted-foreground">
                  История выплат, запросы на пополнение тела и действия по ним (принять, отклонить, спор) — в разделе «Финансы» для этой позиции.
                </Text>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => router.push(`/dashboard/finance?investor=${selectedInvestorCard.id}`)}
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

function MiniStat({
  label,
  value,
  valueStyle,
  onQuickAction,
  highlightAction,
}: {
  label: string;
  value: string;
  valueStyle?: CSSProperties;
  onQuickAction?: () => void;
  highlightAction?: boolean;
}) {
  const isDark = useSyncExternalStore(subscribeHtmlDark, snapshotHtmlDark, serverHtmlDark);
  const glassStyle = isDark ? GLASS_CARD_DARK : GLASS_CARD_LIGHT;
  const miniGlass: CSSProperties = { ...glassStyle, borderRadius: "12px", padding: "0.5rem" };

  const actionRing = highlightAction
    ? "ring-2 ring-[color:color-mix(in_srgb,var(--thai-color-due)_50%,transparent)] shadow-[0_0_14px_-4px_color-mix(in_srgb,var(--thai-color-due)_35%,transparent)]"
    : "";

  if (onQuickAction) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onQuickAction();
        }}
        className={cn(
          "thai-glass border-0 text-left transition hover:brightness-[1.03] active:scale-[0.99] dark:hover:brightness-110",
          actionRing
        )}
        style={miniGlass}
      >
        <Text className="text-xs text-muted-foreground">{label}</Text>
        <Text className="mt-0.5 text-sm font-semibold" style={valueStyle}>
          {value}
        </Text>
      </button>
    );
  }
  return (
    <div className="thai-glass border-0" style={miniGlass}>
      <Text className="text-xs text-muted-foreground">{label}</Text>
      <Text className="mt-0.5 text-sm font-semibold" style={valueStyle}>
        {value}
      </Text>
    </div>
  );
}
