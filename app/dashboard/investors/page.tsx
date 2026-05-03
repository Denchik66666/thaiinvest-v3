"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { Container } from "@/components/ui/Container";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import MobileBottomNav from "@/components/navigation/MobileBottomNav";
import { UserAvatar } from "@/components/user/UserAvatar";
import NotificationBell from "@/components/notifications/NotificationBell";
import { InvestorsTable } from "@/components/investors/InvestorsTable";
import { apiClient } from "@/lib/api-client";
import { formatCurrency, cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { DASHBOARD_STICKY_BAR_CLASS } from "@/lib/dashboard-sticky-bar";
import ThemeToggle from "@/components/ThemeToggle";
import type { PrivateInvestorCreateContext } from "@/lib/private-investor-create-context";

type Network = "all" | "common" | "private";

type PaymentRow = {
  id: number;
  type: string;
  amount: number;
  status: string;
};

export type InvestorListRow = {
  id: number;
  name: string;
  handle: string | null;
  phone: string | null;
  body: number;
  rate: number;
  accrued: number;
  paid: number;
  due: number;
  entryDate: string;
  activationDate: string;
  status: string;
  isPrivate: boolean;
  owner: { id: number; username: string; role: string };
  investorUser?: { id: number; username: string } | null;
  payments: PaymentRow[];
};

type InvestorsApiResponse = { investors: InvestorListRow[] };

function getCurrentWeekLabel() {
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

function hasPendingPayment(inv: InvestorListRow) {
  return inv.payments.some((p) => p.status === "pending");
}

function needsAttention(inv: InvestorListRow) {
  if (inv.status === "awaiting_activation") return true;
  if (inv.status === "paused" && inv.accrued > 0.005) return true;
  if (hasPendingPayment(inv)) return true;
  return false;
}

function parseYmd(s: string) {
  const d = new Date(s);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export default function InvestorsListPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [network, setNetwork] = useState<Network>("all");
  const [search, setSearch] = useState("");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [includeClosed, setIncludeClosed] = useState(false);
  const [entryFrom, setEntryFrom] = useState("");
  const [entryTo, setEntryTo] = useState("");
  const [sort, setSort] = useState<
    "body_desc" | "accrued_desc" | "due_desc" | "name_asc" | "activation_desc"
  >("due_desc");

  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const isOwner = user?.role === "OWNER";
  const canManageList = isSuperAdmin || isOwner;

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!authLoading && user?.role === "INVESTOR") {
      router.replace("/dashboard/finance");
    }
  }, [authLoading, user, router]);

  /** OWNER: `common` совпадает с дашбордом/колокольчиком → общий кэш React Query. */
  const networkParam = isSuperAdmin ? network : "common";

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["investors", networkParam, "summary"],
    queryFn: () =>
      apiClient.get<InvestorsApiResponse>(
        `/api/investors?network=${encodeURIComponent(networkParam)}&lean=1`
      ),
    enabled: !!user && canManageList,
    placeholderData: keepPreviousData,
  });

  const { data: privateCtxData } = useQuery({
    queryKey: ["investors-private-create-context"],
    queryFn: () =>
      apiClient.get<{ success: boolean; context: PrivateInvestorCreateContext }>(
        "/api/investors/private-create-context"
      ),
    enabled: !!user && isSuperAdmin && data?.investors != null,
    staleTime: 10 * 60 * 1000,
  });

  const filteredSorted = useMemo(() => {
    const rawList = data?.investors ?? [];
    let list = rawList;

    if (attentionOnly) {
      list = list.filter(needsAttention);
    }

    if (!includeClosed) {
      list = list.filter((inv) => inv.status !== "closed");
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((inv) => {
        const hay = [
          inv.name,
          inv.owner.username,
          inv.handle ?? "",
          inv.phone ?? "",
          inv.investorUser?.username ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    if (entryFrom) {
      const t = parseYmd(entryFrom);
      list = list.filter((inv) => parseYmd(inv.entryDate.split("T")[0]) >= t);
    }
    if (entryTo) {
      const t = parseYmd(entryTo);
      list = list.filter((inv) => parseYmd(inv.entryDate.split("T")[0]) <= t);
    }

    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sort === "body_desc") return b.body - a.body;
      if (sort === "accrued_desc") return b.accrued - a.accrued;
      if (sort === "due_desc") return b.due - a.due;
      if (sort === "name_asc") return a.name.localeCompare(b.name, "ru");
      return parseYmd(b.activationDate.split("T")[0]) - parseYmd(a.activationDate.split("T")[0]);
    });
    return sorted;
  }, [data?.investors, attentionOnly, includeClosed, search, entryFrom, entryTo, sort]);

  const kpis = useMemo(() => {
    const active = filteredSorted.filter((i) => i.status === "active").length;
    const body = filteredSorted.reduce((s, i) => s + i.body, 0);
    const accrued = filteredSorted.reduce((s, i) => s + i.accrued, 0);
    const paid = filteredSorted.reduce((s, i) => s + i.paid, 0);
    const due = filteredSorted.reduce((s, i) => s + i.due, 0);
    const awaiting = filteredSorted.filter((i) => i.status === "awaiting_activation").length;
    const attention = filteredSorted.filter(needsAttention).length;
    return { active, body, accrued, paid, due, awaiting, attention, count: filteredSorted.length };
  }, [filteredSorted]);

  const week = useMemo(() => getCurrentWeekLabel(), []);

  const privateCtx = privateCtxData?.context;

  if (authLoading || !user) {
    return (
      <Container>
        <div className="thai-dashboard-root min-h-screen space-y-3 py-4 pb-28">
          <div className="h-11 rounded-xl bg-muted/40 animate-pulse" />
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="thai-glass h-16 rounded-xl animate-pulse bg-muted/15" />
            ))}
          </div>
          <div className="thai-glass h-32 rounded-2xl animate-pulse bg-muted/15" />
          <div className="thai-glass h-64 rounded-2xl animate-pulse bg-muted/15" />
        </div>
      </Container>
    );
  }

  if (!canManageList) {
    return null;
  }

  const networkSubtitle =
    network === "all"
      ? "Все сети (только для вас)"
      : network === "common"
        ? "Общая сеть Семёна"
        : "Личная сеть";

  return (
    <Container>
      <div className="thai-dashboard-root min-h-screen space-y-3 py-3 pb-24 md:space-y-5 md:py-8 md:pb-28">
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

        <div className="thai-glass flex flex-col gap-2 rounded-2xl p-2.5 md:p-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="thai-hero-accent mb-2" aria-hidden />
            <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Инвесторы</Text>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Список позиций</h1>
            <Text className="mt-1 text-sm text-muted-foreground">
              {isSuperAdmin ? networkSubtitle : "Общая сеть"} · цикл {week.start}–{week.end}, выплата {week.nextPayout}
            </Text>
          </div>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            <Button size="sm" variant="outline" onClick={() => router.push("/dashboard/manage")}>
              Управление и ставка
            </Button>
            <Button size="sm" onClick={() => router.push("/dashboard/manage")}>
              Добавить инвестора
            </Button>
          </div>
        </div>

        {isSuperAdmin ? (
          <div className="thai-glass flex flex-wrap gap-1.5 rounded-2xl p-2.5 md:p-4">
            <Text className="w-full text-xs font-semibold text-muted-foreground">Сеть</Text>
            {(
              [
                ["all", "Все"],
                ["common", "Общая"],
                ["private", "Личная"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setNetwork(key)}
                className={cn(
                  "rounded-full border px-2.5 py-1.5 text-xs font-medium transition-all duration-200 md:px-3 md:text-sm",
                  network === key
                    ? "border-primary bg-primary/15 text-foreground shadow-sm"
                    : "border-border/70 text-muted-foreground hover:bg-muted/40"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}

        {isSuperAdmin && privateCtx && privateCtx.ok ? (
          <div className="thai-glass space-y-2 rounded-2xl border border-purple-500/20 bg-purple-500/[0.06] p-2.5 md:p-4 dark:bg-purple-500/10">
            <Text className="text-xs font-semibold text-muted-foreground">Лимит личной сети</Text>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Text className="text-sm">
                Позиция у Семёна:{" "}
                <span className="font-semibold">{privateCtx.commonInvestorName}</span> —{" "}
                <span className="font-semibold">{formatCurrency(privateCtx.commonBody)}</span>
              </Text>
              <Text className="text-sm text-muted-foreground">
                В личной сети: {formatCurrency(privateCtx.privateBodiesTotal)} · свободно:{" "}
                <span
                  className={cn(
                    "font-semibold",
                    privateCtx.remainingForPrivate < 1 ? "text-amber-600 dark:text-amber-400" : "text-foreground"
                  )}
                >
                  {formatCurrency(privateCtx.remainingForPrivate)}
                </span>
              </Text>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-purple-500 to-violet-500 transition-all"
                style={{
                  width: `${Math.min(100, privateCtx.commonBody > 0 ? (privateCtx.privateBodiesTotal / privateCtx.commonBody) * 100 : 0)}%`,
                }}
              />
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2 lg:grid-cols-4 xl:grid-cols-7">
          <Kpi title="В списке" value={String(kpis.count)} />
          <Kpi title="Активных" value={String(kpis.active)} />
          <Kpi title="Внимание" value={String(kpis.attention)} accent="thai-text-metric-warn" />
          <Kpi title="Сумма тел" value={formatCurrency(kpis.body)} />
          <Kpi title="Начислено" value={formatCurrency(kpis.accrued)} accent="thai-text-metric-info" />
          <Kpi title="Выплачено" value={formatCurrency(kpis.paid)} accent="thai-text-metric-ok" />
          <Kpi title="К выплате" value={formatCurrency(kpis.due)} accent="thai-text-metric-warn" />
        </div>
        {kpis.awaiting > 0 ? (
          <Text className="text-xs text-amber-700 dark:text-amber-300">
            Ожидают активации: {kpis.awaiting} — проверьте даты входа и ближайший понедельник.
          </Text>
        ) : null}

        <div className="thai-glass space-y-2 rounded-2xl p-2.5 md:p-4">
          <div className="grid gap-3 md:grid-cols-12 md:items-end">
            <div className="md:col-span-4">
              <Text className="mb-1 text-xs font-medium text-muted-foreground">Поиск</Text>
              <Input
                placeholder="Имя, телефон, @handle, владелец…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="md:col-span-3">
              <Text className="mb-1 text-xs font-medium text-muted-foreground">Сортировка</Text>
              <select
                className="flex h-9 w-full rounded-lg border border-border/70 bg-background px-2.5 text-sm"
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
              >
                <option value="due_desc">К выплате (сначала больше)</option>
                <option value="body_desc">Тело (по убыванию)</option>
                <option value="accrued_desc">Начислено (по убыванию)</option>
                <option value="activation_desc">Дата активации</option>
                <option value="name_asc">Имя (А–Я)</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <Text className="mb-1 text-xs font-medium text-muted-foreground">Вход с</Text>
              <Input type="date" value={entryFrom} onChange={(e) => setEntryFrom(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Text className="mb-1 text-xs font-medium text-muted-foreground">Вход по</Text>
              <Input type="date" value={entryTo} onChange={(e) => setEntryTo(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2 md:col-span-12">
              <Button
                size="sm"
                variant={attentionOnly ? "primary" : "outline"}
                onClick={() => setAttentionOnly((v) => !v)}
              >
                Требуют внимания
              </Button>
              <Button
                size="sm"
                variant={includeClosed ? "primary" : "outline"}
                onClick={() => setIncludeClosed((v) => !v)}
              >
                Закрытые
              </Button>
            </div>
          </div>
        </div>

        {isLoading && !data ? (
          <div className="thai-glass space-y-2 rounded-2xl p-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 rounded-lg bg-muted/25 animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="thai-glass rounded-2xl border-destructive/35 p-4">
            <Text className="text-sm text-destructive">
              {error instanceof Error ? error.message : "Не удалось загрузить инвесторов"}
            </Text>
            <Button className="mt-3" variant="outline" size="sm" onClick={() => router.refresh()}>
              Обновить
            </Button>
          </div>
        ) : (
          <div className="relative">
            {isFetching && data ? (
              <div
                className="pointer-events-none absolute right-2 top-0 z-10 flex items-center gap-1.5 text-[11px] text-muted-foreground"
                aria-live="polite"
              >
                <span className="inline-block h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
                Обновление…
              </div>
            ) : null}
            <InvestorsTable
              investors={filteredSorted}
              onOpenInvestor={(id) => router.push(`/dashboard/investors/${id}`)}
              showNetwork={isSuperAdmin}
            />
          </div>
        )}

        <MobileBottomNav active="investors" />
      </div>
    </Container>
  );
}

function Kpi({ title, value, accent }: { title: string; value: string; accent?: string }) {
  return (
    <div className="thai-glass thai-stat-tile border-border/35 px-2.5 py-2 md:px-3 md:py-2.5">
      <Text className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground leading-tight">
        {title}
      </Text>
      <Text className={cn("mt-0.5 text-sm font-semibold tabular-nums leading-tight md:text-base", accent)}>
        {value}
      </Text>
    </div>
  );
}
