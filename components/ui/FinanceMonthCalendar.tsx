"use client";

/**
 * Единая сетка месяца (финансы / модалки): навигация, шапка недели, 6×6 ячейки.
 * Стили только из `finance-calendar-popover-skin.ts` — без локальных «своих» классов сетки.
 */
import { useMemo, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  financeCalendarDayBaseClass,
  financeCalendarDayEndpointClass,
  financeCalendarDayHoverClass,
  financeCalendarDayInRangeClass,
  financeCalendarDayTodayClass,
  financeCalendarGridWrapperClass,
  financeCalendarNavButtonClass,
  financeCalendarWeekendCellTextClass,
  financeCalendarWeekendHeaderClass,
} from "@/components/ui/finance-calendar-popover-skin";

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/** Пн = 0 … Вс = 6 */
function mondayBasedWeekday(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function isWeekend(date: Date): boolean {
  return mondayBasedWeekday(date) >= 5;
}

export type FinanceMonthCalendarDayContext = {
  date: Date;
  ymd: string;
  inMonth: boolean;
  isSelected: boolean;
  isToday: boolean;
  weekend: boolean;
};

type SingleMode = {
  mode: "single";
  selectedYmd: string | null;
  onSelectYmd: (ymd: string) => void;
  highlightedYmds?: readonly string[];
  /** Доп. строки под числом (напр. % ставки); высота ячейки расширяется автоматически. */
  renderBelowDayNumber?: (ctx: FinanceMonthCalendarDayContext) => ReactNode;
  /** Подсветка понедельников числа (учётный цикл ставки). */
  emphasizeMondayInMonth?: boolean;
};

type RangeMode = {
  mode: "range";
  isDayInRange: (d: Date) => boolean;
  isDayEndpoint: (d: Date) => boolean;
  onPickDay: (d: Date) => void;
  /** Точка «·» под числом (как в single), без смены логики диапазона. */
  highlightedYmds?: readonly string[];
};

export type FinanceMonthCalendarProps = {
  viewMonth: Date;
  onViewMonthChange: (next: Date) => void;
  sessionToday: Date;
} & (SingleMode | RangeMode);

export function FinanceMonthCalendar(props: FinanceMonthCalendarProps) {
  const { viewMonth, onViewMonthChange, sessionToday } = props;

  const viewStart = useMemo(() => startOfMonth(viewMonth), [viewMonth]);

  const monthLabel = useMemo(() => {
    const months = [
      "Январь",
      "Февраль",
      "Март",
      "Апрель",
      "Май",
      "Июнь",
      "Июль",
      "Август",
      "Сентябрь",
      "Октябрь",
      "Ноябрь",
      "Декабрь",
    ];
    return `${months[viewStart.getMonth()]} ${viewStart.getFullYear()}`;
  }, [viewStart]);

  const calendarCells = useMemo(() => {
    const firstDay = new Date(viewStart.getFullYear(), viewStart.getMonth(), 1);
    const startWeekday = (firstDay.getDay() + 6) % 7;
    const cells: Array<{ date: Date; inMonth: boolean }> = [];
    for (let i = 0; i < 42; i++) {
      const dt = new Date(viewStart);
      dt.setDate(1 - startWeekday + i);
      const inMonth = dt.getMonth() === viewStart.getMonth();
      cells.push({ date: dt, inMonth });
    }
    return cells;
  }, [viewStart]);

  const daysHeader = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

  const highlightedSet = useMemo(() => {
    const h = props.mode === "single" ? props.highlightedYmds : props.mode === "range" ? props.highlightedYmds : undefined;
    if (!h?.length) return null;
    return new Set(h);
  }, [props]);

  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
        <button
          type="button"
          aria-label="Предыдущий месяц"
          onClick={() => onViewMonthChange(addMonths(viewMonth, -1))}
          className={financeCalendarNavButtonClass()}
        >
          <ChevronLeft className="h-4 w-4 opacity-90" strokeWidth={2.2} />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div
            className={cn(
              "truncate text-sm font-bold tracking-tight sm:text-[15px]",
              "text-[color:var(--thai-color-accrued)]"
            )}
            style={{ filter: "none", opacity: 0.92 }}
          >
            {monthLabel}
          </div>
        </div>
        <button
          type="button"
          aria-label="Следующий месяц"
          onClick={() => onViewMonthChange(addMonths(viewMonth, 1))}
          className={financeCalendarNavButtonClass()}
        >
          <ChevronRight className="h-4 w-4 opacity-90" strokeWidth={2.2} />
        </button>
      </div>

      <div className="mb-1.5 grid grid-cols-7 gap-0.5 px-0.5">
        {daysHeader.map((d, colIdx) => {
          const weekendCol = colIdx >= 5;
          return (
            <div
              key={d}
              className={cn(
                "py-1 text-center text-[10px] font-semibold uppercase tracking-wide",
                weekendCol ? financeCalendarWeekendHeaderClass : "text-muted-foreground"
              )}
            >
              {d}
            </div>
          );
        })}
      </div>

      <div key={`${viewStart.getFullYear()}-${viewStart.getMonth()}`} className={financeCalendarGridWrapperClass}>
        {calendarCells.map(({ date, inMonth }, idx) => {
          const ymd = toYmd(date);
          const isToday = isSameDay(date, sessionToday);
          const weekend = isWeekend(date);

          if (props.mode === "range") {
            const inRange = props.isDayInRange(date);
            const endpoint = props.isDayEndpoint(date);
            const hasDot = highlightedSet?.has(ymd);
            return (
              <button
                key={`${idx}-${ymd}`}
                type="button"
                onClick={() => props.onPickDay(date)}
                className={cn(
                  financeCalendarDayBaseClass,
                  inMonth ? "text-foreground/85" : "text-muted-foreground/45",
                  inMonth && !endpoint && weekend && financeCalendarWeekendCellTextClass,
                  inRange && !endpoint && financeCalendarDayInRangeClass,
                  endpoint && financeCalendarDayEndpointClass,
                  !inRange && !endpoint && financeCalendarDayHoverClass,
                  !inRange && !endpoint && isToday && financeCalendarDayTodayClass
                )}
              >
                <span className="leading-none">{date.getDate()}</span>
                {hasDot ? (
                  <span
                    className={cn(
                      "mt-0.5 text-[10px] leading-none",
                      endpoint ? "text-primary-foreground/85" : "text-primary/80"
                    )}
                    aria-hidden
                  >
                    ·
                  </span>
                ) : (
                  <span className="h-1.5 shrink-0" aria-hidden />
                )}
              </button>
            );
          }

          const isSelected = props.selectedYmd != null && props.selectedYmd === ymd;
          const expanded = Boolean(props.renderBelowDayNumber);
          const isMonday = mondayBasedWeekday(date) === 0;
          const ctx: FinanceMonthCalendarDayContext = {
            date,
            ymd,
            inMonth,
            isSelected,
            isToday,
            weekend,
          };

          return (
            <button
              key={`${idx}-${ymd}`}
              type="button"
              onClick={() => props.onSelectYmd(ymd)}
              className={cn(
                financeCalendarDayBaseClass,
                expanded && "min-h-[3.05rem] h-auto flex-col gap-0.5 py-1",
                inMonth ? "text-foreground/85" : "text-muted-foreground/45",
                inMonth && !isSelected && weekend && financeCalendarWeekendCellTextClass,
                isSelected && financeCalendarDayEndpointClass,
                inMonth && !isSelected && !isToday && financeCalendarDayHoverClass,
                inMonth && !isSelected && isToday && financeCalendarDayTodayClass
              )}
            >
              <span
                className={cn(
                  "leading-none",
                  props.emphasizeMondayInMonth && isMonday && inMonth && !isSelected && "font-semibold"
                )}
              >
                {date.getDate()}
              </span>
              {props.renderBelowDayNumber ? (
                props.renderBelowDayNumber(ctx)
              ) : highlightedSet?.has(ymd) ? (
                <span
                  className={cn(
                    "mt-0.5 text-[10px] leading-none",
                    isSelected ? "text-primary-foreground/85" : "text-primary/80"
                  )}
                  aria-hidden
                >
                  ·
                </span>
              ) : (
                <span className="h-1.5 shrink-0" aria-hidden />
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}
