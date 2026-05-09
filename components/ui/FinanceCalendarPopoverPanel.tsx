"use client";

import type { ReactNode, RefObject } from "react";
import { Check, RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  financeCalendarPanelFrame,
  financeCalendarPopoverInnerClass,
  financeCalendarPopoverOverlayClass,
} from "@/components/ui/finance-calendar-popover-skin";

const POPOVER_OUTER_CLASS =
  "z-[20000] isolate max-h-[min(74vh,500px)] overflow-y-auto overflow-x-hidden rounded-2xl border p-1 shadow-none";

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
}: FinanceCalendarPopoverPanelProps) {
  const checkEnabled = !checkDisabled;
  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={ariaLabel}
      style={financeCalendarPanelFrame(box)}
      className={POPOVER_OUTER_CLASS}
    >
      <div aria-hidden className={financeCalendarPopoverOverlayClass} />
      <div className={financeCalendarPopoverInnerClass}>
        {topSlot}
        <div className="mb-1" />
        {calendar}
        <div className="mt-2 flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            aria-label={resetAriaLabel}
            title={resetTitle}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-full transition",
              "bg-transparent text-muted-foreground",
              "hover:bg-white/[0.06] hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            )}
            onClick={onReset}
          >
            <RotateCcw className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          </button>

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
              "inline-flex h-8 w-8 items-center justify-center rounded-full transition",
              "bg-transparent",
              checkEnabled
                ? "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
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
