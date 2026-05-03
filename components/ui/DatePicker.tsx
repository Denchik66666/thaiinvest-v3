"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

function parseYmd(value: string): Date | null {
  // Expect `YYYY-MM-DD` and build date in *local* timezone to avoid UTC shift.
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d) return null;
  const dt = new Date(y, mo - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

export type DatePickerProps = {
  value: string; // `YYYY-MM-DD` or empty
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  highlightedDates?: string[];
};

export function DatePicker({
  value,
  onChange,
  placeholder = "Выбери дату",
  className,
  highlightedDates = [],
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const [popover, setPopover] = useState<{ top: number; left: number; width: number } | null>(null);

  const selectedDate = useMemo(() => (value ? parseYmd(value) : null), [value]);
  const [viewDate, setViewDate] = useState<Date>(() => selectedDate ?? new Date());

  useEffect(() => {
    if (!selectedDate) return;
    // Avoid calling setState synchronously inside an effect (ESLint rule).
    queueMicrotask(() => setViewDate(startOfMonth(selectedDate)));
  }, [selectedDate]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const el = popoverRef.current;
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const computePopover = () => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const desiredWidth = Math.min(320, Math.max(220, rect.width));
    const vw = window.innerWidth;
    const left = Math.max(8, Math.min(rect.left, vw - desiredWidth - 8));
    const top = rect.bottom + 8;
    setPopover({ top, left, width: desiredWidth });
  };

  useLayoutEffect(() => {
    if (!open) return;
    computePopover();
    const onResize = () => computePopover();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open]);

  const today = useMemo(() => new Date(), []);
  const viewStart = useMemo(() => startOfMonth(viewDate), [viewDate]);

  const daysHeader = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const monthLabel = useMemo(() => {
    // Keep Russian month names short-ish to match existing app vibe.
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
    // Monday-first grid for Russian locale.
    const firstDay = new Date(viewStart.getFullYear(), viewStart.getMonth(), 1);
    const startWeekday = (firstDay.getDay() + 6) % 7; // 0..6 (Mo..Su)

    // Total 6 weeks x 7 = 42 cells.
    const cells: Array<{ date: Date; inMonth: boolean }> = [];
    for (let i = 0; i < 42; i++) {
      const dt = new Date(viewStart);
      dt.setDate(1 - startWeekday + i);
      const inMonth = dt.getMonth() === viewStart.getMonth();
      cells.push({ date: dt, inMonth });
    }
    return cells;
  }, [viewStart]);
  const highlightedSet = useMemo(() => new Set(highlightedDates), [highlightedDates]);

  const popoverNode =
    open && popover ? (
      <div
        ref={popoverRef}
        style={{ position: "fixed", top: popover.top, left: popover.left, width: popover.width }}
        className="z-[9999] rounded-xl border border-border/60 bg-background/95 backdrop-blur p-3 shadow-lg"
      >
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            className="px-2 py-1 rounded-md hover:bg-muted/60 transition text-sm text-foreground"
            onClick={() => setViewDate((d) => addMonths(d, -1))}
          >
            ◀
          </button>
          <div className="text-sm font-semibold text-foreground">{monthLabel}</div>
          <button
            type="button"
            className="px-2 py-1 rounded-md hover:bg-muted/60 transition text-sm text-foreground"
            onClick={() => setViewDate((d) => addMonths(d, 1))}
          >
            ▶
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-[10px] uppercase text-muted-foreground font-semibold mb-1">
          {daysHeader.map((d) => (
            <div key={d} className="text-center">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {calendarCells.map(({ date, inMonth }, idx) => {
            const isSelected = selectedDate && toYmd(date) === toYmd(selectedDate);
            const hasDot = highlightedSet.has(toYmd(date));
            const isToday =
              date.getFullYear() === today.getFullYear() &&
              date.getMonth() === today.getMonth() &&
              date.getDate() === today.getDate();
            return (
              <button
                key={`${idx}-${toYmd(date)}`}
                type="button"
                onClick={() => {
                  onChange(toYmd(date));
                  setOpen(false);
                }}
                className={cn(
                  "relative h-9 rounded-md text-sm transition",
                  inMonth ? "text-foreground" : "text-muted-foreground/60",
                  isSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted/60",
                  !isSelected && isToday ? "border border-primary/60" : "border border-transparent"
                )}
              >
                {date.getDate()}
                {hasDot ? (
                  <span
                    className={cn(
                      "absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full",
                      isSelected ? "bg-primary-foreground" : "bg-violet-500"
                    )}
                  />
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex items-center justify-between">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground transition"
            onClick={() => onChange("")}
          >
            Очистить
          </button>
          <button
            type="button"
            className="text-xs font-semibold text-foreground rounded-md px-2 py-1 hover:bg-muted/60 transition"
            onClick={() => setOpen(false)}
          >
            Готово
          </button>
        </div>
      </div>
    ) : null;

  return (
    <div ref={anchorRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full px-3 py-2 rounded-md bg-input text-foreground border border-border focus:ring-2 focus:ring-primary transition outline-none text-left",
          "flex items-center justify-between gap-2"
        )}
      >
        <span className={cn("text-sm", value ? "text-foreground" : "text-muted-foreground")}>
          {value ? parseYmd(value)?.toLocaleDateString("ru-RU") : placeholder}
        </span>
        <span className="text-xs text-muted-foreground">{open ? "▲" : "▼"}</span>
      </button>
      {open && popoverNode ? createPortal(popoverNode, document.body) : null}
    </div>
  );
}

