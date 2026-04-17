"use client";

import { useMemo, useState, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";

import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { DatePicker } from "@/components/ui/DatePicker";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import NotificationBell from "@/components/notifications/NotificationBell";
import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils";
import MobileBottomNav from "@/components/navigation/MobileBottomNav";
import { DASHBOARD_STICKY_BAR_CLASS } from "@/lib/dashboard-sticky-bar";
import {
  dedupeBusinessRateHistory,
  formatRuDate,
  pastRecentMilestones,
  type BusinessRateHistoryRow,
} from "@/lib/business-rate-history-display";
import { persistAppTheme } from "@/lib/app-theme";

type PaymentRow = {
  id: number;
  type: "interest" | "body" | "close";
  amount: number;
  status: string;
  comment?: string | null;
  createdAt: string;
};

type EnrichedPaymentRow = PaymentRow & {
  investorId: number;
  investorName: string;
  linkedUserId?: number | null;
  investorUserId?: number | null;
  isPrivate?: boolean;
};

type InvestorRow = {
  id: number;
  name: string;
  isPrivate: boolean;
  body: number;
  accrued: number;
  due: number;
  paid: number;
  linkedUserId?: number | null;
  investorUserId?: number | null;
  payments?: PaymentRow[];
};

type BodyTopUpRequestRow = {
  id: number;
  amount: number;
  status: string;
  comment?: string | null;
  createdAt: string;
  decidedAt?: string | null;
  investor: {
    id: number;
    name: string;
    body: number;
    linkedUserId?: number | null;
    investorUserId?: number | null;
    isPrivate?: boolean;
  };
  createdBy: { id: number; username: string; role: string };
  decidedBy?: { id: number; username: string; role: string } | null;
};

type AuditRow = {
  id: number;
  action: string;
  entityType: string;
  entityId: number;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  user: { username: string; role: string };
};

type ReportsFeedResponse = {
  success: boolean;
  rateHistory: BusinessRateHistoryRow[];
  auditLog: AuditRow[];
  bodyTopUps: BodyTopUpRequestRow[];
};

function userCanDecideBodyTopUp(userId: number | undefined, item: BodyTopUpRequestRow): boolean {
  if (userId == null) return false;
  const inv = item.investor;
  if (inv.investorUserId === userId) return true;
  if (!inv.isPrivate && inv.linkedUserId === userId) return true;
  return false;
}

function userCanDecideInvestorPayment(userId: number | undefined, row: EnrichedPaymentRow): boolean {
  if (userId == null) return false;
  if (row.investorUserId === userId) return true;
  if (!row.isPrivate && row.linkedUserId === userId) return true;
  return false;
}

function chipToneByCount(count: number) {
  if (count <= 0) return "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (count <= 3) return "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-red-500/35 bg-red-500/10 text-red-700 dark:text-red-300";
}

function queueSubtitleByCount(count: number, emptyLabel: string) {
  if (count <= 0) return `🟢 ${emptyLabel}`;
  if (count <= 3) return `🟡 ${count} ожидают решения`;
  return `🔴 ${count} ожидают решения`;
}

function ReportsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const investorFilter = searchParams.get("investor");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const toggleDarkMode = () => {
    const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
    persistAppTheme("theme-linear", !isDark);
  };

  const network = user?.role === "OWNER" ? "common" : "all";
  const { data } = useQuery({
    queryKey: ["reports-investors", network],
    queryFn: () => apiClient.get<{ investors: InvestorRow[] }>(`/api/investors?network=${network}`),
    enabled: !!user,
  });

  const { data: feed, isPending: feedPending } = useQuery({
    queryKey: ["reports-feed"],
    queryFn: () => apiClient.get<ReportsFeedResponse>("/api/reports/feed"),
    enabled: !!user,
  });

  const investors = useMemo(() => data?.investors ?? [], [data]);
  const allPaymentRows = useMemo(() => {
    const rows: EnrichedPaymentRow[] = [];
    for (const inv of investors) {
      for (const p of inv.payments ?? []) {
        rows.push({
          ...p,
          investorId: inv.id,
          investorName: inv.name,
          linkedUserId: inv.linkedUserId,
          investorUserId: inv.investorUserId,
          isPrivate: inv.isPrivate,
        });
      }
    }
    return rows.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [investors]);

  const paymentRows = useMemo(() => {
    const start = from ? new Date(`${from}T00:00:00`) : null;
    const end = to ? new Date(`${to}T23:59:59`) : null;
    return allPaymentRows.filter((p) => {
      const created = new Date(p.createdAt);
      if (start && created < start) return false;
      if (end && created > end) return false;
      return true;
    });
  }, [allPaymentRows, from, to]);

  const ownerPendingPayments = useMemo(
    () => allPaymentRows.filter((p) => p.status === "requested"),
    [allPaymentRows]
  );
  const forcePayments = useMemo(
    () => allPaymentRows.filter((p) => ["approved_waiting_accept", "expired", "disputed"].includes(p.status)),
    [allPaymentRows]
  );
  const ownerPendingFiltered = useMemo(() => {
    if (!investorFilter) return ownerPendingPayments;
    const id = Number(investorFilter);
    if (!Number.isFinite(id)) return ownerPendingPayments;
    return ownerPendingPayments.filter((p) => p.investorId === id);
  }, [ownerPendingPayments, investorFilter]);
  const forceFiltered = useMemo(() => {
    if (!investorFilter) return forcePayments;
    const id = Number(investorFilter);
    if (!Number.isFinite(id)) return forcePayments;
    return forcePayments.filter((p) => p.investorId === id);
  }, [forcePayments, investorFilter]);
  const topUpRowsFiltered = useMemo(() => {
    const raw = feed?.bodyTopUps ?? [];
    if (!investorFilter) return raw;
    const id = Number(investorFilter);
    if (!Number.isFinite(id)) return raw;
    return raw.filter((item) => item.investor.id === id);
  }, [feed?.bodyTopUps, investorFilter]);
  const pendingTopUpCount = useMemo(
    () => topUpRowsFiltered.filter((item) => item.status === "pending_investor").length,
    [topUpRowsFiltered]
  );

  const summary = useMemo(
    () =>
      investors.reduce(
        (acc, inv) => ({
          body: acc.body + (inv.body || 0),
          accrued: acc.accrued + (inv.accrued || 0),
          due: acc.due + (inv.due || 0),
          paid: acc.paid + (inv.paid || 0),
        }),
        { body: 0, accrued: 0, due: 0, paid: 0 }
      ),
    [investors]
  );

  const rateJournal = useMemo(
    () => dedupeBusinessRateHistory(feed?.rateHistory ?? []),
    [feed?.rateHistory]
  );
  const ratePastLine = useMemo(() => pastRecentMilestones(feed?.rateHistory ?? []), [feed?.rateHistory]);

  const auditRows = useMemo(() => {
    const raw = feed?.auditLog ?? [];
    if (!investorFilter) return raw;
    const id = Number(investorFilter);
    if (!Number.isFinite(id)) return raw;
    return raw.filter((a) => a.entityType === "Investor" && a.entityId === id);
  }, [feed?.auditLog, investorFilter]);

  const cancelTopUpMutation = useMutation({
    mutationFn: (requestId: number) =>
      apiClient.patch("/api/body-topup-requests", {
        requestId,
        action: "owner_cancel",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports-feed"] });
      queryClient.invalidateQueries({ queryKey: ["body-topup-requests"] });
    },
  });

  const investorTopUpDecisionMutation = useMutation({
    mutationFn: ({ requestId, action }: { requestId: number; action: "investor_accept" | "investor_reject" }) =>
      apiClient.patch("/api/body-topup-requests", { requestId, action }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports-feed"] });
      queryClient.invalidateQueries({ queryKey: ["body-topup-requests"] });
      queryClient.invalidateQueries({ queryKey: ["body-topup-requests-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["investors"] });
    },
  });

  const ownerPaymentMutation = useMutation({
    mutationFn: ({ paymentId, action }: { paymentId: number; action: "owner_approve" | "owner_reject" }) =>
      apiClient.post("/api/payments", { action, paymentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investors"] });
      queryClient.invalidateQueries({ queryKey: ["reports-investors"] });
    },
  });

  const forcePaymentMutation = useMutation({
    mutationFn: ({ paymentId, action }: { paymentId: number; action: "force_approve" | "force_reject" }) =>
      apiClient.post("/api/payments", { action, paymentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investors"] });
      queryClient.invalidateQueries({ queryKey: ["reports-investors"] });
    },
  });

  const paymentDecisionMutation = useMutation({
    mutationFn: ({ paymentId, action }: { paymentId: number; action: "investor_accept" | "investor_dispute" }) =>
      apiClient.post("/api/payments", { action, paymentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investors"] });
      queryClient.invalidateQueries({ queryKey: ["reports-investors"] });
    },
  });

  const financePath = user?.role === "INVESTOR" ? "/dashboard" : "/dashboard/manage";
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const showOwnerWithdrawQueue = user?.role === "OWNER" || isSuperAdmin;
  const showRateBlock = user?.role === "OWNER" || isSuperAdmin;
  const showAuditBlock = user?.role === "OWNER" || isSuperAdmin;

  return (
    <Container>
      <div className="min-h-screen space-y-4 py-4 pb-28 md:space-y-5 md:py-8 md:pb-28">
        <div className={DASHBOARD_STICKY_BAR_CLASS}>
          <div className="min-w-0 flex-1">
            <Text className="text-sm font-semibold">Отчёты</Text>
            <Text className="text-xs text-muted-foreground">Журналы, истории и уведомления по данным</Text>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {showOwnerWithdrawQueue ? (
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${chipToneByCount(ownerPendingFiltered.length)}`}
                >
                  Заявки на вывод:{" "}
                  <span className="ml-1 font-semibold">
                    {ownerPendingFiltered.length}
                  </span>
                </span>
              ) : null}
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${chipToneByCount(pendingTopUpCount)}`}
              >
                Пополнения тела:{" "}
                <span className="ml-1 font-semibold">{pendingTopUpCount}</span>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => router.push(financePath)}>
              К финансам
            </Button>
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

        {investorFilter ? (
          <Card className="border border-primary/25 bg-primary/5 p-3 text-xs text-muted-foreground">
            Фильтр по инвестору #{investorFilter}: очереди выплат, аудит и связанные блоки.{" "}
            <button type="button" className="font-medium text-primary underline" onClick={() => router.push("/dashboard/reports")}>
              Сбросить
            </button>
          </Card>
        ) : null}

        {showOwnerWithdrawQueue ? (
          <CollapsibleSection
            title="Заявки на вывод (решение OWNER)"
            subtitle={
              investorFilter && ownerPendingFiltered.length === 0
                ? "🟢 Нет по выбранному инвестору"
                : queueSubtitleByCount(ownerPendingFiltered.length, "Нет активных")
            }
            defaultOpen={ownerPendingFiltered.length > 0}
            className="bg-card/30"
          >
            {ownerPendingFiltered.length === 0 ? (
              <div className="py-4 text-sm text-muted-foreground">Нет заявок на стадии «запрошено».</div>
            ) : (
              <div className="space-y-2">
                {ownerPendingFiltered.slice(0, 24).map((p) => (
                  <div key={p.id} className="rounded-xl border border-border/60 bg-card/70 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Text className="font-semibold">{p.investorName}</Text>
                      <Text className="text-xs text-muted-foreground">{formatPaymentStatus(p.status)}</Text>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Тип: <span className="font-semibold text-foreground">{formatPaymentType(p.type)}</span> | Сумма:{" "}
                      <span className="font-semibold text-foreground">{formatCurrency(p.amount)}</span>
                    </div>
                    {p.comment ? <div className="mt-1 text-xs text-muted-foreground">Комментарий: {p.comment}</div> : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => ownerPaymentMutation.mutate({ paymentId: p.id, action: "owner_approve" })}
                        disabled={ownerPaymentMutation.isPending}
                      >
                        Одобрить
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => ownerPaymentMutation.mutate({ paymentId: p.id, action: "owner_reject" })}
                        disabled={ownerPaymentMutation.isPending}
                      >
                        Отклонить
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>
        ) : null}

        {isSuperAdmin ? (
          <CollapsibleSection
            title="Принудительные решения"
            subtitle={
              investorFilter && forceFiltered.length === 0
                ? "🟢 Нет по фильтру"
                : queueSubtitleByCount(forceFiltered.length, "Пусто")
            }
            defaultOpen={forceFiltered.length > 0}
            className="bg-card/30"
          >
            {forceFiltered.length === 0 ? (
              <div className="py-4 text-sm text-muted-foreground">Нет заявок для принудительного решения.</div>
            ) : (
              <div className="space-y-2">
                {forceFiltered.slice(0, 24).map((p) => (
                  <div key={p.id} className="rounded-xl border border-border/60 bg-card/70 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Text className="font-semibold">{p.investorName}</Text>
                      <Text className="text-xs text-muted-foreground">{formatPaymentStatus(p.status)}</Text>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Тип: <span className="font-semibold text-foreground">{formatPaymentType(p.type)}</span> | Сумма:{" "}
                      <span className="font-semibold text-foreground">{formatCurrency(p.amount)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => forcePaymentMutation.mutate({ paymentId: p.id, action: "force_approve" })}
                        disabled={forcePaymentMutation.isPending}
                      >
                        Принудительно одобрить
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => forcePaymentMutation.mutate({ paymentId: p.id, action: "force_reject" })}
                        disabled={forcePaymentMutation.isPending}
                      >
                        Принудительно отклонить
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>
        ) : null}

        <CollapsibleSection title="Сводка" subtitle="По текущим инвесторам в выборке" defaultOpen className="bg-card/30">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <InfoCell label="Тело" value={formatCurrency(summary.body)} />
            <InfoCell label="Начислено" value={formatCurrency(summary.accrued)} />
            <InfoCell label="К выплате" value={formatCurrency(summary.due)} />
            <InfoCell label="Выплачено" value={formatCurrency(summary.paid)} />
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="История выплат" subtitle="С фильтром по дате" defaultOpen className="bg-card/30">
          <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-3">
            <DatePicker value={from} onChange={setFrom} placeholder="От" />
            <DatePicker value={to} onChange={setTo} placeholder="До" />
            <Button
              variant="outline"
              onClick={() => {
                setFrom("");
                setTo("");
              }}
            >
              Сбросить
            </Button>
          </div>
          {paymentRows.length === 0 ? (
            <Text className="text-sm text-muted-foreground">За выбранный период выплат нет.</Text>
          ) : (
            <div className="max-h-[50vh] space-y-2 overflow-auto">
              {paymentRows.slice(0, 120).map((row) => (
                <div key={row.id} className="rounded-xl border border-border/60 bg-card/70 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <Text className="font-semibold">{row.investorName}</Text>
                      {showOwnerWithdrawQueue ? (
                        <button
                          type="button"
                          className="text-xs font-medium text-primary underline"
                          onClick={() => router.push(`/dashboard/reports?investor=${row.investorId}`)}
                        >
                          инвестор #{row.investorId}
                        </button>
                      ) : null}
                    </div>
                    <Text className="text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleDateString("ru-RU")}</Text>
                  </div>
                  <Text className="text-sm text-muted-foreground">
                    {formatPaymentType(row.type)} | {formatCurrency(row.amount)} | {formatPaymentStatus(row.status)}
                  </Text>
                  {row.comment ? (
                    <Text className="mt-1 text-xs text-muted-foreground">Комментарий: {row.comment}</Text>
                  ) : null}
                  {row.status === "approved_waiting_accept" &&
                  user?.role === "INVESTOR" &&
                  userCanDecideInvestorPayment(user?.id, row) ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => paymentDecisionMutation.mutate({ paymentId: row.id, action: "investor_accept" })}
                        disabled={paymentDecisionMutation.isPending}
                      >
                        Принять
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => paymentDecisionMutation.mutate({ paymentId: row.id, action: "investor_dispute" })}
                        disabled={paymentDecisionMutation.isPending}
                      >
                        Спор
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        {showRateBlock ? (
          <CollapsibleSection
            title="Ставка сети — журнал"
            subtitle={feedPending ? "Загрузка…" : `${rateJournal.length} записей (дубликаты скрыты)`}
            defaultOpen={false}
            className="bg-card/30"
          >
            {ratePastLine.length ? (
              <p className="mb-2 text-[11px] text-muted-foreground">
                Недавние точки (до сегодня):{" "}
                <span className="text-foreground">{ratePastLine.map((m) => `${formatRuDate(m.effectiveDate)} → ${m.newRate}%`).join(" · ")}</span>
              </p>
            ) : null}
            {!rateJournal.length ? (
              <Text className="text-sm text-muted-foreground">Пока нет записей.</Text>
            ) : (
              <ul className="max-h-72 space-y-1 overflow-y-auto pr-1 text-[11px] leading-snug">
                {rateJournal.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 rounded-md border border-transparent px-1 py-1.5 hover:border-border/40 hover:bg-muted/20"
                  >
                    <span className="shrink-0 tabular-nums text-muted-foreground">{formatRuDate(r.effectiveDate)}</span>
                    <span className="min-w-0 flex-1 text-foreground">
                      <span className="font-medium">{r.user.username}</span>
                      <span className="text-muted-foreground"> · </span>
                      <span className="tabular-nums">
                        {r.oldRate}% → {r.newRate}%
                      </span>
                      {r.comment ? <span className="text-muted-foreground"> — {r.comment}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CollapsibleSection>
        ) : null}

        <CollapsibleSection
          title="Пополнения тела"
          subtitle={
            feedPending
              ? "Загрузка…"
              : queueSubtitleByCount(
                  pendingTopUpCount,
                  investorFilter ? "Нет ожидающих по выбранному инвестору" : "Нет ожидающих"
                )
          }
          defaultOpen={false}
          className="bg-card/30"
        >
          {feedPending ? (
            <Text className="text-sm text-muted-foreground">Загрузка…</Text>
          ) : !topUpRowsFiltered.length ? (
            <Text className="text-sm text-muted-foreground">Нет записей.</Text>
          ) : (
            <div className="max-h-[55vh] space-y-2 overflow-y-auto">
              {topUpRowsFiltered.map((item) => (
                <div key={item.id} className="rounded-xl border border-border/60 bg-card/70 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Text className="font-semibold">{item.investor.name}</Text>
                    <Text className="text-xs text-muted-foreground">{formatTopUpStatus(item.status)}</Text>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Сумма: <span className="font-medium text-foreground">{formatCurrency(item.amount)}</span> · Тело:{" "}
                    {formatCurrency(item.investor.body)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Создал: {item.createdBy.username} · {new Date(item.createdAt).toLocaleString("ru-RU")}
                  </div>
                  {item.comment ? <div className="mt-1 text-xs text-muted-foreground">Комментарий: {item.comment}</div> : null}
                  {item.status === "pending_investor" && userCanDecideBodyTopUp(user?.id, item) ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => investorTopUpDecisionMutation.mutate({ requestId: item.id, action: "investor_accept" })}
                        disabled={investorTopUpDecisionMutation.isPending}
                      >
                        Принять
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => investorTopUpDecisionMutation.mutate({ requestId: item.id, action: "investor_reject" })}
                        disabled={investorTopUpDecisionMutation.isPending}
                      >
                        Отклонить
                      </Button>
                    </div>
                  ) : null}
                  {user?.role === "OWNER" && item.status === "pending_investor" ? (
                    <div className="mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => cancelTopUpMutation.mutate(item.id)}
                        disabled={cancelTopUpMutation.isPending}
                      >
                        Отменить запрос
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        {showAuditBlock ? (
          <CollapsibleSection
            title="Журнал действий"
            subtitle={feedPending ? "Загрузка…" : `${auditRows.length} записей`}
            defaultOpen={false}
            className="bg-card/30"
          >
            {!auditRows.length ? (
              <Text className="text-sm text-muted-foreground">Нет записей аудита.</Text>
            ) : (
              <ul className="max-h-[55vh] space-y-2 overflow-y-auto text-[11px] leading-snug">
                {auditRows.map((a) => (
                  <li key={a.id} className="rounded-lg border border-border/50 bg-background/30 px-2.5 py-2">
                    <div className="font-medium text-foreground">{formatAuditAction(a.action)}</div>
                    <div className="text-muted-foreground">
                      {formatAuditEntity(a.entityType, a.entityId)} · {a.user.username} ·{" "}
                      {new Date(a.createdAt).toLocaleString("ru-RU")}
                    </div>
                    {a.oldValue || a.newValue ? (
                      <div className="mt-0.5 text-muted-foreground/90">
                        {a.oldValue ? <>Было: {formatAuditValue(a.oldValue)} </> : null}
                        {a.newValue ? <>Стало: {formatAuditValue(a.newValue)}</> : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CollapsibleSection>
        ) : null}

        <MobileBottomNav active="reports" />
      </div>
    </Container>
  );
}

export default function DashboardReportsPage() {
  return (
    <Suspense
      fallback={
        <Container>
          <div className="flex min-h-[40vh] items-center justify-center py-8">
            <Text className="text-sm text-muted-foreground">Загрузка отчётов…</Text>
          </div>
        </Container>
      }
    >
      <ReportsPageInner />
    </Suspense>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/70 p-3">
      <Text className="text-xs text-muted-foreground">{label}</Text>
      <Text className="mt-0.5 text-sm font-semibold">{value}</Text>
    </div>
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

function formatTopUpStatus(status: string) {
  if (status === "pending_investor") return "Ожидает решения инвестора";
  if (status === "accepted_by_investor") return "Принят";
  if (status === "rejected_by_investor") return "Отклонён инвестором";
  if (status === "cancelled_by_owner") return "Отменён OWNER";
  return status;
}

function formatAuditAction(action: string) {
  if (action === "CREATE_INVESTOR") return "Создан инвестор";
  if (action === "ISSUE_INVESTOR_CREDENTIALS") return "Выданы данные доступа инвестору";
  if (action === "BECOME_SEMEN_INVESTOR") return "Создан вклад Семёна";
  if (action === "UPDATE_INVESTOR") return "Обновлены данные инвестора";
  if (action === "DELETE_INVESTOR") return "Удалён инвестор";
  return action.replaceAll("_", " ");
}

function formatAuditEntity(entityType: string, entityId: number) {
  if (entityType === "Investor") return `Инвестор #${entityId}`;
  if (entityType === "BodyTopUpRequest") return `Запрос пополнения #${entityId}`;
  if (entityType === "Payment") return `Заявка на выплату #${entityId}`;
  return `${entityType} #${entityId}`;
}

function formatAuditValue(value: string) {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const keyMap: Record<string, string> = {
      username: "Логин",
      body: "Тело",
      rate: "Ставка",
      accrued: "Начислено",
      paid: "Выплачено",
      status: "Статус",
      ownerId: "Владелец",
      linkedUserId: "Связанный пользователь",
      investorUserId: "Пользователь инвестора",
      name: "Имя",
      phone: "Телефон",
      handle: "Ник",
    };
    const parts = Object.entries(parsed)
      .slice(0, 5)
      .map(([k, v]) => `${keyMap[k] ?? k}: ${String(v)}`);
    return parts.length ? parts.join(", ") : value;
  } catch {
    return value;
  }
}
