import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

/**
 * Общая «шкурка» календарных попапов (финансы / DatePicker): панель как в FinanceHub.
 * Разметка месяца (навигация + сетка) — только в `FinanceMonthCalendar.tsx`.
 */
export const financeCalendarPanelLook: CSSProperties = {
  borderColor: "var(--thai-color-card-border)",
  background:
    "linear-gradient(165deg, color-mix(in srgb, hsl(var(--card)) 78%, transparent) 0%, color-mix(in srgb, var(--thai-color-card-bg) 92%, hsl(var(--card))) 48%, color-mix(in srgb, hsl(var(--background)) 55%, transparent) 100%)",
  backdropFilter: "saturate(1.75) blur(22px)",
  WebkitBackdropFilter: "saturate(1.75) blur(22px)",
  boxShadow:
    "0 22px 46px -18px rgba(0,0,0,0.58), 0 0 0 1px color-mix(in srgb, hsl(var(--primary)) 18%, transparent), inset 0 1px 0 color-mix(in srgb, #fff 10%, transparent), inset 0 -1px 0 color-mix(in srgb, #000 14%, transparent)",
};

export const financeCalendarPanelAnimation: CSSProperties = {
  animation: "thai-calendar-pop 0.24s cubic-bezier(0.22, 1, 0.36, 1) forwards",
  willChange: "transform, opacity",
};

export function financeCalendarPanelFrame(box: { top: number; left: number; width: number }): CSSProperties {
  return {
    position: "fixed",
    top: box.top,
    left: box.left,
    width: box.width,
    ...financeCalendarPanelLook,
    ...financeCalendarPanelAnimation,
  };
}

/** Плоская панель без градиентов и «стекла» — для `DatePicker` и узких форм. */
export function financeCalendarPanelFramePlain(box: { top: number; left: number; width: number }): CSSProperties {
  return {
    position: "fixed",
    top: box.top,
    left: box.left,
    width: box.width,
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border) / 0.45)",
    borderRadius: 12,
    boxShadow: "0 16px 40px -14px rgba(0,0,0,0.35)",
    ...financeCalendarPanelAnimation,
  };
}

/** Оценка высоты попапа у края вьюпорта — как в `HistoryPeriodPopover`. */
export const FINANCE_CALENDAR_POPOVER_ESTIMATE_H_PX = 520;

/**
 * Ширина попапа календаря по правилам ленты «Финансы» (`HistoryPeriodPopover`):
 * `min(380, max(300, ширина_якоря + 120))`.
 */
export function financeCalendarPopoverWidthFromAnchorWidth(anchorWidthPx: number): number {
  return Math.min(380, Math.max(300, anchorWidthPx + 120));
}

/**
 * Эквивалент ширины компактного триггера периода в тулбаре ленты «Финансы».
 * Для встроенной сетки месяца без DOM-якоря (напр. план ставки в «Управлении»).
 */
export const FINANCE_CALENDAR_REFERENCE_TOOLBAR_ANCHOR_WIDTH_PX = 168;

/** Ширина сетки календаря как у эталонного якоря тулбара «Финансы» (см. константу выше). */
export function financeCalendarReferenceToolbarContentWidthPx(): number {
  return financeCalendarPopoverWidthFromAnchorWidth(FINANCE_CALENDAR_REFERENCE_TOOLBAR_ANCHOR_WIDTH_PX);
}

/**
 * Расчёт позиции панели периода в ленте «Финансы» (`HistoryPeriodPopover`) — эталон.
 * `DatePicker` с `popoverGlass` использует ту же функцию.
 */
export function computeFinanceCalendarPopoverPosition(anchorRect: DOMRect): { top: number; left: number; width: number } {
  if (typeof window === "undefined") {
    return { top: 16, left: 10, width: 340 };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const desiredWidth = financeCalendarPopoverWidthFromAnchorWidth(anchorRect.width);
  const left = Math.max(10, Math.min(anchorRect.left, vw - desiredWidth - 10));
  let top = anchorRect.bottom + 10;
  if (top + FINANCE_CALENDAR_POPOVER_ESTIMATE_H_PX > vh - 10) {
    top = Math.max(10, anchorRect.top - FINANCE_CALENDAR_POPOVER_ESTIMATE_H_PX - 10);
  }
  return { top, left, width: desiredWidth };
}

const DATE_PICKER_POPOVER_NARROW_VIEWPORT_MAX = 640;

/**
 * Позиция попапа `DatePicker` без стекла (`popoverGlass={false}`): узкий вьюпорт — панель на всю доступную ширину и по центру якоря.
 */
export function computeDatePickerCalendarPopoverPosition(anchorRect: DOMRect): { top: number; left: number; width: number } {
  if (typeof window === "undefined") {
    return { top: 16, left: 10, width: 340 };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const gutter = 10;
  const maxW = Math.min(380, vw - gutter * 2);
  const narrow = vw <= DATE_PICKER_POPOVER_NARROW_VIEWPORT_MAX;
  const desiredWidth = narrow
    ? maxW
    : Math.min(maxW, Math.max(Math.min(300, maxW), anchorRect.width + 120));
  let left: number;
  if (narrow) {
    const ideal = anchorRect.left + anchorRect.width / 2 - desiredWidth / 2;
    left = Math.max(gutter, Math.min(ideal, vw - desiredWidth - gutter));
  } else {
    left = Math.max(gutter, Math.min(anchorRect.left, vw - desiredWidth - gutter));
  }
  let top = anchorRect.bottom + 10;
  if (top + FINANCE_CALENDAR_POPOVER_ESTIMATE_H_PX > vh - gutter) {
    top = Math.max(gutter, anchorRect.top - FINANCE_CALENDAR_POPOVER_ESTIMATE_H_PX - gutter);
  }
  return { top, left, width: desiredWidth };
}

/** Градиентный оверлей поверх панели (как в периоде финансов). */
export const financeCalendarPopoverOverlayClass =
  "pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-white/[0.07] via-transparent to-primary/[0.06] dark:from-white/[0.04] dark:to-primary/[0.04]";

/** Внутренний контейнер под сетку и кнопки. */
export const financeCalendarPopoverInnerClass =
  "relative rounded-[14px] bg-gradient-to-b from-background/32 to-background/[0.02] px-2 pb-1.5 pt-1.5";

/** Обёртка сетки 7×6. */
export const financeCalendarGridWrapperClass =
  "grid grid-cols-7 gap-1 rounded-xl border border-border/25 bg-muted/5 p-1 animate-in fade-in zoom-in-95 duration-200";

/** День внутри выбранного диапазона (не конец). */
export const financeCalendarDayInRangeClass =
  "bg-[color:var(--thai-color-accrued-bg)] ring-1 ring-[color:color-mix(in_srgb,var(--thai-color-accrued)_28%,transparent)]";

/** Стрелки смены месяца (как в HistoryPeriodPopover / финансы). */
export function financeCalendarNavButtonClass() {
  return cn(
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition duration-200",
    "text-muted-foreground",
    "hover:bg-white/[0.06] hover:text-foreground",
    "active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--thai-color-accrued)_45%,transparent)]"
  );
}

/** Базовая ячейка дня в сетке. */
export const financeCalendarDayBaseClass =
  "relative flex h-9 flex-col items-center justify-center rounded-lg text-[13px] font-semibold tabular-nums transition duration-200 ease-out";

/** Выбранный день / конец диапазона (заливка primary). */
export const financeCalendarDayEndpointClass =
  "bg-[color:color-mix(in_srgb,var(--thai-color-accrued)_18%,transparent)] text-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] ring-1 ring-[color:color-mix(in_srgb,var(--thai-color-accrued)_42%,transparent)]";

/** Сегодня, если не выбран (как в финансах). */
export const financeCalendarDayTodayClass =
  "ring-1 ring-[color-mix(in_srgb,var(--thai-color-due)_40%,transparent)] bg-[color-mix(in_srgb,var(--thai-color-due)_9%,transparent)]";

/** Hover для обычного дня в месяце. */
export const financeCalendarDayHoverClass = "hover:bg-background/70 hover:ring-1 hover:ring-border/50";

/** Заголовки колонок Сб и Вс (Пн = 0 … индексы 5 и 6). */
export const financeCalendarWeekendHeaderClass = "text-[color:var(--thai-color-accrued)]";

/** Текст ячейки субботы/воскресенья в месяце (не выбранный день). */
export const financeCalendarWeekendCellTextClass = "font-medium text-[color:var(--thai-color-accrued)]";
