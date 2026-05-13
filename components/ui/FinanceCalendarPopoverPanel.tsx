"use client";

import type { ReactNode, RefObject } from "react";
import { Check, RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  financeCalendarPanelFrame,
  financeCalendarPanelFramePlain,
  financeCalendarPopoverInnerClass,
  financeCalendarPopoverOverlayClass,
} from "@/components/ui/finance-calendar-popover-skin";

const POPOVER_OUTER_CLASS =
  "z-[20000] isolate max-h-[min(74vh,500px)] overflow-y-auto overflow-x-hidden rounded-2xl border p-1 shadow-none";

const POPOVER_OUTER_PLAIN_CLASS =
  "z-[20000] isolate max-h-[min(74vh,500px)] overflow-y-auto overflow-x-hidden rounded-xl p-1 shadow-none";

export type FinanceCalendarPopoverPanelProps = {
  popoverRef: RefObject<HTMLDivElement | null>;
  box: { top: number; left: number; width: number };
  ariaLabel: string;
  /** Блок над сеткой (пресеты периода или пустой слот той же высоты). */
  topSlot: ReactNode;
  calendar: ReactNode;
  footerCenterTitle: string;
  footerCenterTitleAttr?: string;
  checkDisabled?: boolean;
  checkAriaLabel: string;
  checkTitle: string;
  resetAriaLabel: string;
  resetTitle: string;
  onReset: () => void;
  onCheck: () => void;
  /** Если false — без сброса даты (например дата входа обязательна). */
  showReset?: boolean;
  /** Без градиентного оверлея и тяжёлой «стеклянной» рамки (только карточка). */
  plain?: boolean;
};

/**
 * Одна оболочка попапа: рамка, оверлей, верхний слот, сетка, футер — как в `HistoryPeriodPopover` (финансы).
 */
export function FinanceCalendarPopoverPanel({
  popoverRef,
  box,
  ariaLabel,
  topSlot,
  calendar,
  footerCenterTitle,
  footerCenterTitleAttr,
  checkDisabled = false,
  checkAriaLabel,
  checkTitle,
  resetAriaLabel,
  resetTitle,
  onReset,
  onCheck,
  showReset = true,
  plain = false,
}: FinanceCalendarPopoverPanelProps) {
  const checkEnabled = !checkDisabled;
  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={ariaLabel}
      style={plain ? financeCalendarPanelFramePlain(box) : financeCalendarPanelFrame(box)}
      className={plain ? POPOVER_OUTER_PLAIN_CLASS : POPOVER_OUTER_CLASS}
    >
      {plain ? null : <div aria-hidden className={financeCalendarPopoverOverlayClass} />}
      <div className={plain ? "relative px-2 pb-1.5 pt-1.5" : financeCalendarPopoverInnerClass}>
        {topSlot}
        <div className="mb-1" />
        {calendar}
        <div className="mt-2 flex items-center justify-between gap-2 pt-1">
          {showReset ? (
            <button
              type="button"
              aria-label={resetAriaLabel}
              title={resetTitle}
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-full border-0 bg-transparent p-0 transition",
                "text-muted-foreground hover:text-foreground",
                !plain && "hover:bg-white/[0.06]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              )}
              onClick={onReset}
            >
              <RotateCcw className="h-4 w-4" strokeWidth={2.2} aria-hidden />
            </button>
          ) : (
            <div className="h-8 w-8 shrink-0" aria-hidden />
          )}

          <div className="min-w-0 flex-1 px-2 text-center">
            <span
              className="block truncate text-[10px] font-medium tabular-nums text-muted-foreground"
              title={footerCenterTitleAttr ?? footerCenterTitle}
            >
              {footerCenterTitle}
            </span>
          </div>

          <button
            type="button"
            disabled={checkDisabled}
            aria-label={checkAriaLabel}
            title={checkTitle}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-full border-0 bg-transparent p-0 transition",
              checkEnabled
                ? cn("text-muted-foreground hover:text-foreground", !plain && "hover:bg-white/[0.06]")
                : "cursor-not-allowed text-muted-foreground/35",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            )}
            onClick={onCheck}
          >
            <Check className="h-4 w-4" strokeWidth={2.3} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
