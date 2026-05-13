"use client";

import type { KeyboardEvent } from "react";
import { Banknote, PlusCircle } from "lucide-react";

import { cn, formatCurrency } from "@/lib/utils";
import type { FinanceOperationItem } from "@/types/finance-operations";
import type { FinanceOperationsHistoryScope } from "@/lib/finance-payment-attention";
import {
  bodyTopUpAttentionBadgeLabel,
  bodyTopUpPendingStatusPhrase,
  paymentPendingQueueBadge,
} from "@/lib/finance-payment-attention";
import { sortFinanceOpsBySortAtDesc } from "@/lib/finance-operations-feed";

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function paymentTypeShort(type: string) {
  if (type === "interest") return "Проценты";
  if (type === "body") return "Вывод тела";
  if (type === "close") return "Закрытие";
  return type;
}

type Props = {
  items: FinanceOperationItem[];
  operationsHistoryScope: FinanceOperationsHistoryScope;
  bodyTopupAddresseeIds: ReadonlySet<number> | null;
  onItemClick: (item: FinanceOperationItem) => void;
  className?: string;
};

export function FinancePendingActionsQueue({
  items,
  operationsHistoryScope,
  bodyTopupAddresseeIds,
  onItemClick,
  className,
}: Props) {
  const sorted = sortFinanceOpsBySortAtDesc(items);
  if (sorted.length === 0) return null;

  return (
    <div className={cn("mb-1.5", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0 border-b border-amber-500/18 pb-0.5 dark:border-amber-400/14">
        <span className="text-[8px] font-semibold uppercase tracking-[0.12em] text-amber-950/80 dark:text-amber-100/75">
          Требуют действия
        </span>
        <span className="text-[8px] tabular-nums text-muted-foreground/85">{sorted.length}</span>
      </div>
      <ul className="divide-y divide-border/12">
        {sorted.map((item) => {
          const key = item.id;
          const interactive = {
            role: "button" as const,
            tabIndex: 0,
            onClick: () => onItemClick(item),
            onKeyDown: (e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onItemClick(item);
              }
            },
          };
          if (item.kind === "payment") {
            const when = formatWhen(item.createdAt);
            const badge = paymentPendingQueueBadge(operationsHistoryScope, item.status);
            return (
              <li
                key={key}
                {...interactive}
                className="flex cursor-pointer items-center gap-1.5 py-1 pl-0.5 pr-0.5 transition hover:bg-muted/15 active:bg-muted/25"
              >
                <div
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-amber-500/25 bg-background/30 dark:border-amber-400/20"
                  aria-hidden
                >
                  <Banknote className="h-3 w-3 text-amber-800 dark:text-amber-200/90" strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-1">
                    <span className="truncate text-[10px] font-semibold leading-tight text-foreground/90">
                      {paymentTypeShort(item.type)} · {item.positionName}
                    </span>
                    <span className="shrink-0 rounded border border-amber-500/35 bg-amber-500/10 px-1 py-px text-[7px] font-bold uppercase tracking-wide text-amber-950 dark:text-amber-100/88">
                      {badge}
                    </span>
                  </div>
                  <div className="truncate text-[8px] text-muted-foreground/90">{when}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[10px] font-semibold tabular-nums text-foreground/88">{formatCurrency(item.amount)}</div>
                </div>
              </li>
            );
          }
          if (item.kind === "topup") {
            const when = formatWhen(item.requestDate ?? item.createdAt);
            const line = bodyTopUpPendingStatusPhrase(
              operationsHistoryScope,
              item.investorId,
              item.positionName,
              bodyTopupAddresseeIds
            );
            const badge = bodyTopUpAttentionBadgeLabel(
              operationsHistoryScope,
              item.investorId,
              item.positionName,
              bodyTopupAddresseeIds
            );
            return (
              <li
                key={key}
                {...interactive}
                className="flex cursor-pointer items-center gap-1.5 py-1 pl-0.5 pr-0.5 transition hover:bg-muted/15 active:bg-muted/25"
              >
                <div
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-orange-500/28 bg-background/30 dark:border-orange-400/18"
                  aria-hidden
                >
                  <PlusCircle className="h-3 w-3 text-orange-800 dark:text-orange-200/90" strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-1">
                    <span className="truncate text-[10px] font-semibold leading-tight text-foreground/90">
                      Пополнение · {item.positionName}
                    </span>
                    <span className="shrink-0 rounded border border-orange-500/32 bg-orange-500/10 px-1 py-px text-[7px] font-bold uppercase tracking-wide text-orange-950 dark:text-orange-100/88">
                      {badge}
                    </span>
                  </div>
                  <div className="truncate text-[8px] text-muted-foreground/88">
                    {line} · {when}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[10px] font-semibold tabular-nums text-orange-900/95 dark:text-orange-100/88">
                    +{formatCurrency(item.amount)}
                  </div>
                </div>
              </li>
            );
          }
          return null;
        })}
      </ul>
    </div>
  );
}
