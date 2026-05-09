"use client";

import type { FinanceInvestorSelectionMeta } from "@/types/operations-finance-api";
import { cn } from "@/lib/utils";

type Props = {
  investorSelection: FinanceInvestorSelectionMeta | undefined;
  className?: string;
};

/**
 * Предупреждение, когда SUPER_ADMIN запросил «вся сеть» без сужения — в ответе не все позиции.
 */
export function FinanceInvestorSelectionTruncationNotice({ investorSelection, className }: Props) {
  if (!investorSelection?.investorPositions.moreAvailable) return null;
  const { included, limit } = investorSelection.investorPositions;
  return (
    <div
      role="status"
      className={cn(
        "border-b border-amber-500/20 bg-amber-500/[0.09] px-2.5 py-2 text-amber-950/95 dark:border-amber-400/15 dark:bg-amber-400/[0.08] dark:text-amber-50/95",
        className
      )}
    >
      <p className="text-[10px] font-medium leading-snug tracking-wide">
        Показаны последние {included} позиций по активности (лимит одного запроса — {limit}). Есть ещё позиции
        вне ответа: сузьте сеть, выберите инвестора или передайте список <span className="font-mono">ids</span>.
      </p>
    </div>
  );
}
