"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getWeekStartMonday, startOfDay } from "@/lib/weekly";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { DatePicker } from "@/components/ui/DatePicker";
import { useAppDialogs } from "@/components/feedback/AppDialogsProvider";
import {
  type BusinessRateHistoryRow,
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
}: Props) {
  const router = useRouter();
  const { confirm, toast } = useAppDialogs();
  const today = useMemo(() => startOfDay(new Date()), []);
  const [selectedYmd, setSelectedYmd] = useState<string>(() => toYmd(today));
  const [form, setForm] = useState({
    newRate: "",
    effectiveDate: toYmd(getWeekStartMonday(today)),
    comment: "",
  });
  const [planEdit, setPlanEdit] = useState<{
    id: number;
    newRate: string;
    effectiveDate: string;
    comment: string;
  } | null>(null);

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
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-violet-500/[0.12] via-card/80 to-card/40 p-4 md:p-5">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <Text className="text-[11px] uppercase tracking-wide text-muted-foreground">Ставка сети</Text>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums tracking-tight text-foreground md:text-4xl">
                {current != null ? `${current.rate}%` : "—"}
              </span>
              {current?.effectiveDate ? (
                <span className="text-sm text-muted-foreground">с {formatRuDate(current.effectiveDate)}</span>
              ) : (
                <span className="text-sm text-muted-foreground">не задана в истории</span>
              )}
            </div>
            {nextPlanned ? (
              <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-violet-500/25 bg-violet-500/10 px-3 py-1 text-xs text-foreground">
                <span className="text-muted-foreground">Далее</span>
                <span className="font-semibold tabular-nums">{nextPlanned.rate}%</span>
                <span className="text-muted-foreground">с {formatRuDate(nextPlanned.effectiveDate)}</span>
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Запланированных изменений не видно в загруженной истории.</p>
            )}
          </div>
          <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-2 text-xs text-muted-foreground md:max-w-xs">
            Ставка действует недельными циклами: дата в системе привязывается к{" "}
            <span className="font-medium text-foreground">понедельнику</span> выбранной недели (как и раньше при
            сохранении).
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/50 p-3 md:p-4">
        <div className="flex flex-col gap-3">
          <Text className="text-sm font-semibold text-foreground">Выбранный день</Text>
          {selectedDay ? (
            <div className="space-y-1 rounded-xl border border-border/40 bg-background/30 p-3 text-sm">
              <div className="text-muted-foreground">
                Дата: <span className="font-medium text-foreground">{formatRuDate(selectedDay)}</span>
              </div>
              <div className="text-muted-foreground">
                Ставка на этот день:{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {rateOnSelected != null ? `${rateOnSelected}%` : "—"}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                Понедельник учёта для новой записи:{" "}
                <span className="font-medium text-foreground">{accountingMonday ? formatRuDate(accountingMonday) : "—"}</span>
              </div>
            </div>
          ) : null}

          <form className="space-y-2" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Новая ставка, %</label>
              <Input
                type="number"
                min={0.01}
                step={0.01}
                inputMode="decimal"
                placeholder="Например, 10"
                value={form.newRate}
                onChange={(e) => setForm((p) => ({ ...p, newRate: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">С какой даты (календарь)</label>
              <DatePicker
                value={form.effectiveDate}
                onChange={(v) => {
                  setForm((p) => ({ ...p, effectiveDate: v }));
                  const parsed = v ? parseYmd(v) : null;
                  if (parsed) {
                    setSelectedYmd(toYmd(parsed));
                  }
                }}
                placeholder="Выбери дату"
                highlightedDates={Array.from(changeDays)}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Комментарий</label>
              <Textarea
                rows={2}
                placeholder="Необязательно"
                value={form.comment}
                onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))}
                className="min-h-0 resize-none text-sm"
              />
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Сохраняем..." : "Сохранить ставку"}
            </Button>
          </form>
          {submitError ? <Text className="text-xs text-red-500">{submitError}</Text> : null}
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/40 p-3 md:p-4">
          <Text className="text-sm font-semibold text-foreground">План (будущие понедельники)</Text>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Полный журнал изменений ставки — в разделе{" "}
            <button
              type="button"
              className="font-medium text-primary underline"
              onClick={() => router.push("/dashboard/reports")}
            >
              Отчёты
            </button>
            .
          </p>
          {planActionsEnabled ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Изменение и удаление доступны только для дат строго после сегодняшнего дня.
            </p>
          ) : null}
          {planActionError ? <Text className="mt-2 text-xs text-red-500">{planActionError}</Text> : null}
          {isHistoryLoading ? (
            <p className="mt-2 text-xs text-muted-foreground">Загрузка…</p>
          ) : futureSchedule.length ? (
            <ul className="mt-2 space-y-2">
              {futureSchedule.map((m) => {
                const rowBusy = planBusyRowId === m.id;
                const isEditing = planEdit?.id === m.id;
                const edit = isEditing && planEdit ? planEdit : null;
                return (
                  <li
                    key={m.id}
                    className="rounded-lg border border-border/40 bg-background/20 px-2.5 py-2 text-sm"
                  >
                    {!edit ? (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="text-muted-foreground tabular-nums">{formatRuDate(m.effectiveDate)}</span>
                          <span className="font-semibold tabular-nums text-foreground">{m.newRate}%</span>
                          {m.comment ? (
                            <span className="max-w-full truncate text-xs text-muted-foreground">— {m.comment}</span>
                          ) : null}
                        </div>
                        {planActionsEnabled ? (
                          <div className="flex shrink-0 flex-wrap gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={planSectionBusy}
                              onClick={() => startPlanEdit(m)}
                            >
                              Изменить
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={planSectionBusy}
                              className="border-red-500/40 text-red-600 hover:bg-red-500/10 dark:text-red-400"
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
                            <label className="mb-0.5 block text-[10px] uppercase text-muted-foreground">Ставка, %</label>
                            <Input
                              type="number"
                              min={0.01}
                              step={0.01}
                              inputMode="decimal"
                              value={edit.newRate}
                              onChange={(e) => setPlanEdit((p) => (p ? { ...p, newRate: e.target.value } : p))}
                            />
                          </div>
                          <div>
                            <label className="mb-0.5 block text-[10px] uppercase text-muted-foreground">Дата</label>
                            <DatePicker
                              value={edit.effectiveDate}
                              onChange={(v) => {
                                setPlanEdit((p) => (p ? { ...p, effectiveDate: v } : p));
                              }}
                              placeholder="Дата"
                              highlightedDates={Array.from(changeDays)}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="mb-0.5 block text-[10px] uppercase text-muted-foreground">Комментарий</label>
                          <Textarea
                            rows={2}
                            value={edit.comment}
                            onChange={(e) => setPlanEdit((p) => (p ? { ...p, comment: e.target.value } : p))}
                            className="min-h-0 resize-none text-xs"
                          />
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <Button type="submit" size="sm" disabled={planSectionBusy}>
                            {rowBusy ? "Сохраняем…" : "Сохранить"}
                          </Button>
                          <Button type="button" size="sm" variant="outline" disabled={planSectionBusy} onClick={cancelPlanEdit}>
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
            <p className="mt-2 text-xs text-muted-foreground">Нет будущих точек в истории.</p>
          )}
      </div>
    </div>
  );
}
