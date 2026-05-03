"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";
import { formatCurrency, cn } from "@/lib/utils";
import { investorsDashboardListQueryKey, investorsDashboardNetworkParam } from "@/lib/investors-query";
import { getPreviousOrCurrentMonday } from "@/lib/weekly";
import { openWeekDayProgress, sumExpectedOpenWeekAccrualGross } from "@/lib/open-week-forecast";
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
import {
  readNotificationPreferences,
  subscribeNotificationPreferences,
} from "@/lib/notification-preferences";
import {
  getPaymentStatusBlock,
  pickLatestWithdrawalRequest,
} from "@/components/dashboard/investor-withdrawal-request-status";

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
  background: "var(--thai-color-card-bg)",
  backdropFilter: "blur(20px) saturate(180%)",
  WebkitBackdropFilter: "blur(20px) saturate(180%)",
  border: "1px solid var(--thai-color-card-border)",
  boxShadow: "0 4px 32px rgba(0,0,0,0.3), inset 0 1px 0 var(--thai-color-card-border)",
  borderRadius: "16px",
};

const GLASS_CARD_LIGHT: CSSProperties = {
  background: "rgba(255,255,255,0.72)",
  backdropFilter: "blur(20px) saturate(180%)",
  WebkitBackdropFilter: "blur(20px) saturate(180%)",
  border: "1px solid var(--thai-color-card-border)",
  boxShadow: "0 4px 32px rgba(139,92,246,0.08)",
  borderRadius: "16px",
};

const PAYOUT_CARD_STYLE: CSSProperties = {
  background: "linear-gradient(90deg, var(--thai-color-due-bg) 0%, var(--thai-color-card-bg) 100%)",
  border: "1px solid var(--thai-color-card-border)",
  boxShadow: "0 0 24px rgba(251,191,36,0.08)",
  borderRadius: "12px",
  padding: "14px 16px",
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

function countRequestedPayments(rows: InvestorRow[]) {
  let n = 0;
  for (const inv of rows) {
    for (const p of inv.payments ?? []) {
      if (p.status === "requested") n += 1;
    }
  }
  return n;
}

/** Сумма и лимит личной сети SUPER_ADMIN (как в getPrivateInvestorCreateContext). */
function superAdminPrivateNetworkUsedAndLimit(rows: InvestorRow[], username: string, userId: number) {
  const commonCandidates = rows
    .filter((inv) => !inv.isPrivate && inv.linkedUserId === userId)
    .sort((a, b) => b.id - a.id);
  const limit = commonCandidates[0]?.body ?? 0;
  const used = rows
    .filter((inv) => inv.isPrivate && inv.owner.username === username)
    .reduce((sum, inv) => sum + (inv.body || 0), 0);
  return { used, limit };
}

function formatLimitBtc(amount: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(amount) + " ₿";
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

type SuperAdminInvestorFilter = "all" | "common" | "private";

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedInvestorCardId, setSelectedInvestorCardId] = useState<number | null>(null);
  const [withdrawForm, setWithdrawForm] = useState({
    investorId: "",
    type: "interest" as "interest" | "body" | "close",
    amount: "",
    comment: "",
    requestDate: new Date().toISOString().split("T")[0],
  });
  const [pageVisible, setPageVisible] = useState(true);
  const [barScrolled, setBarScrolled] = useState(false);
  const [saInvestorFilter, setSaInvestorFilter] = useState<SuperAdminInvestorFilter>("all");
  const notifyPrefs = useSyncExternalStore(
    subscribeNotificationPreferences,
    readNotificationPreferences,
    readNotificationPreferences
  );
  const isDark = useSyncExternalStore(subscribeHtmlDark, snapshotHtmlDark, serverHtmlDark);
  const glassCard = isDark ? GLASS_CARD_DARK : GLASS_CARD_LIGHT;

  const parseAmountInput = (value: string) => Number(value.replace(/[^\d]/g, ""));
  const formatAmountInput = (value: string) => {
    const amount = parseAmountInput(value);
    if (!amount) return "";
    return `${amount.toLocaleString("ru-RU")} ฿`;
  };

  const investorsQueryKey = investorsDashboardListQueryKey(user?.role);

  const { data: investorsData, isLoading: loadingInvestors, isError: investorsQueryError } = useQuery({
    queryKey: investorsQueryKey,
    queryFn: () =>
      apiClient.get<{ investors: InvestorRow[] }>(
        `/api/investors?network=${investorsDashboardNetworkParam(user!.role)}&lean=1`
      ),
    enabled: !!user,
    placeholderData: keepPreviousData,
    refetchInterval: user?.role === "INVESTOR" ? 30_000 : false,
  });

  const openWeekMondayIso = user?.role === "INVESTOR" ? getPreviousOrCurrentMonday(new Date()).toISOString() : "";
  const { data: investorBusinessRate, isSuccess: investorBusinessRateFetched } = useQuery({
    queryKey: ["system", "business-rate", openWeekMondayIso] as const,
    queryFn: () =>
      apiClient.get<{ success: boolean; current: { rate: number } | null }>(
        `/api/system/business-rate?at=${encodeURIComponent(openWeekMondayIso)}`
      ),
    enabled: !!user && user.role === "INVESTOR",
    staleTime: 60_000,
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

  const investorOpenWeek = openWeekDayProgress();
  const investorForecastGross =
    user?.role === "INVESTOR"
      ? sumExpectedOpenWeekAccrualGross(
          myInvestors.map((i) => ({ body: i.body, isPrivate: i.isPrivate })),
          investorBusinessRate?.current?.rate ?? null
        )
      : null;

  const networkStats = useMemo(() => {
    return investors.reduce(
      (acc, inv) => ({
        capital: acc.capital + (inv.body || 0),
        accrued: acc.accrued + (inv.accrued || 0),
        paid: acc.paid + (inv.paid || 0),
        due: acc.due + (inv.due || 0),
      }),
      { capital: 0, accrued: 0, paid: 0, due: 0 }
    );
  }, [investors]);

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

  const latestInvestorWithdrawalRequest = useMemo(() => {
    if (!isInvestor || investorsQueryError) return null;
    return pickLatestWithdrawalRequest(myInvestors);
  }, [isInvestor, investorsQueryError, myInvestors]);

  const activeInvestorsCount = useMemo(
    () => myInvestors.filter((i) => i.status === "active").length,
    [myInvestors]
  );

  const pendingApprovalsCount = useMemo(() => {
    if (isOwner) return countRequestedPayments(myInvestors);
    if (isSuperAdmin) return countRequestedPayments(investors);
    return 0;
  }, [isOwner, isSuperAdmin, myInvestors, investors]);

  const superAdminFilteredInvestors = useMemo(() => {
    if (!isSuperAdmin) return [];
    if (saInvestorFilter === "common") return investors.filter((i) => !i.isPrivate);
    if (saInvestorFilter === "private") return investors.filter((i) => i.isPrivate);
    return investors;
  }, [isSuperAdmin, investors, saInvestorFilter]);

  const superAdminPrivateLimitCard = useMemo(() => {
    if (!isSuperAdmin || !user) return null;
    const { used, limit } = superAdminPrivateNetworkUsedAndLimit(investors, user.username, user.id);
    const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
    const free = Math.max(0, limit - used);
    const barBg =
      percent > 80
        ? "linear-gradient(90deg,#ef4444,#f97316)"
        : percent > 50
          ? "linear-gradient(90deg,#f59e0b,var(--thai-color-due))"
          : "linear-gradient(90deg,#7c3aed,#a78bfa)";
    const barShadow = percent > 80 ? "0 0 8px rgba(239,68,68,0.5)" : "0 0 8px rgba(124,58,237,0.4)";
    const footerColor = percent > 80 ? "var(--thai-color-rejected)" : percent > 50 ? "var(--thai-color-due)" : "#a78bfa";
    const footerText =
      percent > 80
        ? "⚠ Лимит почти исчерпан"
        : percent > 50
          ? "Использовано больше половины"
          : "Свободно: " + formatLimitBtc(free);
    return (
      <div
        style={{
          background: "rgba(124,58,237,0.08)",
          border: "1px solid rgba(124,58,237,0.25)",
          borderRadius: 14,
          padding: "14px 16px",
          marginBottom: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "var(--thai-color-text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            Лимит личной сети
          </div>
          <div style={{ fontSize: 12, color: "var(--thai-color-text-secondary)" }}>
            {formatLimitBtc(used)} из {formatLimitBtc(limit)}
          </div>
        </div>
        <div
          style={{
            height: 6,
            borderRadius: 3,
            background: "var(--thai-color-card-bg)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${percent}%`,
              borderRadius: 3,
              background: barBg,
              transition: "width 0.6s ease",
              boxShadow: barShadow,
            }}
          />
        </div>
        <div style={{ fontSize: 12, marginTop: 8, color: footerColor }}>{footerText}</div>
      </div>
    );
  }, [isSuperAdmin, user, investors]);

  const headlineLine1 = useMemo(() => {
    if (isInvestor) {
      return `Мой кабинет · Неделя ${currentWeek.start} — ${currentWeek.end}`;
    }
    if (isOwner) {
      return `Моя сеть · ${activeInvestorsCount} активных инвесторов`;
    }
    if (isSuperAdmin) {
      return `Общая сеть · ${investors.length} инвесторов · Следующая выплата ${currentWeek.nextPayout}`;
    }
    return "";
  }, [isInvestor, isOwner, isSuperAdmin, currentWeek, activeInvestorsCount, investors.length]);

  const paymentStatusRef = useRef<Record<string, string> | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const apply = () => setPageVisible(document.visibilityState === "visible");
    apply();
    document.addEventListener("visibilitychange", apply);
    return () => document.removeEventListener("visibilitychange", apply);
  }, []);

  useEffect(() => {
    const onScroll = () => setBarScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (user?.role !== "INVESTOR") return;
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

  const showDueAction = canRequestWithdraw && stats.due > 0.005;
  const showPendingAction = (isOwner || isSuperAdmin) && pendingApprovalsCount > 0;

  const displayStats = isSuperAdmin ? networkStats : stats;

  const weekStripDay = new Date().getDay();
  const currentDayIndex = weekStripDay === 0 ? 6 : weekStripDay - 1;
  const nextPaymentDate =
    currentWeek.nextPayout.replace(/^\S+\s*/, "").trim() || currentWeek.nextPayout;

  return (
    <Container>
      <div
        className="thai-dashboard-root min-h-screen space-y-4 py-4 pb-28 md:space-y-5 md:py-8 md:pb-28"
        style={isDark ? DASHBOARD_DARK_ROOT_STYLE : undefined}
      >
        <div className={cn(DASHBOARD_STICKY_BAR_CLASS, barScrolled && "thai-bar-scrolled")}>
          <button
            type="button"
            onClick={() => router.push("/dashboard/profile")}
            className="thai-glass flex min-w-0 items-center gap-2 px-2.5 py-1.5 transition hover:brightness-[1.03] dark:hover:brightness-110"
            style={glassCard}
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

        <section className="thai-glass p-3 md:p-4" style={glassCard}>
          <h1 className="text-base font-bold leading-snug tracking-tight md:text-lg">{headlineLine1}</h1>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 0",
              fontSize: 12,
              color: "var(--thai-color-text-muted)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                flex: 1,
              }}
            >
              {(["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"] as const).map((day, i) => {
                const isPast = i < currentDayIndex;
                const isCurrent = i === currentDayIndex;
                return (
                  <div
                    key={day}
                    style={{
                      flex: 1,
                      textAlign: "center",
                      fontSize: 10,
                      fontWeight: isCurrent ? 600 : 400,
                      color: isCurrent
                        ? "#a78bfa"
                        : isPast
                          ? "var(--thai-color-text-secondary)"
                          : "var(--thai-color-text-muted)",
                      position: "relative",
                      paddingBottom: 6,
                    }}
                  >
                    {day}
                    {isCurrent ? (
                      <div
                        style={{
                          position: "absolute",
                          bottom: 0,
                          left: "50%",
                          transform: "translateX(-50%)",
                          width: 4,
                          height: 4,
                          borderRadius: "50%",
                          background: "#a78bfa",
                          boxShadow: "0 0 6px #a78bfa",
                        }}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--thai-color-text-muted)",
                whiteSpace: "nowrap",
                marginLeft: 12,
              }}
            >
              Выплата ПН {nextPaymentDate}
            </div>
          </div>
        </section>

        {isInvestor ? (
          <div className="grid gap-2">
            <StatTile primary title="Баланс" value={stats.capital} className="w-full" />
            <div className="grid grid-cols-2 gap-2">
              <StatTile
                title="Начислено"
                value={stats.accrued}
                valueClassName="text-lg md:text-xl"
                valueStyle={{ color: "var(--thai-color-accrued)" }}
              />
              <StatTile
                title="Выплачено"
                value={stats.paid}
                valueClassName="text-lg md:text-xl"
                valueStyle={{ color: "var(--thai-color-paid)" }}
              />
            </div>
            {investorForecastGross != null && myInvestors.length > 0 ? (
              <Text className="text-[11px] leading-snug text-muted-foreground">
                Ожидается за текущую неделю (прогноз, до выплат): ≈ +
                {investorForecastGross.toLocaleString("ru-RU", {
                  maximumFractionDigits: 2,
                  minimumFractionDigits: 0,
                })}{" "}
                ฿ · дней {investorOpenWeek.daySpan}/7
              </Text>
            ) : investorBusinessRateFetched && investorBusinessRate?.current == null && myInvestors.length > 0 ? (
              <Text className="text-[11px] leading-snug text-muted-foreground">
                Ставка сети пока не задана — прогноз за неделю не считается.
              </Text>
            ) : null}
          </div>
        ) : isOwner ? (
          <div className="grid gap-2">
            <StatTile primary title="Тело в сети" value={stats.capital} className="w-full" />
            <div className="grid grid-cols-2 gap-2">
              <StatTile
                title="Начислено"
                value={stats.accrued}
                valueClassName="text-lg md:text-xl"
                valueStyle={{ color: "var(--thai-color-accrued)" }}
              />
              <StatTile
                title="Выплачено"
                value={stats.paid}
                valueClassName="text-lg md:text-xl"
                valueStyle={{ color: "var(--thai-color-paid)" }}
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <StatTile primary title="Тело в сети" value={displayStats.capital} className="col-span-2" />
            <StatTile
              title="Начислено"
              value={displayStats.accrued}
              valueClassName="text-lg md:text-xl"
              valueStyle={{ color: "var(--thai-color-accrued)" }}
            />
            <StatTile
              title="Выплачено"
              value={displayStats.paid}
              valueClassName="text-lg md:text-xl"
              valueStyle={{ color: "var(--thai-color-paid)" }}
            />
            <StatTile
              title="К выплате"
              value={displayStats.due}
              valueClassName="text-lg md:text-xl"
              valueStyle={{ color: "var(--thai-color-due)" }}
            />
          </div>
        )}

        {superAdminPrivateLimitCard}

        {showDueAction ? (
          <button
            type="button"
            onClick={openWithdrawForBestDue}
            className="thai-row-interactive w-full text-left"
            style={PAYOUT_CARD_STYLE}
          >
              <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              <span className="text-sm font-semibold" style={{ color: "var(--thai-color-due)" }}>
                К выплате: {formatCurrency(stats.due)}
              </span>
              <span
                className="text-sm font-semibold"
                style={{
                  color: "var(--thai-color-due)",
                  textDecoration: "underline",
                  textUnderlineOffset: "3px",
                  transition: "opacity 0.15s ease",
                }}
              >
                Вывести →
              </span>
            </span>
          </button>
        ) : null}

        {showPendingAction ? (
          <button
            type="button"
            onClick={() => router.push("/dashboard/reports")}
            className="thai-row-interactive thai-glass w-full p-3 text-left"
            style={glassCard}
          >
            <Text className="text-sm font-semibold text-foreground">
              {pendingApprovalsCount} заявок ожидают → Рассмотреть
            </Text>
          </button>
        ) : null}

        {isInvestor && !investorsQueryError && latestInvestorWithdrawalRequest
          ? getPaymentStatusBlock(latestInvestorWithdrawalRequest)
          : null}

        {isInvestor ? (
          <section className="space-y-2">
            <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Мои позиции</Text>
            {loadingInvestors && !investorsData ? (
              <div className="space-y-2.5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="thai-glass animate-pulse p-3"
                    style={glassCard}
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
              <Text className="block py-6 text-center text-sm text-muted-foreground">
                Позиций пока нет. Обратитесь к владельцу сети.
              </Text>
            ) : (
              <div className="space-y-2.5">
                {myInvestors.map((inv) => (
                  <div
                    key={inv.id}
                    onClick={() => router.push(`/dashboard/investors/${inv.id}`)}
                    className="thai-row-interactive thai-glass w-full cursor-pointer border-0 p-3 text-left"
                    style={glassCard}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Text className="font-semibold tracking-tight">{inv.name}</Text>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
                      <MiniStat label="Тело" value={formatCurrency(inv.body)} valueStyle={{ color: "var(--thai-color-text-primary)" }} />
                      <MiniStat label="Начислено" value={formatCurrency(inv.accrued)} valueStyle={{ color: "var(--thai-color-accrued)" }} />
                      <MiniStat label="Выплачено" value={formatCurrency(inv.paid)} valueStyle={{ color: "var(--thai-color-paid)" }} />
                      <MiniStat
                        label="К выплате"
                        value={formatCurrency(inv.due)}
                        valueStyle={{ color: "var(--thai-color-due)" }}
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
          </section>
        ) : isOwner ? (
          <section className="space-y-2">
            <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Инвесторы в сети</Text>
            {loadingInvestors && !investorsData ? (
              <div className="space-y-2.5">
                {[0, 1].map((i) => (
                  <div key={i} className="thai-glass animate-pulse p-3" style={glassCard}>
                    <div className="h-4 w-36 rounded-md bg-muted/45" />
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {[0, 1, 2].map((j) => (
                        <div key={j} className="h-10 rounded-lg bg-muted/30" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : myInvestors.length === 0 ? (
              <Text className="block py-6 text-center text-sm text-muted-foreground">
                В общей сети пока нет инвесторов. Добавьте первого в разделе «Управление».
              </Text>
            ) : (
              <div className="space-y-2.5">
                {myInvestors.map((inv) => (
                  <button
                    key={inv.id}
                    type="button"
                    onClick={() => router.push(`/dashboard/investors/${inv.id}`)}
                    className="thai-row-interactive thai-glass w-full border-0 p-3 text-left"
                    style={glassCard}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Text className="font-semibold tracking-tight">{inv.name}</Text>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-left">
                      <div>
                        <Text className="text-xs text-muted-foreground">Тело</Text>
                        <Text className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: "var(--thai-color-text-primary)" }}>
                          {formatCurrency(inv.body)}
                        </Text>
                      </div>
                      <div>
                        <Text className="text-xs text-muted-foreground">Начислено</Text>
                        <Text className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: "var(--thai-color-accrued)" }}>
                          {formatCurrency(inv.accrued)}
                        </Text>
                      </div>
                      <div>
                        <Text className="text-xs text-muted-foreground">К выплате</Text>
                        <Text className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: "var(--thai-color-due)" }}>
                          {formatCurrency(inv.due)}
                        </Text>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="space-y-2">
            <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Инвесторы</Text>
            <div className="thai-segmented" role="tablist" aria-label="Фильтр инвесторов">
              {(
                [
                  { key: "all" as const, label: "Все" },
                  { key: "common" as const, label: "Общая" },
                  { key: "private" as const, label: "Приватная" },
                ] as const
              ).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={saInvestorFilter === key}
                  onClick={() => setSaInvestorFilter(key)}
                  className={cn("thai-segmented-item", saInvestorFilter === key && "active")}
                >
                  {label}
                </button>
              ))}
            </div>
            {loadingInvestors && !investorsData ? (
              <div className="space-y-2.5">
                {[0, 1].map((i) => (
                  <div key={i} className="thai-glass animate-pulse p-3" style={glassCard}>
                    <div className="h-4 w-36 rounded-md bg-muted/45" />
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {[0, 1, 2].map((j) => (
                        <div key={j} className="h-10 rounded-lg bg-muted/30" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : superAdminFilteredInvestors.length === 0 ? (
              <Text className="block py-6 text-center text-sm text-muted-foreground">Нет позиций в выбранном фильтре.</Text>
            ) : (
              <div className="space-y-2.5">
                {superAdminFilteredInvestors.map((inv) => (
                  <button
                    key={inv.id}
                    type="button"
                    onClick={() => router.push(`/dashboard/investors/${inv.id}`)}
                    className="thai-row-interactive thai-glass w-full border-0 p-3 text-left"
                    style={glassCard}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Text className="font-semibold tracking-tight">{inv.name}</Text>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-left">
                      <div>
                        <Text className="text-xs text-muted-foreground">Тело</Text>
                        <Text className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: "var(--thai-color-text-primary)" }}>
                          {formatCurrency(inv.body)}
                        </Text>
                      </div>
                      <div>
                        <Text className="text-xs text-muted-foreground">Начислено</Text>
                        <Text className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: "var(--thai-color-accrued)" }}>
                          {formatCurrency(inv.accrued)}
                        </Text>
                      </div>
                      <div>
                        <Text className="text-xs text-muted-foreground">К выплате</Text>
                        <Text className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: "var(--thai-color-due)" }}>
                          {formatCurrency(inv.due)}
                        </Text>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {selectedInvestorCard ? (
          <div className="thai-modal-overlay fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="thai-glass w-full max-w-md space-y-4 p-5 shadow-2xl" style={glassCard}>
              <div className="flex items-center justify-between">
                <Text className="text-base font-semibold">{selectedInvestorCard.name}</Text>
                <Text className="text-xs text-muted-foreground">{selectedInvestorCard.status}</Text>
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
                      value={withdrawForm.amount}
                      onChange={(e) => setWithdrawForm((prev) => ({ ...prev, amount: formatAmountInput(e.target.value) }))}
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
                      </span>
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
              <div className="thai-glass space-y-2 p-3" style={glassCard}>
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

function StatTile({
  title,
  value,
  valueClassName,
  valueStyle,
  className,
  primary,
}: {
  title: string;
  value: number;
  valueClassName?: string;
  valueStyle?: CSSProperties;
  className?: string;
  primary?: boolean;
}) {
  const isDark = useSyncExternalStore(subscribeHtmlDark, snapshotHtmlDark, serverHtmlDark);
  const glassStyle = isDark ? GLASS_CARD_DARK : GLASS_CARD_LIGHT;

  if (primary) {
    const primaryStyle: CSSProperties = {
      ...glassStyle,
      background: `linear-gradient(135deg, rgba(109,40,217,0.2) 0%, var(--thai-color-card-bg) 100%), ${
        isDark ? "var(--thai-color-card-bg)" : "rgba(255,255,255,0.65)"
      }`,
    };
    return (
      <div className={cn("thai-stat-tile thai-glass thai-stat-primary", className)} style={primaryStyle}>
        <span
          className="thai-stat-label"
          style={{
            fontSize: "0.6rem",
            letterSpacing: "0.18em",
            opacity: 0.45,
            textTransform: "uppercase",
          }}
        >
          {title}
        </span>
        <span
          className={cn("tabular-nums block", valueClassName)}
          style={{
            fontSize: "2.8rem",
            fontWeight: 300,
            letterSpacing: "-0.02em",
            lineHeight: 1,
            ...valueStyle,
            color: "var(--thai-color-text-primary)",
          }}
        >
          {formatCurrency(value)}
        </span>
      </div>
    );
  }
  return (
    <div className={cn("thai-stat-tile thai-glass", className)} style={glassStyle}>
      <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</Text>
      <div className={cn("mt-1 tabular-nums font-bold tracking-tight", valueClassName)} style={valueStyle}>
        {formatCurrency(value)}
      </div>
    </div>
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
