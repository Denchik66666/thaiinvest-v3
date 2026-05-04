"use client";

/**
 * Календарь в портале на `document.body`, z-index выше модалок.
 * Не использовать `<input type="date">` рядом — ломает единый премиальный UI.
 */
import type { CSSProperties } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

function parseYmd(value: string): Date | null {
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

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

const POPOVER_ESTIMATE_H = 400;

export type DatePickerProps = {
  value: string;
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
    const desiredWidth = Math.min(360, Math.max(280, rect.width + 24));
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.max(10, Math.min(rect.left, vw - desiredWidth - 10));

    let top = rect.bottom + 10;
    if (top + POPOVER_ESTIMATE_H > vh - 10) {
      top = Math.max(10, rect.top - POPOVER_ESTIMATE_H - 10);
    }

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

  const viewStart = useMemo(() => startOfMonth(viewDate), [viewDate]);

  const daysHeader = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
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

  const highlightedSet = useMemo(() => new Set(highlightedDates), [highlightedDates]);
  const hasLegend = highlightedDates.length > 0;

  /** Один раз на открытие попапа — не дергать `new Date` на каждую ячейку. */
  const sessionToday = useMemo(() => new Date(), [open]);

  const goToday = () => {
    const n = new Date();
    setViewDate(startOfMonth(n));
    onChange(toYmd(n));
    setOpen(false);
  };

  const panelStyle: CSSProperties = {
    position: "fixed",
    top: popover?.top ?? 0,
    left: popover?.left ?? 0,
    width: popover?.width ?? 320,
    borderColor: "var(--thai-color-card-border)",
    background:
      "linear-gradient(165deg, color-mix(in srgb, hsl(var(--card)) 78%, transparent) 0%, color-mix(in srgb, var(--thai-color-card-bg) 92%, hsl(var(--card))) 48%, color-mix(in srgb, hsl(var(--background)) 55%, transparent) 100%)",
    backdropFilter: "saturate(1.75) blur(28px)",
    WebkitBackdropFilter: "saturate(1.75) blur(28px)",
    boxShadow:
      "0 28px 56px -16px rgba(0,0,0,0.5), 0 0 0 1px color-mix(in srgb, hsl(var(--primary)) 22%, transparent), inset 0 1px 0 color-mix(in srgb, #fff 9%, transparent), inset 0 -1px 0 color-mix(in srgb, #000 12%, transparent)",
    animation: "thai-calendar-pop 0.24s cubic-bezier(0.22, 1, 0.36, 1) forwards",
    willChange: "transform, opacity",
  };

  const popoverNode =
    open && popover ? (
      <div
        ref={popoverRef}
        role="dialog"
        aria-label="Календарь"
        style={panelStyle}
        className="z-[20000] isolate overflow-hidden rounded-2xl border p-1 shadow-none"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-white/[0.07] via-transparent to-primary/[0.06] dark:from-white/[0.04] dark:to-primary/[0.04]"
        />
        <div className="relative rounded-[14px] bg-gradient-to-b from-background/35 to-background/[0.02] px-2.5 pb-2 pt-2">
          <div className="mb-3 flex items-center justify-between gap-2 px-0.5">
            <button
              type="button"
              aria-label="Предыдущий месяц"
              onClick={() => setViewDate((d) => addMonths(d, -1))}
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition duration-200",
                "border-border/50 bg-background/45 text-foreground backdrop-blur-sm",
                "hover:border-primary/40 hover:bg-muted/35 hover:shadow-[0_0_12px_-2px_hsl(var(--primary)/0.35)]",
                "active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              )}
            >
              <ChevronLeft className="h-4 w-4 opacity-90" strokeWidth={2.2} />
            </button>
            <div className="min-w-0 flex-1 text-center">
              <div
                className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
                style={{ color: "var(--thai-color-text-muted)" }}
              >
                Месяц
              </div>
              <div className="truncate text-sm font-bold tracking-tight text-foreground sm:text-[15px]">
                {monthLabel}
              </div>
            </div>
            <button
              type="button"
              aria-label="Следующий месяц"
              onClick={() => setViewDate((d) => addMonths(d, 1))}
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition duration-200",
                "border-border/50 bg-background/45 text-foreground backdrop-blur-sm",
                "hover:border-primary/40 hover:bg-muted/35 hover:shadow-[0_0_12px_-2px_hsl(var(--primary)/0.35)]",
                "active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              )}
            >
              <ChevronRight className="h-4 w-4 opacity-90" strokeWidth={2.2} />
            </button>
          </div>

          <div
            className="mb-1.5 grid grid-cols-7 gap-0.5 px-0.5"
            style={{ color: "var(--thai-color-text-muted)" }}
          >
            {daysHeader.map((d) => (
              <div
                key={d}
                className="py-1 text-center text-[10px] font-semibold uppercase tracking-wide"
              >
                {d}
              </div>
            ))}
          </div>

          <div
            key={`${viewStart.getFullYear()}-${viewStart.getMonth()}`}
            className="grid grid-cols-7 gap-1 rounded-xl border border-border/25 bg-muted/5 p-1.5 animate-in fade-in zoom-in-95 duration-200"
          >
            {calendarCells.map(({ date, inMonth }, idx) => {
              const isToday = isSameDay(date, sessionToday);
              const isSelected = selectedDate ? isSameDay(date, selectedDate) : false;
              const hasDot = highlightedSet.has(toYmd(date));
              const ymd = toYmd(date);

              return (
                <button
                  key={`${idx}-${ymd}`}
                  type="button"
                  onClick={() => {
                    onChange(ymd);
                    setOpen(false);
                  }}
                  className={cn(
                    "relative flex h-10 flex-col items-center justify-center rounded-xl text-[13px] font-semibold tabular-nums transition duration-200 ease-out",
                    inMonth ? "text-foreground" : "text-muted-foreground/45",
                    isSelected &&
                      "bg-gradient-to-br from-primary to-primary/85 text-primary-foreground shadow-[0_6px_16px_-4px_hsl(var(--primary)/0.55)] ring-1 ring-white/25",
                    !isSelected && "hover:bg-background/70 hover:ring-1 hover:ring-border/50",
                    !isSelected && isToday && "ring-1 ring-[color-mix(in_srgb,var(--thai-color-due)_55%,transparent)] bg-[color-mix(in_srgb,var(--thai-color-due)_12%,transparent)]"
                  )}
                >
                  <span className="leading-none">{date.getDate()}</span>
                  {hasDot ? (
                    <span
                      className={cn(
                        "absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full shadow-sm",
                        isSelected
                          ? "bg-primary-foreground ring-1 ring-primary-foreground/40"
                          : "bg-[#a78bfa] ring-2 ring-[color-mix(in_srgb,#a78bfa_35%,transparent)]"
                      )}
                      aria-hidden
                    />
                  ) : (
                    <span className="h-1.5 shrink-0" aria-hidden />
                  )}
                </button>
              );
            })}
          </div>

          {hasLegend ? (
            <div
              className="mt-2 flex items-center gap-2 rounded-lg border border-border/30 px-2 py-1.5"
              style={{ background: "color-mix(in srgb, var(--thai-color-card-bg) 100%, transparent)" }}
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#a78bfa] ring-2 ring-[color-mix(in_srgb,#a78bfa_30%,transparent)]" />
              <span className="text-[10px] leading-snug text-muted-foreground">
                Точка — есть события по данным формы (как в истории операций).
              </span>
            </div>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border/30 pt-2">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
                onClick={() => onChange("")}
              >
                Очистить
              </button>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-[11px] font-semibold text-primary transition hover:bg-primary/10"
                onClick={goToday}
              >
                Сегодня
              </button>
            </div>
            <button
              type="button"
              className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-foreground transition hover:bg-muted/50"
              onClick={() => setOpen(false)}
            >
              Готово
            </button>
          </div>
        </div>
      </div>
    ) : null;

  return (
    <div ref={anchorRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "group flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left outline-none transition duration-200 ease-out",
          "border-border/55 bg-gradient-to-br from-background/70 to-muted/25 backdrop-blur-md",
          "hover:border-primary/40 hover:from-background/85 hover:to-muted/35 hover:shadow-[0_8px_28px_-8px_hsl(var(--primary)/0.22)]",
          open &&
            "border-primary/50 from-background/90 to-muted/40 ring-2 ring-primary/25 shadow-[0_10px_32px_-10px_hsl(var(--primary)/0.35)]"
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition duration-200",
              "border-border/45 bg-background/50 text-muted-foreground backdrop-blur-sm",
              "group-hover:border-primary/35 group-hover:bg-muted/25 group-hover:text-primary"
            )}
          >
            <CalendarDays className="h-4 w-4" strokeWidth={2} />
          </span>
          <span
            className={cn(
              "min-w-0 truncate text-sm font-medium tabular-nums tracking-tight",
              value ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {value ? parseYmd(value)?.toLocaleDateString("ru-RU") : placeholder}
          </span>
        </span>
        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition duration-200",
            open && "rotate-90 text-primary"
          )}
          strokeWidth={2}
        />
      </button>
      {open && popoverNode ? createPortal(popoverNode, document.body) : null}
    </div>
  );
}
