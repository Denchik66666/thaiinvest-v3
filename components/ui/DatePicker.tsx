"use client";

/**
 * Календарь в портале на `document.body`.
 * Сетка — тот же режим `range`, что в `HistoryPeriodPopover` (финансы): один выбранный день = диапазон [d, d].
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  computeDatePickerCalendarPopoverPosition,
} from "@/components/ui/finance-calendar-popover-skin";
import { FinanceCalendarPopoverPanel } from "@/components/ui/FinanceCalendarPopoverPanel";
import { FinanceMonthCalendar, startOfMonth } from "@/components/ui/FinanceMonthCalendar";

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

function startOfDayMs(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

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

  const [draftStart, setDraftStart] = useState<Date | null>(null);
  const [draftEnd, setDraftEnd] = useState<Date | null>(null);

  useEffect(() => {
    if (!selectedDate) return;
    queueMicrotask(() => setViewDate(startOfMonth(selectedDate)));
  }, [selectedDate]);

  useEffect(() => {
    if (!open) return;
    const d = value ? parseYmd(value) : null;
    if (d) {
      setDraftStart(d);
      setDraftEnd(d);
      queueMicrotask(() => setViewDate(startOfMonth(d)));
    } else {
      setDraftStart(null);
      setDraftEnd(null);
    }
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const el = popoverRef.current;
      const an = anchorRef.current;
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      if (an && e.target instanceof Node && an.contains(e.target)) return;
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
    setPopover(computeDatePickerCalendarPopoverPosition(anchor.getBoundingClientRect()));
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

  const sessionToday = useMemo(() => new Date(), [open]);

  const rangeBounds = useMemo(() => {
    if (!draftStart || !draftEnd) return null;
    const a = startOfDayMs(draftStart);
    const b = startOfDayMs(draftEnd);
    return { lo: Math.min(a, b), hi: Math.max(a, b) };
  }, [draftStart, draftEnd]);

  const dayInRange = useCallback(
    (d: Date) => {
      if (!rangeBounds) return false;
      const x = startOfDayMs(d);
      return x >= rangeBounds.lo && x <= rangeBounds.hi;
    },
    [rangeBounds]
  );

  const dayIsEndpoint = useCallback(
    (d: Date) => {
      if (draftStart && isSameDay(d, draftStart)) return true;
      if (draftEnd && isSameDay(d, draftEnd)) return true;
      return false;
    },
    [draftStart, draftEnd]
  );

  const onPickDay = useCallback(
    (date: Date) => {
      setDraftStart(date);
      setDraftEnd(date);
      onChange(toYmd(date));
      setOpen(false);
    },
    [onChange]
  );

  const captionText = value
    ? parseYmd(value)?.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }) ?? placeholder
    : placeholder;

  const captionTitle =
    highlightedDates.length > 0
      ? `${captionText} · «·» под числом — отметки формы.`
      : captionText;

  const popoverNode =
    open && popover ? (
      <FinanceCalendarPopoverPanel
        popoverRef={popoverRef}
        box={popover}
        ariaLabel="Календарь"
        topSlot={
          <div className="mb-2 px-0.5" aria-hidden>
            <div className="mt-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex min-w-full">
                <div className="mx-auto flex min-h-[2.25rem] w-max flex-nowrap items-center gap-1 px-0.5" />
              </div>
            </div>
          </div>
        }
        calendar={
          <FinanceMonthCalendar
            viewMonth={viewDate}
            onViewMonthChange={setViewDate}
            sessionToday={sessionToday}
            mode="range"
            isDayInRange={dayInRange}
            isDayEndpoint={dayIsEndpoint}
            onPickDay={onPickDay}
            highlightedYmds={highlightedDates}
          />
        }
        footerCenterTitle={captionText}
        footerCenterTitleAttr={captionTitle}
        checkDisabled={false}
        checkAriaLabel="Закрыть календарь"
        checkTitle="Готово"
        resetAriaLabel="Сбросить дату"
        resetTitle="Сбросить"
        onReset={() => {
          setDraftStart(null);
          setDraftEnd(null);
          onChange("");
        }}
        onCheck={() => setOpen(false)}
      />
    ) : null;

  return (
    <div ref={anchorRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "group flex w-full max-w-full items-center justify-between gap-2 rounded-xl border px-2.5 py-1.5 text-left outline-none transition duration-200 ease-out",
          "border-border/55 bg-gradient-to-br from-background/70 to-muted/25 backdrop-blur-md",
          "hover:border-primary/40 hover:from-background/85 hover:to-muted/35 hover:shadow-[0_8px_28px_-8px_hsl(var(--primary)/0.22)]",
          open &&
            "border-primary/50 from-background/90 to-muted/40 ring-2 ring-primary/25 shadow-[0_10px_32px_-10px_hsl(var(--primary)/0.35)]"
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <CalendarDays
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition duration-200",
              "group-hover:text-primary",
              open && "text-primary"
            )}
            strokeWidth={2}
            aria-hidden
          />
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm font-semibold tabular-nums tracking-tight",
              value ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {value ? parseYmd(value)?.toLocaleDateString("ru-RU") : placeholder}
          </span>
        </span>
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition duration-200",
            open && "rotate-90 text-primary"
          )}
          strokeWidth={2}
          aria-hidden
        />
      </button>
      {open && popoverNode ? createPortal(popoverNode, document.body) : null}
    </div>
  );
}
