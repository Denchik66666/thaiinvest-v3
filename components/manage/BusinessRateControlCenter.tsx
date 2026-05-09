"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { getWeekStartMonday, startOfDay } from "@/lib/weekly";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { DatePicker } from "@/components/ui/DatePicker";
import {
  HistoryPeriodPopover,
  sortAtInHistoryPeriod,
  type HistoryPeriodValue,
} from "@/components/dashboard/HistoryPeriodPopover";
import { FinanceMonthCalendar, startOfMonth } from "@/components/ui/FinanceMonthCalendar";
import { useAppDialogs } from "@/components/feedback/AppDialogsProvider";
import { cn } from "@/lib/utils";
import {
  type BusinessRateHistoryRow,
  dedupeBusinessRateHistory,
  formatRuDate,
  milestonesFromRates,
  ymdFromRow,
} from "@/lib/business-rate-history-display";

export type { BusinessRateHistoryRow } from "@/lib/business-rate-history-display";
export type PatchPlanRowPayload = {
  id: number;
  newRate: number;
  effectiveDate: string;
  comment: string | null;
};

type Props = {
  current: { rate: number; effectiveDate: string } | null;
  rates: BusinessRateHistoryRow[];
  isHistoryLoading?: boolean;
  onSubmit: (payload: { newRate: number; effectiveDate: string; comment?: string }) => Promise<unknown>;
  isSubmitting: boolean;
  submitError: string | null;
  onPatchPlanRow?: (payload: PatchPlanRowPayload) => Promise<unknown>;
  onDeletePlanRow?: (id: number) => Promise<unknown>;
  planSectionBusy?: boolean;
  planBusyRowId?: number | null;
  planActionError?: string | null;
  /** Подписи в UI; менять ставку через API может только OWNER. */
  viewerRole?: "OWNER" | "SUPER_ADMIN";
};

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

function rateEffectiveOnDay(day: Date, milestonesAsc: BusinessRateHistoryRow[]): number | null {
  const t = startOfDay(day).getTime();
  let last: number | null = null;
  for (const m of milestonesAsc) {
    const eff = startOfDay(new Date(m.effectiveDate)).getTime();
    if (eff <= t) last = m.newRate;
    else break;
  }
  return last;
}

/** Один внешний контейнер: стекло, без «коробки в коробке». */
const rateShellClass =
  "relative isolate overflow-hidden rounded-2xl border border-border/15 bg-gradient-to-b from-card/50 via-card/25 to-transparent shadow-[0_24px_48px_-36px_rgba(0,0,0,0.55)] backdrop-blur-2xl dark:border-white/[0.06] dark:from-white/[0.045] dark:via-card/20 dark:to-transparent dark:shadow-[0_28px_56px_-32px_rgba(0,0,0,0.85)]";

const insetWellClass =
  "rounded-xl border border-white/[0.06] bg-black/[0.12] px-3 py-2 dark:border-white/[0.07] dark:bg-black/30";

const labelClass = "mb-1 block text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/90";

const compactInputClass =
  "h-10 rounded-xl border-0 bg-foreground/[0.04] px-3 text-sm tabular-nums text-foreground ring-1 ring-inset ring-foreground/[0.08] transition placeholder:text-muted-foreground/50 focus-visible:bg-foreground/[0.06] focus-visible:ring-primary/35 dark:bg-white/[0.04] dark:ring-white/[0.08]";

const compactTextareaClass =
  "min-h-[3rem] resize-none rounded-xl border-0 bg-foreground/[0.04] px-3 py-2 text-xs leading-snug ring-1 ring-inset ring-foreground/[0.08] focus-visible:ring-primary/35 dark:bg-white/[0.04] dark:ring-white/[0.08]";

const hairline = "border-t border-foreground/[0.06] dark:border-white/[0.06]";

/** Чипы фильтра журнала — как `financeProminentFilters` в `DashboardOperationsHistory`. */
const journalFilterChipClass = (active: boolean) =>
  cn(
    "h-7 shrink-0 whitespace-nowrap rounded-full px-2.5 py-0 text-[10px] font-semibold leading-none",
    active
      ? cn(
          "border-primary/30 bg-primary/[0.06] text-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] backdrop-blur-md hover:bg-primary/[0.1]",
          "dark:border-primary/22 dark:bg-white/[0.05] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] dark:hover:bg-white/[0.07]"
        )
      : "border-border/42 bg-background/45 text-muted-foreground hover:border-border/55 hover:bg-muted/18 hover:text-foreground dark:border-white/[0.08] dark:bg-transparent dark:hover:bg-white/[0.04]"
  );

export function BusinessRateControlCenter({
  current,
  rates,
  isHistoryLoading,
  onSubmit,
  isSubmitting,
  submitError,
  onPatchPlanRow,
  onDeletePlanRow,
  planSectionBusy = false,
  planBusyRowId = null,
  planActionError = null,
  viewerRole = "OWNER",
}: Props) {
  const router = useRouter();
  const { confirm, toast } = useAppDialogs();
  const today = useMemo(() => startOfDay(new Date()), []);
  const mondayDefault = useMemo(() => toYmd(getWeekStartMonday(today)), [today]);

  const [selectedYmd, setSelectedYmd] = useState<string>(() => mondayDefault);
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const d = parseYmd(mondayDefault);
    return d ? startOfMonth(d) : startOfMonth(today);
  });
  const [form, setForm] = useState({
    newRate: "",
    effectiveDate: mondayDefault,
    comment: "",
  });
  const [planEdit, setPlanEdit] = useState<{
    id: number;
    newRate: string;
    effectiveDate: string;
    comment: string;
  } | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [calendarPlanExpanded, setCalendarPlanExpanded] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriodValue>({ kind: "preset", preset: "365d" });
  const [historyFilter, setHistoryFilter] = useState<"all" | "actual" | "plan">("all");

  const isOwner = viewerRole === "OWNER";

  const historyRows = useMemo(() => dedupeBusinessRateHistory(rates).slice(0, 100), [rates]);
  const historyVisibleRows = useMemo(() => {
    const today0 = today.getTime();
    return historyRows
      .filter((r) => sortAtInHistoryPeriod(r.effectiveDate, historyPeriod))
      .filter((r) => {
        if (historyFilter === "all") return true;
        const isFuture = startOfDay(new Date(r.effectiveDate)).getTime() > today0;
        return historyFilter === "plan" ? isFuture : !isFuture;
      });
  }, [historyRows, historyPeriod, historyFilter, today]);

  const milestonesAsc = useMemo(() => milestonesFromRates(rates), [rates]);

  const changeDays = useMemo(() => {
    const s = new Set<string>();
    for (const m of milestonesAsc) s.add(ymdFromRow(m.effectiveDate));
    return s;
  }, [milestonesAsc]);

  const nextPlanned = useMemo(() => {
    if (!milestonesAsc.length) return null;
    const t0 = today.getTime();
    const future = milestonesAsc.filter((m) => startOfDay(new Date(m.effectiveDate)).getTime() > t0);
    const row = future[0];
    if (!row) return null;
    return { rate: row.newRate, effectiveDate: row.effectiveDate };
  }, [milestonesAsc, today]);

  const selectedDay = useMemo(() => parseYmd(selectedYmd), [selectedYmd]);
  const rateOnSelectedRaw = selectedDay ? rateEffectiveOnDay(selectedDay, milestonesAsc) : null;
  const rateOnSelected = useMemo(() => {
    if (rateOnSelectedRaw != null) return rateOnSelectedRaw;
    if (!current || !selectedDay) return null;
    const eff = startOfDay(new Date(current.effectiveDate));
    if (startOfDay(selectedDay).getTime() >= eff.getTime()) return current.rate;
    return null;
  }, [rateOnSelectedRaw, current, selectedDay]);
  const accountingMonday = selectedDay ? getWeekStartMonday(startOfDay(selectedDay)) : null;

  const onCalendarPickDay = useCallback((ymd: string) => {
    const d = parseYmd(ymd);
    if (!d) return;
    setSelectedYmd(ymd);
    const mon = getWeekStartMonday(startOfDay(d));
    setForm((p) => ({ ...p, effectiveDate: toYmd(mon) }));
  }, []);

  const planCalendarRangeBounds = useMemo(() => {
    if (!selectedDay) return null;
    const t = startOfDay(selectedDay).getTime();
    return { lo: t, hi: t };
  }, [selectedDay]);

  const planCalendarDayInRange = useCallback(
    (d: Date) => {
      if (!planCalendarRangeBounds) return false;
      const x = startOfDay(d).getTime();
      return x >= planCalendarRangeBounds.lo && x <= planCalendarRangeBounds.hi;
    },
    [planCalendarRangeBounds]
  );

  const planCalendarDayEndpoint = useCallback(
    (d: Date) => Boolean(selectedDay && isSameDay(d, selectedDay)),
    [selectedDay]
  );

  const onPlanCalendarPickDay = useCallback(
    (d: Date) => {
      onCalendarPickDay(toYmd(d));
    },
    [onCalendarPickDay]
  );

  const onEffectiveMondayChange = useCallback((ymd: string) => {
    const d = parseYmd(ymd);
    if (!d) return;
    const mon = getWeekStartMonday(startOfDay(d));
    const monYmd = toYmd(mon);
    setForm((p) => ({ ...p, effectiveDate: monYmd }));
    setSelectedYmd(monYmd);
    setViewMonth(startOfMonth(mon));
  }, []);

  const futureSchedule = useMemo(() => {
    const t0 = today.getTime();
    return milestonesAsc.filter((m) => startOfDay(new Date(m.effectiveDate)).getTime() > t0);
  }, [milestonesAsc, today]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(form.newRate);
    if (!Number.isFinite(n) || n <= 0) return;
    try {
      await onSubmit({
        newRate: n,
        effectiveDate: form.effectiveDate,
        comment: form.comment.trim() || undefined,
      });
      setForm((prev) => ({ ...prev, newRate: "", comment: "" }));
      toast.success("Ставка сохранена");
    } catch {
      /* ошибка уже в submitError от мутации */
    }
  };

  const startPlanEdit = (m: BusinessRateHistoryRow) => {
    const monday = getWeekStartMonday(startOfDay(new Date(m.effectiveDate)));
    setPlanEdit({
      id: m.id,
      newRate: String(m.newRate),
      effectiveDate: toYmd(monday),
      comment: m.comment ?? "",
    });
  };

  const cancelPlanEdit = () => setPlanEdit(null);

  const handlePlanPatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planEdit || !onPatchPlanRow) return;
    const n = Number(planEdit.newRate);
    if (!Number.isFinite(n) || n <= 0) return;
    try {
      await onPatchPlanRow({
        id: planEdit.id,
        newRate: n,
        effectiveDate: planEdit.effectiveDate,
        comment: planEdit.comment.trim() || null,
      });
      setPlanEdit(null);
      toast.success("План обновлён");
    } catch {
      /* ошибка в planActionError */
    }
  };

  const handlePlanDelete = async (id: number) => {
    if (!onDeletePlanRow) return;
    const ok = await confirm({
      title: "Удалить запланированное изменение ставки?",
      description:
        "Удалятся все записи на этот понедельник в плане (включая дубликаты). Пересчёт начислений выполнится автоматически.",
      confirmLabel: "Удалить",
      cancelLabel: "Отмена",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await onDeletePlanRow(id);
      if (planEdit?.id === id) setPlanEdit(null);
      toast.success("Запланированное изменение удалено");
    } catch {
      toast.error("Не удалось удалить запись");
    }
  };

  const planActionsEnabled = Boolean(onPatchPlanRow && onDeletePlanRow);

  return (
    <div className={cn(rateShellClass)}>
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.55] dark:opacity-70"
        aria-hidden
        style={{
          background:
            "radial-gradient(100% 80% at 0% 0%, hsl(var(--primary) / 0.14), transparent 55%), radial-gradient(90% 70% at 100% 100%, hsl(var(--primary) / 0.08), transparent 50%)",
        }}
      />

      <div className="relative px-3.5 pb-3 pt-3.5 md:px-5 md:pb-4 md:pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
                Ставка сети
              </span>
              {current == null ? (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-100">
                  Нет базы
                </span>
              ) : (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400/90 shadow-[0_0_10px_rgba(52,211,153,0.45)]" title="Активна" />
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1">
              <span className="text-[2.1rem] font-semibold leading-none tracking-tight text-foreground tabular-nums md:text-[2.35rem]">
                {current != null ? `${current.rate}` : "—"}
                <span className="text-[0.45em] font-medium text-muted-foreground">%</span>
              </span>
              <div className="min-w-0 pb-0.5">
                {current?.effectiveDate ? (
                  <p className="text-[11px] leading-tight text-muted-foreground">
                    с <span className="font-medium tabular-nums text-foreground/90">{formatRuDate(current.effectiveDate)}</span>
                  </p>
                ) : (
                  <p className="max-w-[16rem] text-[11px] leading-snug text-muted-foreground">
                    Учётный цикл — с <span className="text-foreground/90">понедельника</span>. Задайте % и дату ниже.
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="shrink-0 text-right">
            {nextPlanned ? (
              <>
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/75">Далее</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                  {nextPlanned.rate}
                  <span className="text-[0.75em] font-medium text-muted-foreground">%</span>
                </p>
                <p className="text-[10px] tabular-nums text-muted-foreground">{formatRuDate(nextPlanned.effectiveDate)}</p>
              </>
            ) : (
              <p className="max-w-[9rem] text-right text-[10px] leading-snug text-muted-foreground/80">Нет запланированных смен</p>
            )}
          </div>
        </div>

        <form className="mt-4 space-y-2.5" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="min-w-0 flex-1 sm:max-w-[13rem]">
              <span className={labelClass}>Понедельник</span>
              <DatePicker
                value={form.effectiveDate}
                onChange={onEffectiveMondayChange}
                highlightedDates={Array.from(changeDays)}
              />
            </div>
            <div className="w-full sm:w-[6.5rem]">
              <label htmlFor="br-new-rate-quick" className={labelClass}>
                Новая %
              </label>
              <Input
                id="br-new-rate-quick"
                type="number"
                min={0.01}
                step={0.01}
                inputMode="decimal"
                placeholder={current != null ? String(current.rate) : "—"}
                value={form.newRate}
                onChange={(e) => setForm((p) => ({ ...p, newRate: e.target.value }))}
                className={compactInputClass}
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              className="h-10 w-full shrink-0 rounded-xl px-5 text-xs font-semibold sm:w-auto"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Сохранение…" : "Применить"}
            </Button>
          </div>
          {commentOpen ? (
            <div>
              <label htmlFor="br-comment-quick" className={labelClass}>
                Комментарий
              </label>
              <Textarea
                id="br-comment-quick"
                rows={2}
                placeholder=""
                value={form.comment}
                onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))}
                className={compactTextareaClass}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCommentOpen(true)}
              className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground transition hover:text-foreground"
            >
              Комментарий
            </button>
          )}
        </form>
        {submitError ? (
          <Text className="mt-2 text-[11px] leading-snug text-red-400">{submitError}</Text>
        ) : null}
      </div>

      <div className={cn(hairline, "relative")}>
        <button
          type="button"
          onClick={() => setHistoryExpanded((v) => !v)}
          aria-label={historyExpanded ? "Свернуть историю" : "Развернуть историю"}
          aria-expanded={historyExpanded}
          className={cn(
            "flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition md:px-5",
            "hover:bg-foreground/[0.03] dark:hover:bg-white/[0.03]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30"
          )}
        >
          <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/85">Журнал</span>
            {!isHistoryLoading ? (
              <span className="tabular-nums text-[11px] text-muted-foreground">{historyVisibleRows.length} записей</span>
            ) : (
              <span className="text-[11px] text-muted-foreground">…</span>
            )}
          </span>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 text-muted-foreground/70 transition-transform duration-200", historyExpanded && "rotate-180")}
            strokeWidth={2}
            aria-hidden
          />
        </button>

        {historyExpanded ? (
          <div className="space-y-2 px-3.5 pb-3 md:px-5">
            {isHistoryLoading ? (
              <p className="text-[11px] text-muted-foreground">Загрузка…</p>
            ) : historyVisibleRows.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">Нет записей за выбранные условия.</p>
            ) : (
              <>
                <div
                  className={cn(
                    "flex min-w-0 flex-row items-center gap-1 overflow-x-auto pt-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  )}
                >
                  <HistoryPeriodPopover
                    triggerVariant="toolbar"
                    className="shrink-0"
                    value={historyPeriod}
                    onChange={(next) => setHistoryPeriod(next)}
                  />
                  <div className="flex min-w-0 shrink-0 items-center gap-1 sm:gap-1.5">
                    {(
                      [
                        ["all", "Все"],
                        ["actual", "Факт"],
                        ["plan", "План"],
                      ] as const
                    ).map(([id, label]) => (
                      <Button
                        key={id}
                        type="button"
                        size="sm"
                        variant="outline"
                        className={journalFilterChipClass(historyFilter === id)}
                        onClick={() => setHistoryFilter(id)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>

                <ul className="max-h-[min(16rem,50vh)] divide-y divide-foreground/[0.06] overflow-y-auto overscroll-contain [scrollbar-width:thin]">
                  {historyVisibleRows.map((r) => {
                    const isFuture = startOfDay(new Date(r.effectiveDate)).getTime() > today.getTime();
                    return (
                      <li key={r.id} className="py-2.5 first:pt-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                          <span className="text-[11px] font-medium tabular-nums text-foreground">{formatRuDate(r.effectiveDate)}</span>
                          {isFuture ? (
                            <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-600/90 dark:text-amber-300/90">
                              План
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                          <span className="text-foreground/85">{r.oldRate}%</span>
                          <span className="mx-1 text-muted-foreground/40">→</span>
                          <span className="font-semibold text-primary">{r.newRate}%</span>
                        </div>
                        <div className="mt-1 text-[10px] text-muted-foreground/85">
                          {r.user.username}
                          {r.user.role ? <span> · {r.user.role}</span> : null}
                          <span className="text-muted-foreground/50">
                            {" "}
                            ·{" "}
                            {new Date(r.createdAt).toLocaleString("ru-RU", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        {r.comment ? (
                          <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-muted-foreground">{r.comment}</p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        ) : null}
      </div>

      <div className={cn(hairline, "relative")}>
        <button
          type="button"
          onClick={() => setCalendarPlanExpanded((v) => !v)}
          aria-expanded={calendarPlanExpanded}
          aria-label={calendarPlanExpanded ? "Свернуть календарь" : "Развернуть календарь"}
          className={cn(
            "flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition md:px-5",
            "hover:bg-foreground/[0.03] dark:hover:bg-white/[0.03]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30"
          )}
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/85">
            Календарь · план
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground/70 transition-transform duration-200",
              calendarPlanExpanded && "rotate-180"
            )}
            strokeWidth={2}
            aria-hidden
          />
        </button>

        {calendarPlanExpanded ? (
          <div className="space-y-3 px-3.5 pb-3.5 md:px-5 md:pb-4">
            <FinanceMonthCalendar
              viewMonth={viewMonth}
              onViewMonthChange={setViewMonth}
              sessionToday={today}
              mode="range"
              isDayInRange={planCalendarDayInRange}
              isDayEndpoint={planCalendarDayEndpoint}
              onPickDay={onPlanCalendarPickDay}
              highlightedYmds={Array.from(changeDays)}
            />
            <p className="mt-2 px-0.5 text-[10px] leading-snug text-muted-foreground">
              {isOwner ? (
                <>
                  «·» — смена ставки. Сохранение — с{" "}
                  <span className="font-medium text-foreground">понедельника</span> недели выбранного дня.
                </>
              ) : (
                <>
                  Точка «·» под числом — день смены ставки в истории. Новая запись привязывается к{" "}
                  <span className="font-medium text-foreground">понедельнику</span> недели выбранного дня.
                </>
              )}
            </p>

            {selectedDay ? (
              <div className={cn(insetWellClass, "flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] leading-tight")}>
                <span className="text-muted-foreground">
                  День <span className="font-medium tabular-nums text-foreground">{formatRuDate(selectedDay)}</span>
                </span>
                <span className="hidden text-muted-foreground/35 sm:inline">·</span>
                <span className="text-muted-foreground">
                  % <span className="font-medium tabular-nums text-foreground">{rateOnSelected != null ? rateOnSelected : "—"}</span>
                </span>
                <span className="hidden text-muted-foreground/35 sm:inline">·</span>
                <span className="text-muted-foreground">
                  Пн{" "}
                  <span className="font-medium tabular-nums text-primary">
                    {accountingMonday ? formatRuDate(accountingMonday) : "—"}
                  </span>
                </span>
              </div>
            ) : null}

            <p className="text-[10px] leading-snug text-muted-foreground/85">
              День в сетке подставляет понедельник в поле выше. Журнал операций — в{" "}
              <button
                type="button"
                className="font-semibold text-primary underline-offset-2 hover:underline"
                onClick={() => router.push("/dashboard/finance")}
              >
                финансах
              </button>
              .
            </p>

            <div className={cn(hairline, "pt-3")}>
              <Text className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/85">
                Запланировано
              </Text>
              {planActionsEnabled ? (
                <p className="mt-1 text-[10px] text-muted-foreground/80">Правки только для дат после сегодня.</p>
              ) : null}
              {planActionError ? <Text className="mt-2 text-[11px] text-red-400">{planActionError}</Text> : null}
              {isHistoryLoading ? (
                <p className="mt-2 text-[11px] text-muted-foreground">Загрузка…</p>
              ) : futureSchedule.length ? (
                <ul className="mt-2 space-y-1.5">
                  {futureSchedule.map((m) => {
                    const rowBusy = planBusyRowId === m.id;
                    const isEditing = planEdit?.id === m.id;
                    const edit = isEditing && planEdit ? planEdit : null;
                    return (
                      <li key={m.id} className={cn(insetWellClass, "py-2")}>
                        {!edit ? (
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0">
                              <span className="text-[11px] tabular-nums text-muted-foreground">{formatRuDate(m.effectiveDate)}</span>
                              <span className="text-sm font-semibold tabular-nums text-foreground">{m.newRate}%</span>
                              {m.comment ? (
                                <span className="max-w-full truncate text-[10px] text-muted-foreground">{m.comment}</span>
                              ) : null}
                            </div>
                            {planActionsEnabled ? (
                              <div className="flex shrink-0 gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 rounded-lg px-2.5 text-[11px] text-foreground hover:bg-foreground/[0.06]"
                                  disabled={planSectionBusy}
                                  onClick={() => startPlanEdit(m)}
                                >
                                  Изменить
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 rounded-lg px-2.5 text-[11px] text-red-500 hover:bg-red-500/10"
                                  disabled={planSectionBusy}
                                  onClick={() => void handlePlanDelete(m.id)}
                                >
                                  {rowBusy ? "…" : "Удалить"}
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <form className="space-y-2" onSubmit={(e) => void handlePlanPatchSubmit(e)}>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <div>
                                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                  %
                                </label>
                                <Input
                                  type="number"
                                  min={0.01}
                                  step={0.01}
                                  inputMode="decimal"
                                  value={edit.newRate}
                                  onChange={(e) => setPlanEdit((p) => (p ? { ...p, newRate: e.target.value } : p))}
                                  className={compactInputClass}
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                  Дата
                                </label>
                                <DatePicker
                                  value={edit.effectiveDate}
                                  onChange={(v) => {
                                    setPlanEdit((p) => (p ? { ...p, effectiveDate: v } : p));
                                  }}
                                  highlightedDates={Array.from(changeDays)}
                                />
                              </div>
                            </div>
                            <div>
                              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                Комментарий
                              </label>
                              <Textarea
                                rows={2}
                                value={edit.comment}
                                onChange={(e) => setPlanEdit((p) => (p ? { ...p, comment: e.target.value } : p))}
                                className={compactTextareaClass}
                              />
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              <Button type="submit" size="sm" variant="primary" className="h-8 rounded-lg px-3 text-[11px]" disabled={planSectionBusy}>
                                {rowBusy ? "…" : "Сохранить"}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-8 rounded-lg px-3 text-[11px]"
                                disabled={planSectionBusy}
                                onClick={cancelPlanEdit}
                              >
                                Отмена
                              </Button>
                            </div>
                          </form>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-2 text-[11px] text-muted-foreground">Пусто.</p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
