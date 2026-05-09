"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, cn } from "@/lib/utils";
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
    investor: { id: number; name: string };
  };
};

function paymentTypeRu(type: string) {
  if (type === "interest") return "Проценты";
  if (type === "body") return "Вывод тела";
  if (type === "close") return "Закрытие";
  return type;
}

function payloadSummary(p: CorrectionPayload): string {
  if (p.mode === "dates_only") return "Правка дат";
  return p.rollbackTarget === "owner_step" ? "Откат на шаг владельца" : "Откат на шаг инвестора";
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
  return (
    <div
      className={cn(
        "rounded-xl border border-border/30 bg-background/20 px-2.5 py-2 text-[11px] leading-snug",
        variant === "incoming" && "border-l-2 border-l-amber-500/55"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="font-semibold tabular-nums text-foreground">
            Заявка №{row.paymentId} · {paymentTypeRu(row.payment.type)} · {formatCurrency(row.payment.amount)}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {row.payment.investor.name} · {payloadSummary(row.payload)}
          </p>
          {variant === "incoming" ? (
            <p className="text-[10px] text-foreground/90">
              <span className="font-medium text-muted-foreground">От админа ({row.createdBy.username}): </span>
              {row.adminNote}
            </p>
          ) : (
            <p className="text-[10px] text-muted-foreground">Ожидает решения адресата</p>
          )}
        </div>
        {variant === "incoming" && onDecide ? (
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onDecide(row.id, "approve")}
              className={cn(
                "rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300",
                "transition hover:bg-emerald-500/15 disabled:opacity-40"
              )}
            >
              Принять
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onDecide(row.id, "reject")}
              className={cn(
                "rounded-lg border border-border/40 bg-transparent px-2 py-1 text-[10px] font-semibold text-muted-foreground",
                "transition hover:bg-muted/20 disabled:opacity-40"
              )}
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
    <div className="mb-3 space-y-2 rounded-xl border border-border/25 bg-background/15 px-2.5 py-2 md:mb-4 md:px-3 md:py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Запросы правок заявок
      </p>
      {incoming.length > 0 ? (
        <div className="space-y-1.5">
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
        <div className="space-y-1.5">
          <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground/90">Отправленные</p>
          {outgoing.map((row) => (
            <ProposalCard key={row.id} row={row} variant="outgoing" busyId={busyId} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
