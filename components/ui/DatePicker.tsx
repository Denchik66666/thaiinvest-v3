"use client";

/**
 * Календарь в портале на `document.body`.
 * Сетка — тот же режим `range`, что в `HistoryPeriodPopover` (финансы): один выбранный день = диапазон [d, d].
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { investDeskModalFigureClass } from "@/lib/dashboard-glass-accent";
import { CalendarSheet31Icon } from "@/components/ui/CalendarSheet31Icon";
import {
  computeDatePickerCalendarPopoverPosition,
  computeFinanceCalendarPopoverPosition,
} from "@/components/ui/finance-calendar-popover-skin";
import { FinanceCalendarPopoverPanel } from "@/components/ui/FinanceCalendarPopoverPanel";
import { FinanceMonthCalendar, startOfMonth } from "@/components/ui/FinanceMonthCalendar";
import {
  FinanceCalendarPresetChipRow,
  type PeriodPreset,
} from "@/components/dashboard/HistoryPeriodPopover";

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

/** ДД.ММ.ГГ для триггера и подписи в футере попапа */
function formatDateShortRu(d: Date) {
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/** Дата (локальный полдень), совпадающая с чипом периода в ленте «Финансы». */
function ymdForFinancePreset(p: PeriodPreset): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (p === "all") return toYmd(d);
  const days = p === "7d" ? 7 : p === "30d" ? 30 : p === "90d" ? 90 : 365;
  d.setDate(d.getDate() - days);
  return toYmd(d);
}

export type DatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  highlightedDates?: string[];
  /** Встроить в строку текста (тот же попап, что в «Финансах»). */
  inline?: boolean;
  /** Иконка «лист календаря» с числом 31. */
  variant?: "default" | "sheet31";
  /** Показать кнопку сброса в футере попапа. */
  allowClear?: boolean;
  disabled?: boolean;
  /** Убрать минимальную высоту строки — для компактной шапки рядом с крупным текстом. */
  dense?: boolean;
  /** Попап как в ленте «Финансы» (`HistoryPeriodPopover`): стекло, без `plain`. @default true */
  popoverGlass?: boolean;
  /**
   * Ряд чипов 7 / 30 / 90 / 365 / ∞ над сеткой (как в ленте). Только при `popoverGlass`.
   * Включать точечно, где нужен быстрый выбор «как период в финансах»; фильтр ленты — `HistoryPeriodPopover`.
   * @default false
   */
  financePresetChips?: boolean;
  /**
   * Триггер как в тулбаре ленты: `CalendarDays` 15px + дата + шеврон, без рамки и фона.
   * Только с `inline`.
   */
  financeFeedToolbar?: boolean;
  /** Классы к тексту выбранной даты в дефолтном триггере (вместо `text-foreground`). */
  triggerValueClassName?: string;
  /** Классы к иконке календаря в `variant="default"` (вместо muted/foreground). */
  calendarIconClassName?: string;
  /** Подсказка у кнопки-триггера в режиме `financeFeedToolbar` (иначе «Дата входа»). */
  triggerTitle?: string;
};

/** Триггер: только иконка, без фона и обводки (наведение — смена цвета). */
const ghostCalendarTriggerBtn =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 transition outline-none " +
  "text-muted-foreground hover:text-foreground " +
  "focus-visible:ring-2 focus-visible:ring-ring " +
  "disabled:pointer-events-none disabled:opacity-40";

export function DatePicker({
  value,
  onChange,
  placeholder = "Выбери дату",
  className,
  highlightedDates = [],
  inline = false,
  variant = "default",
  allowClear = true,
  disabled = false,
  dense = false,
  popoverGlass = true,
  financePresetChips = false,
  financeFeedToolbar = false,
  triggerValueClassName,
  calendarIconClassName,
  triggerTitle,
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
    queueMicrotask(() => {
      if (d) {
        setDraftStart(d);
        setDraftEnd(d);
        setViewDate(startOfMonth(d));
      } else {
        setDraftStart(null);
        setDraftEnd(null);
      }
    });
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
    setPopover(
      popoverGlass ? computeFinanceCalendarPopoverPosition(rect) : computeDatePickerCalendarPopoverPosition(rect)
    );
  };

  useLayoutEffect(() => {
    if (!open) return;
    queueMicrotask(() => computePopover());
    const onResize = () => computePopover();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, popoverGlass]);

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

  const captionText = value ? (parseYmd(value) ? formatDateShortRu(parseYmd(value)!) : placeholder) : placeholder;

  const captionTitle =
    highlightedDates.length > 0
      ? `${captionText} · «·» под числом — отметки формы.`
      : captionText;

  const popoverNode =
    open && popover ? (
      <FinanceCalendarPopoverPanel
        plain={!popoverGlass}
        popoverRef={popoverRef}
        box={popover}
        ariaLabel="Календарь"
        topSlot={
          popoverGlass && financePresetChips ? (
            <FinanceCalendarPresetChipRow
              isChipActive={(id) => Boolean(value) && value === ymdForFinancePreset(id)}
              onPick={(preset) => {
                const ymd = ymdForFinancePreset(preset);
                const parsed = parseYmd(ymd);
                if (parsed) {
                  setDraftStart(parsed);
                  setDraftEnd(parsed);
                  setViewDate(startOfMonth(parsed));
                }
                onChange(ymd);
                setOpen(false);
              }}
            />
          ) : !popoverGlass ? (
            <div className="mb-2 px-0.5" aria-hidden>
              <div className="mt-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex min-w-full">
                  <div className="mx-auto flex min-h-[2.25rem] w-max flex-nowrap items-center gap-1 px-0.5" />
                </div>
              </div>
            </div>
          ) : null
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
        showReset={allowClear}
      />
    ) : null;

  const sheet31Icon = (
    <CalendarSheet31Icon
      className={cn(
        "h-6 w-6 transition duration-200",
        open ? "scale-[1.02]" : "group-hover/icon:scale-[1.01]"
      )}
    />
  );

  const Icon =
    variant === "sheet31" ? (
      sheet31Icon
    ) : (
      <CalendarDays
        className={cn(
          "h-4 w-4 shrink-0 transition duration-200",
          !calendarIconClassName && (open ? "text-foreground" : "text-muted-foreground"),
          calendarIconClassName
        )}
        strokeWidth={2}
        aria-hidden
      />
    );

  const displayDate =
    value && parseYmd(value) ? formatDateShortRu(parseYmd(value)!) : placeholder;

  /** Как тулбар ленты «Финансы»: без подложки и обводки у триггера. */
  if (financeFeedToolbar && inline) {
    return (
      <div ref={anchorRef} className={cn("relative inline-flex shrink-0 items-center", className)}>
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={`Дата входа: ${displayDate}`}
          title={triggerTitle ?? "Дата входа"}
          disabled={disabled}
          onClick={() => !disabled && setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-sm border-0 bg-transparent p-0 outline-none transition-colors hover:opacity-95 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
        >
          <CalendarDays
            className={cn(
              "h-[15px] w-[15px] shrink-0",
              calendarIconClassName ?? "text-primary/95 dark:text-primary/90"
            )}
            strokeWidth={2.35}
            aria-hidden
          />
          <span
            className={cn(
              "min-w-0 text-xs font-medium tabular-nums sm:text-[13px]",
              value && parseYmd(value)
                ? (triggerValueClassName ?? "text-muted-foreground")
                : "text-muted-foreground/75"
            )}
          >
            {displayDate}
          </span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
              open && "rotate-180",
              open &&
                (triggerValueClassName
                  ? cn(triggerValueClassName, "opacity-90")
                  : "text-primary/90")
            )}
            strokeWidth={2}
            aria-hidden
          />
        </button>
        {open && popoverNode ? createPortal(popoverNode, document.body) : null}
      </div>
    );
  }

  /** Дата текстом, затем «голая» иконка-кнопка как «Готово» в календаре. */
  const sheet31InlineGhost = inline && variant === "sheet31";

  if (sheet31InlineGhost) {
    return (
      <div ref={anchorRef} className={cn("relative inline-flex max-w-none shrink-0 items-center gap-1.5", className)}>
        <span
          className={cn(
            "min-w-0 text-[11px] tabular-nums tracking-tight",
            value && parseYmd(value) ? investDeskModalFigureClass : "font-medium text-muted-foreground"
          )}
        >
          {captionText}
        </span>
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label="Открыть календарь"
          title="Открыть календарь"
          disabled={disabled}
          onClick={() => !disabled && setOpen((v) => !v)}
          className={cn(ghostCalendarTriggerBtn, "group/icon", open && "text-foreground")}
        >
          {sheet31Icon}
        </button>
        {open && popoverNode ? createPortal(popoverNode, document.body) : null}
      </div>
    );
  }

  return (
    <div
      ref={anchorRef}
      className={cn(
        "relative flex w-full max-w-full items-center gap-2",
        dense ? "min-h-0" : "min-h-[2.25rem]",
        inline && "inline-flex w-auto max-w-none shrink-0",
        className
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Открыть календарь"
        title="Календарь"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={cn(
          ghostCalendarTriggerBtn,
          dense && "h-7 w-7",
          "shrink-0",
          disabled && "pointer-events-none opacity-50"
        )}
      >
        {Icon}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={cn(
          "min-w-0 flex-1 truncate text-left text-[11px] font-medium tabular-nums tracking-tight outline-none",
          value && parseYmd(value)
            ? (triggerValueClassName ?? "text-foreground")
            : "text-muted-foreground",
          inline && "max-w-[5.5rem]",
          disabled && "pointer-events-none opacity-50"
        )}
      >
        {displayDate}
      </button>
      {open && popoverNode ? createPortal(popoverNode, document.body) : null}
    </div>
  );
}
