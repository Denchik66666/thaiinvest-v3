"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";

import { Text } from "@/components/ui/Text";
import { apiClient } from "@/lib/api-client";
import type { OwnerPendingPaymentRow } from "@/components/dashboard/OwnerPendingPaymentsQueue";
import {
  OwnerBodyTopupAwaitingQueue,
  type OwnerBodyTopUpRequestRow,
} from "@/components/dashboard/OwnerBodyTopupAwaitingQueue";

export function OwnerRequestsAndConfirmations({
  pendingPayments,
  onOpenReports,
  onJumpToWithdrawals,
}: {
  pendingPayments: OwnerPendingPaymentRow[];
  onOpenReports: () => void;
  /** Прокрутка к карточке инвестора с заявкой на вывод */
  onJumpToWithdrawals: () => void;
}) {
  const { data: bodyTopUpData, isPending: bodyTopUpLoading } = useQuery({
    queryKey: ["body-topup-requests"],
    queryFn: () => apiClient.get<{ requests: OwnerBodyTopUpRequestRow[] }>("/api/body-topup-requests"),
    staleTime: 120_000,
    /** Инвалидируется после мутаций; постоянный polling грузит UI без необходимости */
    refetchInterval: false,
  });

  const pendingBodyTopUps = useMemo(() => {
    const all = bodyTopUpData?.requests ?? [];
    return all.filter((r) => r.status === "pending_investor").length;
  }, [bodyTopUpData?.requests]);

  const paymentCount = pendingPayments.length;
  const total = paymentCount + pendingBodyTopUps;

  const showEmptyHint =
    !bodyTopUpLoading && paymentCount === 0 && pendingBodyTopUps === 0;

  return (
    <section
      className="thai-owner-requests-panel relative z-0 mt-3 shrink-0 rounded-2xl px-3 py-3 md:mt-3.5 md:px-4 md:py-3.5"
      aria-labelledby="owner-requests-confirmations-heading"
    >
      <div className="relative z-[1] mb-2.5 flex flex-wrap items-start justify-between gap-2 md:mb-3">
        <div>
          <Text
            id="owner-requests-confirmations-heading"
            className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
          >
            Запросы и подтверждения
          </Text>
          <Text className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {total > 0 ? (
              <>
                Активных: <span className="tabular-nums font-medium text-foreground">{total}</span>
                {paymentCount > 0 && pendingBodyTopUps > 0 ? (
                  <>
                    {" "}
                    · вывод {paymentCount}, пополнения {pendingBodyTopUps}
                  </>
                ) : paymentCount > 0 ? (
                  <> · заявки на вывод</>
                ) : (
                  <> · пополнения ждут инвестора</>
                )}
              </>
            ) : bodyTopUpLoading ? (
              <>Проверяем активные запросы…</>
            ) : (
              <>Сейчас без очереди — заявки на вывод и пополнения появятся здесь</>
            )}
          </Text>
        </div>
        <button
          type="button"
          onClick={onOpenReports}
          className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-primary/12 px-2.5 py-1 text-[10px] font-semibold text-primary ring-1 ring-primary/20 transition hover:bg-primary/18 hover:ring-primary/30"
        >
          Финансы
          <ChevronRight className="h-3 w-3 opacity-80" aria-hidden />
        </button>
      </div>

      <div className="relative z-[1] space-y-2.5">
        {paymentCount > 0 ? (
          <button
            type="button"
            onClick={onJumpToWithdrawals}
            aria-label="Перейти к заявке на вывод у карточки инвестора ниже"
            className="flex w-full items-center justify-between gap-2 rounded-xl bg-primary/11 px-2.5 py-2 text-left ring-1 ring-primary/14 transition hover:bg-primary/15 hover:ring-primary/22 md:px-3"
          >
            <span className="min-w-0 text-[11px] leading-snug">
              <span className="font-semibold text-foreground">
                Вывод на решении: <span className="tabular-nums">{paymentCount}</span>
              </span>
              <span className="text-muted-foreground"> — одобрить или отклонить у карточки ↓</span>
            </span>
          </button>
        ) : null}
        <OwnerBodyTopupAwaitingQueue
          embedded
          onOpenReports={onOpenReports}
          requests={bodyTopUpData?.requests}
          loading={bodyTopUpLoading}
        />
        {showEmptyHint ? (
          <Text className="block px-0.5 text-[11px] leading-snug text-muted-foreground">
            В разделе «Финансы» — движения, пополнения тела и история выплат.
          </Text>
        ) : null}
      </div>
    </section>
  );
}
