"use client";

import type { CSSProperties } from "react";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { getWeekStartMonday, startOfDay } from "@/lib/weekly";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { DatePicker } from "@/components/ui/DatePicker";
import { financeCalendarReferenceToolbarContentWidthPx } from "@/components/ui/finance-calendar-popover-skin";
import { HistoryPeriodPopover, sortAtInHistoryPeriod, type HistoryPeriodValue } from "@/components/dashboard/HistoryPeriodPopover";
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

const insetWellStyle: CSSProperties = {
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "color-mix(in srgb, var(--thai-color-card-border) 90%, transparent)",
  background: "color-mix(in srgb, var(--thai-color-card-bg) 52%, transparent)",
};

const insetWellClass = "rounded-xl px-2.5 py-1.5";

const labelClass = "mb-0.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/88";

const compactInputClass =
  "h-9 rounded-xl border-0 bg-foreground/[0.04] px-2.5 text-xs tabular-nums text-foreground ring-1 ring-inset ring-foreground/[0.08] transition placeholder:text-muted-foreground/50 focus-visible:bg-foreground/[0.06] focus-visible:ring-[color:color-mix(in_srgb,var(--thai-color-accrued)_38%,transparent)] dark:bg-white/[0.04] dark:ring-white/[0.08]";

const compactTextareaClass =
  "min-h-[3rem] resize-none rounded-xl border-0 bg-foreground/[0.04] px-3 py-2 text-xs leading-snug ring-1 ring-inset ring-foreground/[0.08] focus-visible:ring-[color:color-mix(in_srgb,var(--thai-color-accrued)_38%,transparent)] dark:bg-white/[0.04] dark:ring-white/[0.08]";

const hairline = "border-t border-[color:color-mix(in_srgb,var(--thai-color-card-border)_88%,transparent)]";

/** Чипы фильтра журнала — акцент только `var(--thai-color-*)`. */
const journalFilterChipClass = (active: boolean) =>
  cn(
    "h-6 shrink-0 whitespace-nowrap rounded-full border px-2 py-0 text-[10px] font-semibold leading-none tabular-nums backdrop-blur-sm transition-colors",
    active
      ? "text-[color:var(--thai-color-text-primary)]"
      : "border-[color:color-mix(in_srgb,var(--thai-color-card-border)_88%,transparent)] bg-[color:color-mix(in_srgb,var(--thai-color-card-bg)_38%,transparent)] text-muted-foreground hover:border-[color:color-mix(in_srgb,var(--thai-color-card-border)_100%,transparent)] hover:bg-[color:color-mix(in_srgb,var(--thai-color-card-bg)_52%,transparent)] hover:text-foreground"
  );

function journalFilterChipStyle(active: boolean): CSSProperties | undefined {
  if (!active) return { borderColor: "transparent" };
  return {
    borderColor: "color-mix(in srgb, var(--thai-color-accrued) 34%, transparent)",
    backgroundColor: "color-mix(in srgb, var(--thai-color-accrued) 9%, transparent)",
    boxShadow: "inset 0 1px 0 0 color-mix(in srgb, var(--thai-color-card-border) 45%, transparent)",
  };
}

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
        className="pointer-events-none absolute inset-0 opacity-[0.5] dark:opacity-[0.62]"
        aria-hidden
        style={{
          background: `radial-gradient(100% 80% at 0% 0%, color-mix(in srgb, var(--thai-color-accrued) 16%, transparent), transparent 56%), radial-gradient(90% 72% at 100% 100%, color-mix(in srgb, var(--thai-color-forecast) 12%, transparent), transparent 52%)`,
        }}
      />

      <div className="relative px-3 pb-2 pt-2.5 md:px-4 md:pb-2.5 md:pt-3">
        {/* Одна строка ключевых KPI: ставка · с даты · далее (вторично справа). */}
        <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/82">
              Ставка сети
            </span>
            {current == null ? (
              <span
                className="rounded-full px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider"
                style={{ background: "var(--thai-color-due-bg)", color: "var(--thai-color-due)" }}
              >
                Нет базы
              </span>
            ) : (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: "var(--thai-color-paid)",
                  boxShadow: "0 0 10px color-mix(in srgb, var(--thai-color-paid) 55%, transparent)",
                }}
                title="Активна"
                aria-hidden
              />
            )}
            <span className="text-[1.4rem] font-semibold leading-none tracking-tight text-foreground tabular-nums sm:text-[1.55rem] md:text-[1.65rem]">
              {current != null ? `${current.rate}` : "—"}
              <span className="text-[0.42em] font-medium text-muted-foreground">%</span>
            </span>
            {current?.effectiveDate ? (
              <>
                <span className="hidden h-3 w-px shrink-0 bg-border/45 sm:block" aria-hidden />
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/78">с</span>
                <span className="text-[11px] font-semibold tabular-nums text-foreground/92">
                  {formatRuDate(current.effectiveDate)}
                </span>
              </>
            ) : (
              <span className="max-w-[14rem] text-[10px] leading-snug text-muted-foreground normal-case sm:text-[11px]">
                Цикл с <span className="text-foreground/90">пн</span> · задайте % и дату.
              </span>
            )}
          </div>
          <div className="min-w-0 sm:max-w-[55%] sm:text-right">
            {nextPlanned ? (
              <p className="text-[10px] leading-tight text-muted-foreground sm:inline-flex sm:items-center sm:justify-end sm:gap-x-1.5 sm:tabular-nums">
                <span className="font-semibold uppercase tracking-[0.12em] text-muted-foreground/78">Далее</span>
                <span className="mx-1 text-muted-foreground/35 sm:mx-0" aria-hidden>
                  ·
                </span>
                <span className="font-semibold tabular-nums" style={{ color: "var(--thai-color-text-primary)" }}>
                  {nextPlanned.rate}%
                </span>
                <span className="mx-1 text-muted-foreground/35 sm:mx-0" aria-hidden>
                  ·
                </span>
                <span className="tabular-nums">{formatRuDate(nextPlanned.effectiveDate)}</span>
              </p>
            ) : (
              <p className="max-w-[10rem] text-[10px] leading-snug text-muted-foreground/78 sm:ml-auto sm:text-right">
                Нет смен в плане
              </p>
            )}
          </div>
        </div>

        <form className="mt-2 space-y-1.5" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="shrink-0">
              <span className={labelClass}>Понедельник</span>
              <DatePicker
                inline
                financeFeedToolbar
                allowClear={false}
                triggerTitle="Понедельник в записи"
                value={form.effectiveDate}
                onChange={onEffectiveMondayChange}
                highlightedDates={Array.from(changeDays)}
              />
            </div>
            <div className="w-full sm:w-[5.5rem]">
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
                className={cn(compactInputClass, "h-8")}
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              className="h-8 w-full shrink-0 rounded-xl px-3.5 text-[10px] font-semibold uppercase tracking-[0.08em] sm:w-auto"
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
          <Text className="mt-1 text-[10px] leading-snug" style={{ color: "var(--thai-color-rejected)" }}>
            {submitError}
          </Text>
        ) : null}
      </div>

      <div className={cn(hairline, "relative")}>
        <button
          type="button"
          onClick={() => setHistoryExpanded((v) => !v)}
          aria-label={historyExpanded ? "Свернуть историю" : "Развернуть историю"}
          aria-expanded={historyExpanded}
          className={cn(
            "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition md:px-4",
            "hover:bg-[color:color-mix(in_srgb,var(--thai-color-card-bg)_55%,transparent)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:color-mix(in_srgb,var(--thai-color-accrued)_35%,transparent)]"
          )}
        >
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/82">Журнал</span>
            {!isHistoryLoading ? (
              <span className="text-[10px] font-medium tabular-nums text-muted-foreground/88">
                {historyVisibleRows.length} записей
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground">…</span>
            )}
          </span>
          <ChevronDown
            className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground/65 transition-transform duration-200", historyExpanded && "rotate-180")}
            strokeWidth={2}
            aria-hidden
          />
        </button>

        {historyExpanded ? (
          <div className="space-y-1 px-3 pb-2 md:px-4">
            {isHistoryLoading ? (
              <p className="text-[10px] text-muted-foreground">Загрузка…</p>
            ) : historyVisibleRows.length === 0 ? (
              <p className="text-[10px] leading-snug text-muted-foreground">Нет записей за выбранные условия.</p>
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
                        style={journalFilterChipStyle(historyFilter === id)}
                        onClick={() => setHistoryFilter(id)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>

                <ul className="max-h-[min(14rem,46vh)] divide-y divide-border/40 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
                  {historyVisibleRows.map((r) => {
                    const isFuture = startOfDay(new Date(r.effectiveDate)).getTime() > today.getTime();
                    return (
                      <li key={r.id} className="py-2 first:pt-0.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                          <span className="text-[11px] font-medium tabular-nums text-foreground">{formatRuDate(r.effectiveDate)}</span>
                          {isFuture ? (
                            <span
                              className="text-[9px] font-semibold uppercase tracking-wider"
                              style={{ color: "var(--thai-color-due)" }}
                            >
                              План
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                          <span className="text-foreground/85">{r.oldRate}%</span>
                          <span className="mx-1 text-muted-foreground/40">→</span>
                          <span className="font-semibold tabular-nums" style={{ color: "var(--thai-color-accrued)" }}>
                            {r.newRate}%
                          </span>
                        </div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground/85">
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
                          <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted-foreground">{r.comment}</p>
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
            "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition md:px-4",
            "hover:bg-[color:color-mix(in_srgb,var(--thai-color-card-bg)_55%,transparent)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:color-mix(in_srgb,var(--thai-color-accrued)_35%,transparent)]"
          )}
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/82">
            Календарь · план
          </span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground/65 transition-transform duration-200",
              calendarPlanExpanded && "rotate-180"
            )}
            strokeWidth={2}
            aria-hidden
          />
        </button>

        {calendarPlanExpanded ? (
          <div className="space-y-1.5 px-3 pb-2.5 md:px-4 md:pb-3">
            <div
              className="mx-auto max-w-full"
              style={{ width: financeCalendarReferenceToolbarContentWidthPx() }}
            >
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
            </div>
            <p className="mt-1.5 line-clamp-2 px-0.5 text-[10px] leading-snug text-muted-foreground/90">
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
              <div
                className={cn(insetWellClass, "flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[10px] leading-tight sm:text-[11px]")}
                style={insetWellStyle}
              >
                <span className="text-muted-foreground">
                  День <span className="font-semibold tabular-nums text-foreground">{formatRuDate(selectedDay)}</span>
                </span>
                <span className="hidden text-muted-foreground/35 sm:inline">·</span>
                <span className="text-muted-foreground">
                  % <span className="font-semibold tabular-nums text-foreground">{rateOnSelected != null ? rateOnSelected : "—"}</span>
                </span>
                <span className="hidden text-muted-foreground/35 sm:inline">·</span>
                <span className="text-muted-foreground">
                  Пн{" "}
                  <span className="font-semibold tabular-nums" style={{ color: "var(--thai-color-accrued)" }}>
                    {accountingMonday ? formatRuDate(accountingMonday) : "—"}
                  </span>
                </span>
              </div>
            ) : null}

            <p className="line-clamp-2 text-[10px] leading-snug text-muted-foreground/82">
              День в сетке подставляет понедельник в поле выше. Журнал операций — в{" "}
              <button
                type="button"
                className="font-semibold underline-offset-2 hover:underline"
                style={{ color: "var(--thai-color-accrued)" }}
                onClick={() => router.push("/dashboard/finance")}
              >
                финансах
              </button>
              .
            </p>

            <div className={cn(hairline, "pt-2")}>
              <Text className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/82">
                Запланировано
              </Text>
              {planActionsEnabled ? (
                <p className="mt-0.5 text-[10px] text-muted-foreground/78">Правки только для дат после сегодня.</p>
              ) : null}
              {planActionError ? (
                <Text className="mt-1.5 text-[10px]" style={{ color: "var(--thai-color-rejected)" }}>
                  {planActionError}
                </Text>
              ) : null}
              {isHistoryLoading ? (
                <p className="mt-1.5 text-[10px] text-muted-foreground">Загрузка…</p>
              ) : futureSchedule.length ? (
                <ul className="mt-1.5 space-y-1">
                  {futureSchedule.map((m) => {
                    const rowBusy = planBusyRowId === m.id;
                    const isEditing = planEdit?.id === m.id;
                    const edit = isEditing && planEdit ? planEdit : null;
                    return (
                      <li key={m.id} className={cn(insetWellClass, "py-1.5")} style={insetWellStyle}>
                        {!edit ? (
                          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0">
                              <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground/80 sm:text-[11px]">
                                {formatRuDate(m.effectiveDate)}
                              </span>
                              <span className="text-[11px] font-semibold tabular-nums text-foreground sm:text-[12px]">{m.newRate}%</span>
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
                                  className="h-7 rounded-lg px-2 text-[10px] font-semibold uppercase tracking-wide text-foreground hover:bg-[color:color-mix(in_srgb,var(--thai-color-card-bg)_65%,transparent)]"
                                  disabled={planSectionBusy}
                                  onClick={() => startPlanEdit(m)}
                                >
                                  Изменить
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 rounded-lg px-2 text-[10px] font-semibold uppercase tracking-wide hover:bg-[color:var(--thai-color-rejected-bg)]"
                                  style={{ color: "var(--thai-color-rejected)" }}
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
                                  inline
                                  financeFeedToolbar
                                  allowClear={false}
                                  triggerTitle="Дата в плане"
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
                <p className="mt-1.5 text-[10px] text-muted-foreground">Пусто.</p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
