"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type PaymentRow = {
  id: number;
  status: string;
};

type InvestorRow = {
  id: number;
  name: string;
  isPrivate: boolean;
  linkedUserId?: number | null;
  investorUserId?: number | null;
  payments?: PaymentRow[];
};

type TopUpRow = {
  id: number;
  status: string;
  investor: {
    id: number;
    name: string;
    isPrivate?: boolean;
    linkedUserId?: number | null;
    investorUserId?: number | null;
  };
};

type ReportsFeedResponse = {
  success: boolean;
  bodyTopUps: TopUpRow[];
};

function canInvestorDecide(userId: number | undefined, inv: { isPrivate?: boolean; linkedUserId?: number | null; investorUserId?: number | null }) {
  if (userId == null) return false;
  if (inv.investorUserId === userId) return true;
  if (!inv.isPrivate && inv.linkedUserId === userId) return true;
  return false;
}

export default function NotificationBell() {
  const router = useRouter();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const network = user?.role === "OWNER" ? "common" : "all";
  const { data: investorsData } = useQuery({
    queryKey: ["notifications-investors", network],
    queryFn: () => apiClient.get<{ investors: InvestorRow[] }>(`/api/investors?network=${network}`),
    enabled: !!user,
    refetchInterval: 30_000,
  });
  const { data: feed } = useQuery({
    queryKey: ["notifications-feed"],
    queryFn: () => apiClient.get<ReportsFeedResponse>("/api/reports/feed"),
    enabled: !!user,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const node = wrapRef.current;
      if (!node) return;
      if (e.target instanceof Node && node.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const investors = investorsData?.investors ?? [];
  const payments = useMemo(() => {
    const rows: Array<PaymentRow & { investor: InvestorRow }> = [];
    for (const inv of investors) {
      for (const p of inv.payments ?? []) rows.push({ ...p, investor: inv });
    }
    return rows;
  }, [investors]);

  const ownerRequestedCount = payments.filter((p) => p.status === "requested").length;
  const superForceCount = payments.filter((p) => ["approved_waiting_accept", "expired", "disputed"].includes(p.status)).length;
  const investorPayoutDecisionCount = payments.filter(
    (p) => p.status === "approved_waiting_accept" && canInvestorDecide(user?.id, p.investor)
  ).length;

  const topUps = feed?.bodyTopUps ?? [];
  const topUpPendingCount = topUps.filter((t) => t.status === "pending_investor").length;
  const investorTopUpDecisionCount = topUps.filter(
    (t) => t.status === "pending_investor" && canInvestorDecide(user?.id, t.investor)
  ).length;

  const items = useMemo(() => {
    const rows: Array<{ title: string; hint: string }> = [];
    if (!user) return rows;
    if (user.role === "OWNER") {
      if (ownerRequestedCount > 0) rows.push({ title: "Заявки на вывод", hint: `${ownerRequestedCount} ожидают решения` });
      if (topUpPendingCount > 0) rows.push({ title: "Пополнения тела", hint: `${topUpPendingCount} ожидают решения инвестора` });
    } else if (user.role === "SUPER_ADMIN") {
      if (ownerRequestedCount > 0) rows.push({ title: "Заявки на вывод", hint: `${ownerRequestedCount} ожидают OWNER` });
      if (superForceCount > 0) rows.push({ title: "Принудительные решения", hint: `${superForceCount} требуют действия` });
      if (topUpPendingCount > 0) rows.push({ title: "Пополнения тела", hint: `${topUpPendingCount} ожидают решения инвестора` });
    } else {
      if (investorPayoutDecisionCount > 0) rows.push({ title: "Одобренные выплаты", hint: `${investorPayoutDecisionCount} ждут вашего решения` });
      if (investorTopUpDecisionCount > 0) rows.push({ title: "Пополнения тела", hint: `${investorTopUpDecisionCount} ждут вашего решения` });
    }
    return rows;
  }, [
    user,
    ownerRequestedCount,
    superForceCount,
    topUpPendingCount,
    investorPayoutDecisionCount,
    investorTopUpDecisionCount,
  ]);

  const total = useMemo(() => {
    if (!user) return 0;
    if (user.role === "OWNER") return ownerRequestedCount + topUpPendingCount;
    if (user.role === "SUPER_ADMIN") return ownerRequestedCount + superForceCount + topUpPendingCount;
    return investorPayoutDecisionCount + investorTopUpDecisionCount;
  }, [
    user,
    ownerRequestedCount,
    topUpPendingCount,
    superForceCount,
    investorPayoutDecisionCount,
    investorTopUpDecisionCount,
  ]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-background/70 transition hover:bg-muted/60"
        aria-label="Уведомления"
        title="Уведомления"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-foreground">
          <path d="M15 17H5l1.4-1.9a2 2 0 00.4-1.2V10a5.2 5.2 0 0110.4 0v3a2 2 0 00.4 1.2L19 17h-4z" />
          <path d="M10 20a2 2 0 004 0" strokeLinecap="round" />
        </svg>
        {total > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {total > 9 ? "9+" : total}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[280px] rounded-xl border border-border/70 bg-background/95 p-2 shadow-xl backdrop-blur">
          <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Уведомления</div>
          {items.length === 0 ? (
            <div className="px-2 py-2 text-sm text-muted-foreground">Новых уведомлений нет.</div>
          ) : (
            <div className="space-y-1">
              {items.map((it, idx) => (
                <div key={`${it.title}-${idx}`} className="rounded-lg border border-border/50 bg-card/70 px-2 py-2">
                  <div className="text-sm font-medium text-foreground">{it.title}</div>
                  <div className="text-xs text-muted-foreground">{it.hint}</div>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            className={cn(
              "mt-2 w-full rounded-lg border border-border/70 px-2 py-1.5 text-sm font-medium transition",
              "hover:bg-muted/40"
            )}
            onClick={() => {
              setOpen(false);
              router.push("/dashboard/reports");
            }}
          >
            Открыть отчёты
          </button>
        </div>
      ) : null}
    </div>
  );
}

