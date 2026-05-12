"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Banknote,
  Check,
  ChevronDown,
  Layers,
  Loader2,
  MessageSquare,
  User,
  Users,
  Wallet,
  X,
} from "lucide-react";

import {
  CommonNetworkInvestorDeskShell,
  DeskInlineField,
  deskFieldInputClass,
} from "@/components/investors/ManagePositionDeskModal";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/Select";
import { apiClient } from "@/lib/api-client";
import { investDeskModalFigureClass } from "@/lib/dashboard-glass-accent";
import { investorEntryToYmd } from "@/lib/investor-entry-ymd";
import { investorDisplayHandle } from "@/lib/investor-display-handle";
import { toast } from "@/lib/notify";
import { cn, formatCurrency } from "@/lib/utils";

export type FinanceBodyTopUpInvestorOption = {
  id: number;
  name: string;
  handle?: string | null;
  body: number;
  /** Дата входа в позицию (ISO) — для календаря и превью ставки как в «Привязке». */
  entryDate?: string | null;
  status: string;
  isPrivate?: boolean;
  investorUser?: { id?: number; username: string } | null;
  linkedUser?: { id?: number; username: string } | null;
  investorUserId?: number | null;
  linkedUserId?: number | null;
};

type Scope = "all" | "multi" | "one";

function parseAmountInput(value: string) {
  return Number(value.replace(/[^\d]/g, ""));
}

function formatAmountInput(value: string) {
  const amount = parseAmountInput(value);
  if (!amount) return "";
  return `${amount.toLocaleString("ru-RU")} ฿`;
}

const deskGhostRound =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 text-muted-foreground outline-none transition " +
  "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring " +
  "disabled:pointer-events-none disabled:opacity-35";

const deskGhostRoundDanger = "hover:text-red-400";

/**
 * У инвестора должен быть аккаунт, который сможет подтвердить пополнение в кабинете.
 * Для OWNER в lean-ответе `/api/investors` поля `investorUserId` / `linkedUserId` не отдаются,
 * но приходят объекты `investorUser` / `linkedUser` — их достаточно для проверки в UI.
 */
function hasAccountForTopUpConfirm(inv: FinanceBodyTopUpInvestorOption): boolean {
  if (inv.investorUserId || inv.linkedUserId) return true;
  return Boolean(inv.investorUser || inv.linkedUser);
}

function eligibility(
  inv: FinanceBodyTopUpInvestorOption,
  pendingIds: ReadonlySet<number>
): { ok: boolean; reason: string } {
  if (inv.isPrivate) return { ok: false, reason: "Личная сеть" };
  if (inv.status === "closed") return { ok: false, reason: "Позиция закрыта" };
  if (!hasAccountForTopUpConfirm(inv)) return { ok: false, reason: "Нет кабинета / привязки" };
  if (pendingIds.has(inv.id)) return { ok: false, reason: "Уже есть запрос" };
  return { ok: true, reason: "" };
}

function labelFor(inv: FinanceBodyTopUpInvestorOption) {
  return investorDisplayHandle(inv) ?? inv.name;
}

type Props = {
  open: boolean;
  onClose: () => void;
  investors: FinanceBodyTopUpInvestorOption[];
  /** Позиция из фильтра финансов (?investor=) — подставляем режим «Одна». */
  hintInvestorId: number | null;
  pendingTopUpIds: ReadonlySet<number>;
  onSuccess: () => void;
};

export function FinanceBodyTopUpModal({
  open,
  onClose,
  investors,
  hintInvestorId,
  pendingTopUpIds,
  onSuccess,
}: Props) {
  const [scope, setScope] = useState<Scope>("one");
  const [oneId, setOneId] = useState<string>("");
  const [multiIds, setMultiIds] = useState<Set<number>>(new Set());
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  const positionFieldLabelId = useId();

  /** Стабильная подпись списка: при догрузке позиций после открытия модалки нужно повторно выставить scope / oneId. */
  const investorsSig = useMemo(
    () =>
      investors
        .map((i) => i.id)
        .sort((a, b) => a - b)
        .join(","),
    [investors]
  );

  const appliedInvestorsSigRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      appliedInvestorsSigRef.current = null;
      return;
    }
    if (investors.length === 0) return;
    if (appliedInvestorsSigRef.current === investorsSig) return;

    appliedInvestorsSigRef.current = investorsSig;

    const eligibleList = investors.filter((i) => eligibility(i, pendingTopUpIds).ok);
    const hintOk =
      hintInvestorId != null && eligibleList.some((i) => i.id === hintInvestorId);
    if (investors.length <= 1) {
      setScope("one");
      setOneId(eligibleList[0] ? String(eligibleList[0].id) : "");
    } else if (hintOk) {
      setScope("one");
      setOneId(String(hintInvestorId));
    } else {
      setScope("all");
      setOneId("");
    }
    setMultiIds(new Set());
    setAmount("");
    setComment("");
  }, [open, investors, investorsSig, hintInvestorId, pendingTopUpIds]);

  const parsedAmount = parseAmountInput(amount);

  const targetIds = useMemo(() => {
    if (scope === "all") {
      return investors.filter((i) => eligibility(i, pendingTopUpIds).ok).map((i) => i.id);
    }
    if (scope === "multi") {
      return [...multiIds].filter((id) => {
        const inv = investors.find((x) => x.id === id);
        return inv && eligibility(inv, pendingTopUpIds).ok;
      });
    }
    const n = Number(oneId);
    if (!Number.isFinite(n) || n <= 0) return [];
    const inv = investors.find((x) => x.id === n);
    if (!inv || !eligibility(inv, pendingTopUpIds).ok) return [];
    return [n];
  }, [scope, investors, pendingTopUpIds, multiIds, oneId]);

  const eligibleCount = useMemo(
    () => investors.filter((i) => eligibility(i, pendingTopUpIds).ok).length,
    [investors, pendingTopUpIds]
  );

  /** Сумма тел только по отмеченным в режиме «Несколько». */
  const multiSelectedBodiesSum = useMemo(() => {
    if (scope !== "multi") return 0;
    return [...multiIds].reduce((acc, id) => {
      const inv = investors.find((x) => x.id === id);
      if (!inv || !eligibility(inv, pendingTopUpIds).ok) return acc;
      return acc + inv.body;
    }, 0);
  }, [scope, multiIds, investors, pendingTopUpIds]);

  const primaryInvestor = useMemo(() => {
    if (scope === "one") {
      const n = Number(oneId);
      if (Number.isFinite(n) && n > 0) {
        const inv = investors.find((i) => i.id === n);
        if (inv) return inv;
      }
      return undefined;
    }
    if (scope === "multi") {
      const sorted = [...multiIds].sort((a, b) => a - b);
      for (const id of sorted) {
        const inv = investors.find((i) => i.id === id);
        if (inv && eligibility(inv, pendingTopUpIds).ok) return inv;
      }
      return undefined;
    }
    const eligible = investors.filter((i) => eligibility(i, pendingTopUpIds).ok);
    return eligible[0];
  }, [scope, oneId, multiIds, investors, pendingTopUpIds]);

  /** База для оценки % в шапке деска (сумма тел + пополнение по выбранным позициям). */
  const topUpDeskBasis = useMemo(() => {
    if (scope === "all") {
      const ids = investors.filter((i) => eligibility(i, pendingTopUpIds).ok).map((i) => i.id);
      return { kind: "ids" as const, ids };
    }
    if (scope === "multi") {
      const ids = [...multiIds].filter((id) => {
        const inv = investors.find((x) => x.id === id);
        return inv && eligibility(inv, pendingTopUpIds).ok;
      });
      if (ids.length > 0) return { kind: "ids" as const, ids };
    }
    const inv =
      primaryInvestor ??
      investors.find((i) => eligibility(i, pendingTopUpIds).ok) ??
      investors[0];
    return { kind: "single" as const, body: inv?.body ?? 0 };
  }, [scope, primaryInvestor, investors, pendingTopUpIds, multiIds, oneId]);

  /** Превью «тело после пополнения» для шапки деска (сумма тел + пополнения по выбранным позициям). */
  const deskBodyForEstimate = useMemo(() => {
    const addTop = parsedAmount > 0 ? parsedAmount : 0;
    if (topUpDeskBasis.kind === "ids") {
      if (topUpDeskBasis.ids.length === 0) return "0";
      return String(
        topUpDeskBasis.ids.reduce((acc, id) => {
          const inv = investors.find((x) => x.id === id);
          if (!inv || !eligibility(inv, pendingTopUpIds).ok) return acc;
          return acc + inv.body + addTop;
        }, 0)
      );
    }
    return String(topUpDeskBasis.body + addTop);
  }, [topUpDeskBasis, investors, pendingTopUpIds, parsedAmount]);

  const [deskEntryYmd, setDeskEntryYmd] = useState(() => investorEntryToYmd(undefined));

  /**
   * Дата в заявке (`requestDate`): при каждом открытии — сегодня (локальный день).
   * Не брать `entryDate` позиции: это дата входа в сделку, не «дата заявки» → в UI оказывалось 02.02.26 и т.п.
   */
  useEffect(() => {
    if (!open) return;
    setDeskEntryYmd(investorEntryToYmd(undefined));
  }, [open]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (targetIds.length === 0) throw new Error("Нет позиций для запроса");
      if (parsedAmount <= 0) throw new Error("Укажите сумму");
      const c = comment.trim() || undefined;
      let ok = 0;
      const errors: string[] = [];
      for (const investorId of targetIds) {
        try {
          await apiClient.post("/api/body-topup-requests", {
            investorId,
            amount: parsedAmount,
            comment: c,
            requestDate: deskEntryYmd,
          });
          ok += 1;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Ошибка";
          const short = labelFor(investors.find((x) => x.id === investorId)!) || `#${investorId}`;
          errors.push(`${short}: ${msg}`);
        }
      }
      return { ok, errors };
    },
    onSuccess: (res) => {
      if (res.ok > 0) {
        toast.success(
          res.ok === 1 ? "Запрос на пополнение отправлен" : `Создано запросов: ${res.ok}`
        );
        onSuccess();
      }
      if (res.errors.length) {
        toast.error(res.errors.slice(0, 3).join(" · ") + (res.errors.length > 3 ? "…" : ""));
      }
      if (res.ok > 0) onClose();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Не удалось отправить");
    },
  });

  return (
    <CommonNetworkInvestorDeskShell
      open={open}
      onClose={() => !mutation.isPending && onClose()}
      title="Пополнение тела"
      entryDate={deskEntryYmd}
      onEntryDateChange={setDeskEntryYmd}
      bodyForEstimate={deskBodyForEstimate}
      loading={mutation.isPending}
      rateQueryRole="OWNER"
    >
      <form
        className="space-y-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        {investors.length > 1 ? (
          <div className="space-y-1">
            <p className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Кому запрос
            </p>
            <div className="flex justify-center gap-0.5" role="group" aria-label="Кому создать запрос">
              <button
                type="button"
                title="Все подходящие позиции в общей сети"
                aria-label="Все подходящие"
                aria-pressed={scope === "all"}
                disabled={mutation.isPending || eligibleCount === 0}
                onClick={() => setScope("all")}
                className={cn(
                  deskGhostRound,
                  "h-9 w-9",
                  scope === "all" && "text-violet-600 dark:text-emerald-400"
                )}
              >
                <Users className="h-[1.125rem] w-[1.125rem]" strokeWidth={2} />
              </button>
              <button
                type="button"
                title="Несколько позиций"
                aria-label="Несколько"
                aria-pressed={scope === "multi"}
                disabled={mutation.isPending}
                onClick={() => setScope("multi")}
                className={cn(
                  deskGhostRound,
                  "h-9 w-9",
                  scope === "multi" && "text-violet-600 dark:text-emerald-400"
                )}
              >
                <Layers className="h-[1.125rem] w-[1.125rem]" strokeWidth={2} />
              </button>
              <button
                type="button"
                title="Одна позиция"
                aria-label="Одна"
                aria-pressed={scope === "one"}
                disabled={mutation.isPending}
                onClick={() => setScope("one")}
                className={cn(
                  deskGhostRound,
                  "h-9 w-9",
                  scope === "one" && "text-violet-600 dark:text-emerald-400"
                )}
              >
                <User className="h-[1.125rem] w-[1.125rem]" strokeWidth={2} />
              </button>
            </div>
            <div className="flex justify-center gap-3 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
              <span className={cn(scope === "all" && "text-foreground")}>Все</span>
              <span className={cn(scope === "multi" && "text-foreground")}>Несколько</span>
              <span className={cn(scope === "one" && "text-foreground")}>Одна</span>
            </div>
          </div>
        ) : null}

        {scope === "one" && investors.length === 1 ? (
          <div className="rounded-lg border border-violet-500/20 bg-violet-500/[0.04] px-2.5 py-2 text-center dark:border-violet-400/15 dark:bg-violet-500/[0.06]">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Позиция</span>
            {(() => {
              const inv = investors[0]!;
              const el = eligibility(inv, pendingTopUpIds);
              return (
                <div className="mt-1 space-y-0.5">
                  <p className="text-sm font-medium text-foreground">{labelFor(inv)}</p>
                  <p className="text-[11px] tabular-nums text-muted-foreground">Тело {formatCurrency(inv.body)}</p>
                  {!el.ok ? (
                    <p className="pt-0.5 text-[10px] leading-snug text-amber-600 dark:text-amber-400">{el.reason}</p>
                  ) : null}
                </div>
              );
            })()}
          </div>
        ) : null}

        {investors.length > 1 && scope === "all" ? (
          <p className="text-center text-[10px] leading-snug text-muted-foreground">
            Запросы уйдут на <span className="font-semibold text-foreground">{targetIds.length}</span> из{" "}
            {investors.length} позиций (общая сеть, с кабинетом, без активного запроса).
          </p>
        ) : null}

        {scope === "one" && investors.length > 1 ? (
          <div className="block">
            <span
              id={positionFieldLabelId}
              className="mb-0.5 block text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Позиция
            </span>
            <Select value={oneId} onValueChange={setOneId} className="w-full" ariaLabelledBy={positionFieldLabelId}>
              <SelectTrigger disabled={mutation.isPending}>
                <span className="min-w-0 flex-1 truncate text-left text-[12px] leading-tight text-slate-800 dark:text-slate-200">
                  {oneId ? (
                    (() => {
                      const inv = investors.find((i) => String(i.id) === oneId);
                      return inv ? (
                        <>
                          {labelFor(inv)} —{" "}
                          <span className={cn("tabular-nums", investDeskModalFigureClass)}>
                            {formatCurrency(inv.body)}
                          </span>
                        </>
                      ) : (
                        oneId
                      );
                    })()
                  ) : (
                    <span className="text-muted-foreground">Выберите…</span>
                  )}
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-65" strokeWidth={2} aria-hidden />
              </SelectTrigger>
              <SelectContent>
                {investors.map((inv) => {
                  const el = eligibility(inv, pendingTopUpIds);
                  const line = (
                    <>
                      <span className="font-medium">{labelFor(inv)}</span>
                      <span className="ml-1 tabular-nums text-muted-foreground">— {formatCurrency(inv.body)}</span>
                      {!el.ok ? (
                        <span className="mt-0.5 block text-[9px] leading-tight text-amber-600 dark:text-amber-400/90">
                          {el.reason}
                        </span>
                      ) : null}
                    </>
                  );
                  if (!el.ok) {
                    return (
                      <div
                        key={inv.id}
                        className="cursor-not-allowed border-l-2 border-transparent py-1.5 pl-2 pr-1 text-left text-[11px] leading-snug text-muted-foreground opacity-50"
                        title={el.reason}
                      >
                        {line}
                      </div>
                    );
                  }
                  return (
                    <SelectItem key={inv.id} value={String(inv.id)}>
                      <span className="block">{line}</span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {(() => {
              const n = Number(oneId);
              if (!Number.isFinite(n) || n <= 0) return null;
              const inv = investors.find((x) => x.id === n);
              if (!inv) return null;
              const el = eligibility(inv, pendingTopUpIds);
              if (el.ok) return null;
              return (
                <p className="mt-1.5 text-center text-[10px] leading-snug text-amber-600 dark:text-amber-400" role="status">
                  {el.reason}
                </p>
              );
            })()}
          </div>
        ) : null}

        {scope === "multi" ? (
          <div className="max-h-[11rem] space-y-1.5 overflow-y-auto rounded-lg border border-violet-500/20 px-2 py-2 dark:border-violet-400/15">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Отметьте позиции</p>
            {investors.map((inv) => {
              const el = eligibility(inv, pendingTopUpIds);
              const checked = multiIds.has(inv.id);
              return (
                <label
                  key={inv.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 text-[11px] transition",
                    el.ok ? "hover:bg-muted/40" : "cursor-not-allowed opacity-55"
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    disabled={mutation.isPending || !el.ok}
                    checked={checked && el.ok}
                    onChange={() => {
                      setMultiIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(inv.id)) next.delete(inv.id);
                        else if (el.ok) next.add(inv.id);
                        return next;
                      });
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-foreground">{labelFor(inv)}</span>
                    <span className="ml-1 tabular-nums text-muted-foreground">{formatCurrency(inv.body)}</span>
                    {!el.ok ? <span className="block text-[10px] text-amber-600 dark:text-amber-400">{el.reason}</span> : null}
                  </span>
                </label>
              );
            })}
            {multiIds.size > 0 ? (
              <p className="border-t border-violet-500/15 pt-1.5 text-center text-[10px] tabular-nums text-muted-foreground dark:border-violet-400/10">
                Итого тел по отмеченным:{" "}
                <span className="font-semibold text-foreground/90">{formatCurrency(multiSelectedBodiesSum)}</span>
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex justify-center" title="Инвестор подтверждает в «Финансах»">
          <span className="text-[10px] text-muted-foreground">Одна сумма на каждую позицию · подтверждение инвестором</span>
        </div>

        <div className="space-y-2.5 pt-0.5">
          <DeskInlineField icon={Banknote} tone="amber">
            <input
              required
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(formatAmountInput(e.target.value))}
              placeholder="Сумма · ฿"
              disabled={mutation.isPending}
              className={cn(deskFieldInputClass, "font-medium tabular-nums", investDeskModalFigureClass)}
            />
          </DeskInlineField>
          <DeskInlineField icon={MessageSquare} tone="sky">
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Комментарий · необязательно"
              disabled={mutation.isPending}
              className={deskFieldInputClass}
            />
          </DeskInlineField>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-violet-200/40 pt-2.5 dark:border-violet-500/[0.12]">
          <button
            type="button"
            title="Закрыть"
            aria-label="Отмена"
            disabled={mutation.isPending}
            onClick={onClose}
            className={cn(deskGhostRound, deskGhostRoundDanger)}
          >
            <X className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} />
          </button>
          <button
            type="submit"
            title="Отправить запросы"
            aria-label="Отправить"
            disabled={
              mutation.isPending ||
              parsedAmount <= 0 ||
              targetIds.length === 0 ||
              (scope === "one" && investors.length > 1 && !oneId)
            }
            className={cn(
              deskGhostRound,
              !(mutation.isPending || parsedAmount <= 0 || targetIds.length === 0) &&
                "text-violet-600 hover:text-violet-500 dark:text-emerald-400 dark:hover:text-emerald-300"
            )}
          >
            {mutation.isPending ? (
              <Loader2 className="h-[1.125rem] w-[1.125rem] animate-spin" strokeWidth={2.25} />
            ) : (
              <Check className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} />
            )}
          </button>
        </div>
      </form>
    </CommonNetworkInvestorDeskShell>
  );
}
