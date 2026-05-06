"use client";

import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { apiClient } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils";
import { toast } from "@/lib/notify";

export type OwnerBodyTopUpRequestRow = {
  id: number;
  amount: number;
  status: string;
  comment?: string | null;
  createdAt: string;
  investor: { id: number; name: string; body: number };
  createdBy: { id: number; username: string; role: string };
};

function formatTopUpStatus(status: string) {
  if (status === "pending_investor") return "Ожидает решения инвестора";
  if (status === "accepted_by_investor") return "Принят";
  if (status === "rejected_by_investor") return "Отклонён инвестором";
  if (status === "cancelled_by_owner") return "Отменён владельцем";
  return status;
}

function formatShortWhen(iso: string) {
  return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const PREVIEW_MAX = 6;

export function OwnerBodyTopupAwaitingQueue({
  onOpenReports,
  embedded,
  requests,
  loading,
}: {
  onOpenReports: () => void;
  embedded?: boolean;
  /** Данные одного общего запроса с родителя (без второго useQuery на странице) */
  requests: OwnerBodyTopUpRequestRow[] | undefined;
  loading: boolean;
}) {
  const queryClient = useQueryClient();

  const pending = useMemo(() => {
    const all = requests ?? [];
    return all
      .filter((r) => r.status === "pending_investor")
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [requests]);

  const mutation = useMutation({
    mutationFn: (requestId: number) =>
      apiClient.patch("/api/body-topup-requests", { requestId, action: "owner_cancel" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["body-topup-requests"] });
      queryClient.invalidateQueries({ queryKey: ["body-topup-requests-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["reports-feed"] });
      queryClient.invalidateQueries({ queryKey: ["investors"] });
      toast.success("Запрос на пополнение отозван");
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Не удалось отозвать запрос");
    },
  });

  const preview = pending.slice(0, PREVIEW_MAX);
  const hidden = pending.length - preview.length;

  const outerMt = embedded ? "" : "mt-3 md:mt-3.5";

  if (loading && pending.length === 0) {
    return (
      <div
        className={`shrink-0 rounded-xl bg-[var(--thai-color-topup)]/10 px-2 py-2 md:px-2.5 md:py-2.5 ${outerMt}`}
      >
        <div className="h-4 w-48 animate-pulse rounded bg-muted/35" />
      </div>
    );
  }

  if (pending.length === 0) return null;

  return (
    <section
      className={`shrink-0 rounded-xl px-2 py-2 md:px-2.5 md:py-2.5 ${outerMt}`}
      style={{
        background: embedded
          ? "color-mix(in srgb, var(--thai-color-topup) 8%, transparent)"
          : "color-mix(in srgb, var(--thai-color-topup) 12%, transparent)",
      }}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-0.5">
        <div>
          <Text className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Пополнения тела
          </Text>
          <Text className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {embedded ? "Ждём инвестора · можете отозвать предложение" : "Ждём инвестора · при необходимости отозовите запрос"}
          </Text>
        </div>
        {embedded ? null : (
          <button
            type="button"
            onClick={onOpenReports}
            className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[var(--thai-color-topup)] hover:underline"
          >
            Все пополнения
            <ChevronRight className="h-3 w-3 opacity-80" aria-hidden />
          </button>
        )}
      </div>

      <ul className="space-y-2">
        {preview.map((item) => (
          <li
            key={item.id}
            className="rounded-xl px-2.5 py-2 dark:bg-white/[0.04]"
            style={{ background: "color-mix(in srgb, var(--thai-color-topup-bg) 55%, transparent)" }}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <Text className="truncate font-semibold leading-tight">{item.investor.name}</Text>
                <Text className="mt-0.5 text-[11px]" style={{ color: "var(--thai-color-topup)" }}>
                  +{formatCurrency(item.amount)} · сейчас тело {formatCurrency(item.investor.body)}
                </Text>
                <Text className="mt-0.5 text-[10px] text-muted-foreground">{formatTopUpStatus(item.status)}</Text>
                <Text className="mt-0.5 text-[10px] tabular-nums text-muted-foreground/90">
                  От {item.createdBy.username} · {formatShortWhen(item.createdAt)}
                </Text>
                {item.comment ? (
                  <Text className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">«{item.comment}»</Text>
                ) : null}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 shrink-0 text-xs"
                style={{
                  color: "var(--thai-color-topup)",
                  borderColor: "color-mix(in srgb, var(--thai-color-topup) 45%, transparent)",
                }}
                disabled={mutation.isPending}
                onClick={() => mutation.mutate(item.id)}
              >
                Отозвать
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {hidden > 0 ? (
        <button
          type="button"
          onClick={onOpenReports}
          className="mt-2 w-full rounded-lg py-2 text-center text-[11px] font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
          style={{ color: "var(--thai-color-topup)" }}
        >
          Ещё {hidden} в отчётах →
        </button>
      ) : null}
    </section>
  );
}
