"use client";

/**
 * Выбор периода для ленты операций: пресеты или диапазон на календаре (тот же визуальный язык, что DatePicker).
 */
import type { CSSProperties } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

const POPOVER_ESTIMATE_H = 520;

export type PeriodPreset = "7d" | "30d" | "90d" | "365d" | "all";

export type HistoryPeriodValue =
  | { kind: "preset"; preset: PeriodPreset }
  | { kind: "range"; fromYmd: string; toYmd: string };

export function periodStartMs(p: PeriodPreset): number | null {
  if (p === "all") return null;
  const days = p === "7d" ? 7 : p === "30d" ? 30 : p === "90d" ? 90 : 365;
  return Date.now() - days * 86400000;
}

export function parseYmd(value: string): Date | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d) return null;
  const dt = new Date(y, mo - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function toYmd(date: Date): string {
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

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}

/** Фильтр по `sortAt` ISO (клиент). */
export function sortAtInHistoryPeriod(sortAtIso: string, period: HistoryPeriodValue): boolean {
  const t = new Date(sortAtIso).getTime();
  if (period.kind === "preset") {
    const start = periodStartMs(period.preset);
    if (start == null) return true;
    return t >= start;
  }
  const fromD = parseYmd(period.fromYmd);
  const toD = parseYmd(period.toYmd);
  if (!fromD || !toD) return true;
  return t >= startOfDay(fromD) && t <= endOfDay(toD);
}

const PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: "7d", label: "7 дн." },
  { id: "30d", label: "30 дн." },
  { id: "90d", label: "90 дн." },
  { id: "365d", label: "Год" },
  { id: "all", label: "Всё время" },
];

function periodTriggerLabel(period: HistoryPeriodValue): string {
  if (period.kind === "preset") {
    return PRESETS.find((p) => p.id === period.preset)?.label ?? "Период";
  }
  const a = parseYmd(period.fromYmd);
  const b = parseYmd(period.toYmd);
  if (!a || !b) return "Свой период";
  const fmt = (d: Date) =>
    d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
  return `${fmt(a)} — ${fmt(b)}`;
}

function isPresetActive(period: HistoryPeriodValue, preset: PeriodPreset) {
  return period.kind === "preset" && period.preset === preset;
}

type HistoryPeriodPopoverProps = {
  value: HistoryPeriodValue;
  onChange: (next: HistoryPeriodValue) => void;
  className?: string;
};

export function HistoryPeriodPopover({ value, onChange, className }: HistoryPeriodPopoverProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popover, setPopover] = useState<{ top: number; left: number; width: number } | null>(null);

  const [viewDate, setViewDate] = useState(() => new Date());
  const [draftStart, setDraftStart] = useState<Date | null>(null);
  const [draftEnd, setDraftEnd] = useState<Date | null>(null);

  useEffect(() => {
    if (!open) return;
    if (value.kind === "range") {
      const a = parseYmd(value.fromYmd);
      const b = parseYmd(value.toYmd);
      setDraftStart(a);
      setDraftEnd(b);
      if (a) setViewDate(startOfMonth(a));
    } else {
      setDraftStart(null);
      setDraftEnd(null);
      setViewDate(startOfMonth(new Date()));
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
    const rect = anchor.getBoundingClientRect();
    const desiredWidth = Math.min(380, Math.max(300, rect.width + 120));
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
      "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
      "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
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

  const sessionToday = useMemo(() => new Date(), [open]);

  const rangeBounds = useMemo(() => {
    if (!draftStart || !draftEnd) return null;
    const a = startOfDay(draftStart);
    const b = startOfDay(draftEnd);
    return { lo: Math.min(a, b), hi: Math.max(a, b) };
  }, [draftStart, draftEnd]);

  function dayInRange(d: Date): boolean {
    if (!rangeBounds) return false;
    const x = startOfDay(d);
    return x >= rangeBounds.lo && x <= rangeBounds.hi;
  }

  function dayIsEndpoint(d: Date): boolean {
    if (draftStart && isSameDay(d, draftStart)) return true;
    if (draftEnd && isSameDay(d, draftEnd)) return true;
    return false;
  }

  function onPickDay(date: Date) {
    if (!draftStart || (draftStart && draftEnd)) {
      setDraftStart(date);
      setDraftEnd(null);
      return;
    }
    if (draftStart && !draftEnd) {
      setDraftEnd(date);
    }
  }

  function applyRange() {
    if (!draftStart || !draftEnd) return;
    const a = draftStart <= draftEnd ? draftStart : draftEnd;
    const b = draftStart <= draftEnd ? draftEnd : draftStart;
    onChange({ kind: "range", fromYmd: toYmd(a), toYmd: toYmd(b) });
    setOpen(false);
  }

  function pickPreset(preset: PeriodPreset) {
    onChange({ kind: "preset", preset });
    setOpen(false);
  }

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

  const rangeReady = Boolean(draftStart && draftEnd);

  const popoverNode =
    open && popover ? (
      <div
        ref={popoverRef}
        role="dialog"
        aria-label="Период для истории операций"
        style={panelStyle}
        className="z-[20000] isolate max-h-[min(92vh,640px)] overflow-y-auto overflow-x-hidden rounded-2xl border p-1 shadow-none"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-white/[0.07] via-transparent to-primary/[0.06] dark:from-white/[0.04] dark:to-primary/[0.04]"
        />
        <div className="relative rounded-[14px] bg-gradient-to-b from-background/35 to-background/[0.02] px-2.5 pb-2 pt-2">
          <div className="mb-2 px-0.5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Быстрый выбор</div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {PRESETS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => pickPreset(id)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition",
                    isPresetActive(value, id)
                      ? "border-primary/50 bg-primary/15 text-primary shadow-[0_0_12px_-2px_hsl(var(--primary)/0.35)]"
                      : "border-border/45 bg-background/40 text-foreground hover:border-primary/35 hover:bg-muted/25"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-2 border-t border-border/30 pt-2">
            <div className="px-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Свой период в календаре
            </div>
            <p className="mt-1 px-0.5 text-[10px] leading-snug text-muted-foreground">
              Первый день — начало, второй — конец. Затем «Применить».
            </p>
          </div>

          <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
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
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Месяц</div>
              <div className="truncate text-sm font-bold tracking-tight text-foreground sm:text-[15px]">{monthLabel}</div>
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

          <div className="mb-1.5 grid grid-cols-7 gap-0.5 px-0.5 text-muted-foreground">
            {daysHeader.map((d) => (
              <div key={d} className="py-1 text-center text-[10px] font-semibold uppercase tracking-wide">
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
              const inRange = dayInRange(date);
              const endpoint = dayIsEndpoint(date);
              const ymd = toYmd(date);

              return (
                <button
                  key={`${idx}-${ymd}`}
                  type="button"
                  onClick={() => onPickDay(date)}
                  className={cn(
                    "relative flex h-10 flex-col items-center justify-center rounded-xl text-[13px] font-semibold tabular-nums transition duration-200 ease-out",
                    inMonth ? "text-foreground" : "text-muted-foreground/45",
                    inRange && !endpoint && "bg-primary/12 ring-1 ring-primary/15",
                    endpoint &&
                      "bg-gradient-to-br from-primary to-primary/85 text-primary-foreground shadow-[0_6px_16px_-4px_hsl(var(--primary)/0.55)] ring-1 ring-white/25",
                    !inRange && !endpoint && "hover:bg-background/70 hover:ring-1 hover:ring-border/50",
                    !inRange && !endpoint && isToday && "ring-1 ring-[color-mix(in_srgb,var(--thai-color-due)_55%,transparent)] bg-[color-mix(in_srgb,var(--thai-color-due)_12%,transparent)]"
                  )}
                >
                  <span className="leading-none">{date.getDate()}</span>
                  <span className="h-1.5 shrink-0" aria-hidden />
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border/30 pt-2">
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
              onClick={() => {
                setDraftStart(null);
                setDraftEnd(null);
              }}
            >
              Сбросить выбор
            </button>
            <div className="flex gap-1.5">
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-foreground transition hover:bg-muted/50"
                onClick={() => setOpen(false)}
              >
                Закрыть
              </button>
              <button
                type="button"
                disabled={!rangeReady}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-[11px] font-semibold transition",
                  rangeReady
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "cursor-not-allowed opacity-40"
                )}
                onClick={applyRange}
              >
                Применить период
              </button>
            </div>
          </div>
        </div>
      </div>
    ) : null;

  return (
    <div ref={anchorRef} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Период: ${periodTriggerLabel(value)}`}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "group inline-flex max-w-full items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left outline-none transition duration-200 ease-out",
          "border-border/55 bg-gradient-to-br from-background/70 to-muted/25 backdrop-blur-md",
          "hover:border-primary/40 hover:from-background/85 hover:to-muted/35 hover:shadow-[0_8px_28px_-8px_hsl(var(--primary)/0.22)]",
          open &&
            "border-primary/50 from-background/90 to-muted/40 ring-2 ring-primary/25 shadow-[0_10px_32px_-10px_hsl(var(--primary)/0.35)]"
        )}
      >
        <CalendarDays
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition duration-200",
            "group-hover:text-primary",
            open && "text-primary"
          )}
          strokeWidth={2}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground group-hover:text-foreground/75">
            Период
          </span>
        </span>
        <ChevronRight
          className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition duration-200", open && "rotate-90 text-primary")}
          strokeWidth={2}
          aria-hidden
        />
      </button>
      {open && popoverNode ? createPortal(popoverNode, document.body) : null}
    </div>
  );
}
