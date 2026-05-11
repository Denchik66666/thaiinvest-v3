"use client";

/**
 * Выбор периода для ленты операций: пресеты или диапазон на календаре (общая шкурка с `DatePicker` / финансы).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { computeFinanceCalendarPopoverPosition } from "@/components/ui/finance-calendar-popover-skin";
import { FinanceMonthCalendar } from "@/components/ui/FinanceMonthCalendar";
import { FinanceCalendarPopoverPanel } from "@/components/ui/FinanceCalendarPopoverPanel";

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

function presetChipText(p: PeriodPreset): string {
  if (p === "7d") return "7";
  if (p === "30d") return "30";
  if (p === "90d") return "90";
  if (p === "365d") return "365";
  return "∞";
}

/** Подпись выбранного периода для UI (сводки, aria). */
export function formatHistoryPeriodCaption(period: HistoryPeriodValue): string {
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

function formatDraftRangeCaption(draftStart: Date | null, draftEnd: Date | null): string | null {
  if (!draftStart && !draftEnd) return null;
  const fmt = (d: Date) => d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
  if (draftStart && !draftEnd) return `c ${fmt(draftStart)}`;
  if (!draftStart && draftEnd) return `до ${fmt(draftEnd)}`;
  if (!draftStart || !draftEnd) return null;
  const a = draftStart <= draftEnd ? draftStart : draftEnd;
  const b = draftStart <= draftEnd ? draftEnd : draftStart;
  return `${fmt(a)} — ${fmt(b)}`;
}

function isPresetActive(period: HistoryPeriodValue, preset: PeriodPreset) {
  return period.kind === "preset" && period.preset === preset;
}

/** Тот же ряд чипов 7 / 30 / 90 / 365 / ∞, что в ленте «Финансы». */
export function FinanceCalendarPresetChipRow({
  isChipActive,
  onPick,
}: {
  isChipActive: (id: PeriodPreset) => boolean;
  onPick: (id: PeriodPreset) => void;
}) {
  return (
    <div className="mb-2 px-0.5">
      <div className="mt-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-full">
          <div className="mx-auto flex w-max flex-nowrap gap-1 px-0.5">
            {PRESETS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => onPick(id)}
                aria-label={`Период: ${label}`}
                title={label}
                className={cn(
                  "min-w-[2.25rem] rounded-lg px-2 py-1 text-[11px] font-semibold tabular-nums transition",
                  isChipActive(id)
                    ? "bg-[color:var(--thai-color-accrued-bg)] text-[color:var(--thai-color-accrued)] shadow-[0_0_12px_-6px_color-mix(in_srgb,var(--thai-color-accrued)_55%,transparent)]"
                    : "text-[color:var(--thai-color-accrued)] hover:bg-white/[0.06]"
                )}
              >
                {presetChipText(id)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

type HistoryPeriodPopoverProps = {
  value: HistoryPeriodValue;
  onChange: (next: HistoryPeriodValue) => void;
  className?: string;
  compact?: boolean;
  /**
   * Панель «Финансы»: только значок календаря в одной строке с чипами типов, без подписи «Период».
   * По умолчанию — прежний вид (подпись + иконка).
   */
  triggerVariant?: "default" | "toolbar";
};

export function HistoryPeriodPopover({
  value,
  onChange,
  className,
  compact = false,
  triggerVariant = "default",
}: HistoryPeriodPopoverProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popover, setPopover] = useState<{ top: number; left: number; width: number } | null>(null);

  const [viewDate, setViewDate] = useState(() => new Date());
  const [draftStart, setDraftStart] = useState<Date | null>(null);
  const [draftEnd, setDraftEnd] = useState<Date | null>(null);

  function syncDraftFromValue(current: HistoryPeriodValue) {
    if (current.kind === "range") {
      const a = parseYmd(current.fromYmd);
      const b = parseYmd(current.toYmd);
      setDraftStart(a);
      setDraftEnd(b);
      if (a) setViewDate(startOfMonth(a));
      return;
    }
    setDraftStart(null);
    setDraftEnd(null);
    setViewDate(startOfMonth(new Date()));
  }

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
    setPopover(computeFinanceCalendarPopoverPosition(anchor.getBoundingClientRect()));
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

  const sessionToday = useMemo(() => (open ? new Date() : new Date()), [open]);

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

  const rangeReady = Boolean(draftStart && draftEnd);
  const draftCaption = formatDraftRangeCaption(draftStart, draftEnd);
  const triggerCaption = draftCaption ?? formatHistoryPeriodCaption(value);

  const popoverNode =
    open && popover ? (
      <FinanceCalendarPopoverPanel
        popoverRef={popoverRef}
        box={popover}
        ariaLabel="Период для истории операций"
        topSlot={<FinanceCalendarPresetChipRow isChipActive={(id) => isPresetActive(value, id)} onPick={pickPreset} />}
        calendar={
          <FinanceMonthCalendar
            viewMonth={viewDate}
            onViewMonthChange={setViewDate}
            sessionToday={sessionToday}
            mode="range"
            isDayInRange={dayInRange}
            isDayEndpoint={dayIsEndpoint}
            onPickDay={onPickDay}
          />
        }
        footerCenterTitle={triggerCaption}
        footerCenterTitleAttr={triggerCaption}
        checkDisabled={!rangeReady}
        checkAriaLabel="Применить период"
        checkTitle={rangeReady ? "Применить" : "Выберите начало и конец"}
        resetAriaLabel="Сбросить выбор периода"
        resetTitle="Сбросить"
        onReset={() => {
          setDraftStart(null);
          setDraftEnd(null);
        }}
        onCheck={applyRange}
      />
    ) : null;

  return (
    <div ref={anchorRef} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Период: ${formatHistoryPeriodCaption(value)}`}
        onClick={() => {
          setOpen((v) => {
            if (!v) syncDraftFromValue(value);
            return !v;
          });
        }}
        title={triggerVariant === "toolbar" ? formatHistoryPeriodCaption(value) : undefined}
        className={cn(
          "group inline-flex max-w-full items-center gap-2 rounded-xl border text-left outline-none transition duration-200 ease-out",
          triggerVariant === "toolbar"
            ? "h-7 shrink-0 gap-1.5 rounded-full border-border/42 bg-background/45 px-2 backdrop-blur-md hover:border-primary/35 hover:bg-muted/22 dark:border-white/[0.08] dark:bg-transparent dark:hover:bg-white/[0.05]"
            : cn(compact ? "gap-1.5 rounded-lg px-2 py-1" : "gap-2 rounded-xl px-2.5 py-1.5"),
          triggerVariant !== "toolbar" &&
            cn(
              "border-border/55 bg-gradient-to-br from-background/70 to-muted/25 backdrop-blur-md",
              "hover:border-primary/40 hover:from-background/85 hover:to-muted/35 hover:shadow-[0_8px_28px_-8px_hsl(var(--primary)/0.22)]",
              open &&
                "border-primary/50 from-background/90 to-muted/40 ring-2 ring-primary/25 shadow-[0_10px_32px_-10px_hsl(var(--primary)/0.35)]"
            ),
          triggerVariant === "toolbar" &&
            open &&
            "border-primary/38 bg-primary/[0.08] ring-1 ring-primary/22 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] dark:bg-white/[0.06]"
        )}
      >
        {triggerVariant === "toolbar" ? (
          <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/[0.14] to-primary/[0.06] ring-1 ring-primary/25 transition duration-200 dark:from-primary/[0.12] dark:to-primary/[0.05]">
            <CalendarDays
              className="h-[15px] w-[15px] shrink-0 text-primary/95 dark:text-primary/90"
              strokeWidth={2.35}
              aria-hidden
            />
          </span>
        ) : (
          <CalendarDays
            className={cn(
              compact ? "h-3 w-3" : "h-3.5 w-3.5",
              "shrink-0 text-muted-foreground transition duration-200",
              "group-hover:text-primary",
              open && "text-primary"
            )}
            strokeWidth={2}
            aria-hidden
          />
        )}
        {triggerVariant !== "toolbar" ? (
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span
                className={cn(
                  "shrink-0 font-semibold uppercase tracking-[0.14em] text-muted-foreground group-hover:text-foreground/75",
                  compact ? "text-[8px]" : "text-[9px]"
                )}
              >
                Период
              </span>
              <span
                className={cn(
                  "min-w-0 truncate font-medium tabular-nums text-muted-foreground/80",
                  compact ? "text-[10px]" : "text-[11px]"
                )}
                title={triggerCaption}
              >
                · {triggerCaption}
              </span>
            </span>
          </span>
        ) : null}
        {triggerVariant === "toolbar" ? (
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition duration-200",
              open && "rotate-180 text-primary"
            )}
            strokeWidth={2}
            aria-hidden
          />
        ) : (
          <ChevronRight
            className={cn(
              compact ? "h-3 w-3" : "h-3.5 w-3.5",
              "shrink-0 text-muted-foreground transition duration-200",
              open && "rotate-90 text-primary"
            )}
            strokeWidth={2}
            aria-hidden
          />
        )}
      </button>
      {open && popoverNode ? createPortal(popoverNode, document.body) : null}
    </div>
  );
}
