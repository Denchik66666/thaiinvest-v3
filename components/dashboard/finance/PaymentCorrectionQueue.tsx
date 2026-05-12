"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, cn } from "@/lib/utils";
import { investorDisplayHandle } from "@/lib/investor-display-handle";
import { toast } from "@/lib/notify";
import { paymentCorrectionProposalsQueryKey } from "@/lib/payment-correction-query";
import type { CorrectionPayload } from "@/lib/payment-correction";

type ProposalRow = {
  id: number;
  paymentId: number;
  adminNote: string;
  payload: CorrectionPayload;
  createdAt: string;
  createdBy: { username: string };
  payment: {
    id: number;
    type: string;
    status: string;
    amount: number;
    investor: {
      id: number;
      name: string;
      handle?: string | null;
      investorUser?: { username: string } | null;
      linkedUser?: { username: string } | null;
    };
  };
};

function paymentTypeRu(type: string) {
  if (type === "interest") return "Проценты";
  if (type === "body") return "Вывод тела";
  if (type === "close") return "Закрытие";
  return type;
}

function isoToDdMmYy(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/** Одна фраза про предлагаемые даты/сумму (без дублирования adminNote). */
function proposedChangePhrase(payload: CorrectionPayload): string {
  if (payload.mode === "rollback") {
    const t =
      payload.rollbackTarget === "owner_step" ? "откат на шаг владельца" : "откат на шаг инвестора";
    const rev = payload.reverseCompletion ? ", с откатом проводки" : "";
    const patch = payload.patchDates;
    if (!patch || Object.keys(patch).length === 0) return t + rev;
    const dates: string[] = [];
    for (const key of ["createdAt", "approvedAt", "acceptedAt"] as const) {
      if (!(key in patch) || patch[key] === undefined) continue;
      const v = patch[key]!;
      if (v === null) dates.push(key === "createdAt" ? "сброс подачи" : key === "approvedAt" ? "сброс одобрения" : "сброс подтверждения");
      else dates.push(isoToDdMmYy(v));
    }
    if (dates.length === 0) return t + rev;
    const datePart = dates.length === 1 ? `предлагаемая дата: ${dates[0]}` : `предлагаемые даты: ${dates.join(", ")}`;
    return `${t}${rev}; ${datePart}`;
  }
  const patch = payload.patchDates ?? {};
  const dates: string[] = [];
  for (const key of ["createdAt", "approvedAt", "acceptedAt"] as const) {
    if (!(key in patch) || patch[key] === undefined) continue;
    const v = patch[key]!;
    if (v === null) dates.push(key === "createdAt" ? "сброс подачи" : key === "approvedAt" ? "сброс одобрения" : "сброс подтверждения");
    else dates.push(isoToDdMmYy(v));
  }
  const bits: string[] = [];
  if (dates.length === 1) bits.push(`предлагаемая дата: ${dates[0]}`);
  else if (dates.length > 1) bits.push(`предлагаемые даты: ${dates.join(", ")}`);
  if (payload.patchAmount !== undefined) {
    bits.push(`сумма в заявке: ${formatCurrency(payload.patchAmount)}`);
  }
  return bits.length > 0 ? bits.join(" · ") : "состав правки в данных заявки";
}

function countDateOnlyPatches(payload: CorrectionPayload): number {
  if (payload.mode !== "dates_only") return 0;
  const p = payload.patchDates ?? {};
  let n = 0;
  for (const k of ["createdAt", "approvedAt", "acceptedAt"] as const) {
    if (k in p && p[k] !== undefined) n++;
  }
  return n;
}

function ProposalCard({
  row,
  variant,
  busyId,
  onDecide,
}: {
  row: ProposalRow;
  variant: "incoming" | "outgoing";
  busyId: number | null;
  onDecide?: (id: number, decision: "approve" | "reject") => void;
}) {
  const disabled = busyId != null;
  const pos = investorDisplayHandle(row.payment.investor) ?? row.payment.investor.name;
  const payShort = `№${row.paymentId} · ${paymentTypeRu(row.payment.type)} · ${formatCurrency(row.payment.amount)}`;

  const proposed = proposedChangePhrase(row.payload);
  const incomingIntro =
    row.payload.mode === "rollback"
      ? `Запрос от ${row.createdBy.username}: ${proposed}`
      : countDateOnlyPatches(row.payload) === 1 && row.payload.patchAmount === undefined
        ? `Запрос от ${row.createdBy.username} на корректировку даты, ${proposed}`
        : `Запрос от ${row.createdBy.username} на корректировку дат, ${proposed}`;

  const mainText =
    variant === "incoming"
      ? `${incomingIntro}. ${payShort} · ${pos}.`
      : `Ожидает решения: ${payShort} · ${pos}. ${proposed}`;

  return (
    <div
      className={cn(
        "border-b border-border/25 py-2 text-[11px] leading-snug last:border-b-0",
        variant === "incoming" && "border-l-2 border-l-amber-500/50 pl-2"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <p className="min-w-0 flex-1 text-foreground/95 [overflow-wrap:anywhere]">{mainText}</p>
        {variant === "incoming" && onDecide ? (
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onDecide(row.id, "approve")}
              className="text-[11px] font-semibold text-emerald-600 underline-offset-2 hover:underline disabled:pointer-events-none disabled:opacity-40 dark:text-emerald-400/95"
            >
              Принять
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onDecide(row.id, "reject")}
              className="text-[11px] font-semibold text-muted-foreground underline-offset-2 hover:underline disabled:pointer-events-none disabled:opacity-40"
            >
              Отклонить
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function PaymentCorrectionQueue() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const enabled =
    !!user && (user.role === "OWNER" || user.role === "INVESTOR" || user.role === "SUPER_ADMIN");

  const { data } = useQuery({
    queryKey: paymentCorrectionProposalsQueryKey,
    queryFn: () =>
      apiClient.get<{ incoming: ProposalRow[]; outgoing: ProposalRow[] }>(
        "/api/payment-correction-proposals"
      ),
    enabled,
    staleTime: 20_000,
    refetchInterval: 55_000,
  });

  const [busyId, setBusyId] = useState<number | null>(null);

  const decideMut = useMutation({
    mutationFn: ({ id, decision }: { id: number; decision: "approve" | "reject" }) =>
      apiClient.patch(`/api/payment-correction-proposals/${id}`, { decision }),
    meta: { skipErrorToast: true },
    onMutate: ({ id }) => setBusyId(id),
    onSettled: () => setBusyId(null),
    onSuccess: (_, vars) => {
      toast.success(vars.decision === "approve" ? "Правка применена" : "Отклонено");
      void queryClient.invalidateQueries({ queryKey: paymentCorrectionProposalsQueryKey });
      void queryClient.invalidateQueries({ queryKey: ["investors"] });
      void queryClient.invalidateQueries({ queryKey: ["payments", "context"] });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Не удалось выполнить");
    },
  });

  const incoming = data?.incoming ?? [];
  const outgoing = data?.outgoing ?? [];

  if (!enabled || (incoming.length === 0 && outgoing.length === 0)) return null;

  return (
    <div className="mb-3 space-y-1 border-b border-border/20 pb-2 md:mb-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Запросы правок заявок
      </p>
      {incoming.length > 0 ? (
        <div className="space-y-0">
          <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground/90">Входящие</p>
          {incoming.map((row) => (
            <ProposalCard
              key={row.id}
              row={row}
              variant="incoming"
              busyId={busyId}
              onDecide={(id, decision) => decideMut.mutate({ id, decision })}
            />
          ))}
        </div>
      ) : null}
      {outgoing.length > 0 ? (
        <div className="space-y-0">
          <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground/90">Отправленные</p>
          {outgoing.map((row) => (
            <ProposalCard key={row.id} row={row} variant="outgoing" busyId={busyId} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
