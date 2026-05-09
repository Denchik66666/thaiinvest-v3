"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Banknote, Check, Layers, Loader2, MessageSquare, User, Users, X } from "lucide-react";

import { InvestDeskModalShell } from "@/components/investors/InvestDeskModalShell";
import { apiClient } from "@/lib/api-client";
import { investDeskModalEmphasisClass, investDeskModalFigureClass } from "@/lib/dashboard-glass-accent";
import { investorDisplayHandle } from "@/lib/investor-display-handle";
import { toast } from "@/lib/notify";
import { cn, formatCurrency } from "@/lib/utils";

export type FinanceBodyTopUpInvestorOption = {
  id: number;
  name: string;
  handle?: string | null;
  body: number;
  status: string;
  isPrivate?: boolean;
  investorUser?: { username: string } | null;
  linkedUser?: { username: string } | null;
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

function eligibility(
  inv: FinanceBodyTopUpInvestorOption,
  pendingIds: ReadonlySet<number>
): { ok: boolean; reason: string } {
  if (inv.isPrivate) return { ok: false, reason: "Личная сеть" };
  if (inv.status === "closed") return { ok: false, reason: "Позиция закрыта" };
  if (!inv.investorUserId && !inv.linkedUserId) return { ok: false, reason: "Нет кабинета / привязки" };
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

  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      wasOpenRef.current = true;
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
    }
    if (!open) wasOpenRef.current = false;
  }, [open, investors, hintInvestorId, pendingTopUpIds]);

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

  const summaryOne = investors.find((x) => x.id === Number(oneId));

  return (
    <InvestDeskModalShell
      open={open}
      onClose={() => !mutation.isPending && onClose()}
      minimal
      title="Пополнение тела"
      summary={
        <span className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm">
          <span className={investDeskModalEmphasisClass}>
            {scope === "all"
              ? `Все подходящие (${targetIds.length})`
              : scope === "multi"
                ? `Выбрано: ${targetIds.length}`
                : summaryOne
                  ? labelFor(summaryOne)
                  : "Выберите позицию"}
          </span>
          {summaryOne && scope === "one" ? (
            <span className="inline-flex items-center gap-1 tabular-nums opacity-90" title="Текущее тело">
              <span className={investDeskModalFigureClass}>
                {formatCurrency(summaryOne.body)}
              </span>
            </span>
          ) : null}
        </span>
      }
      maxWidthClass="max-w-[min(100vw-2rem,26rem)]"
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        {investors.length > 1 ? (
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
        ) : null}

        {investors.length > 1 && scope === "all" ? (
          <p className="text-center text-[10px] leading-snug text-muted-foreground">
            Запросы уйдут на <span className="font-semibold text-foreground">{targetIds.length}</span> из{" "}
            {investors.length} позиций (общая сеть, с кабинетом, без активного запроса).
          </p>
        ) : null}

        {scope === "one" && investors.length > 1 ? (
          <label className="block">
            <span className="mb-1 block text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Позиция
            </span>
            <select
              className="mx-auto flex h-10 w-full max-w-full rounded-lg border border-border/50 bg-background/80 px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={oneId}
              disabled={mutation.isPending}
              onChange={(e) => setOneId(e.target.value)}
            >
              <option value="">Выберите…</option>
              {investors.map((inv) => {
                const el = eligibility(inv, pendingTopUpIds);
                return (
                  <option key={inv.id} value={String(inv.id)} disabled={!el.ok} title={el.reason}>
                    {labelFor(inv)} — {formatCurrency(inv.body)}
                    {!el.ok ? ` (${el.reason})` : ""}
                  </option>
                );
              })}
            </select>
          </label>
        ) : null}

        {scope === "multi" ? (
          <div className="max-h-[11rem] space-y-1.5 overflow-y-auto rounded-lg border border-border/40 px-2 py-2">
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
          </div>
        ) : null}

        <div className="flex justify-center" title="Инвестор подтверждает в «Финансах»">
          <span className="text-[10px] text-muted-foreground">Одна сумма на каждую позицию · подтверждение инвестором</span>
        </div>

        <label className="flex min-h-[2.35rem] cursor-text items-center gap-2.5 border-b border-border/30 pb-1 pt-0.5 dark:border-white/[0.08]">
          <Banknote className="h-4 w-4 shrink-0 text-muted-foreground opacity-[0.72]" strokeWidth={2} aria-hidden />
          <input
            required
            type="text"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(formatAmountInput(e.target.value))}
            placeholder="Сумма · ฿"
            disabled={mutation.isPending}
            className="w-full bg-transparent text-sm tabular-nums text-foreground outline-none placeholder:text-muted-foreground/45"
          />
        </label>

        <label className="flex min-h-[2.35rem] cursor-text items-center gap-2.5 border-b border-border/30 pb-1 pt-0.5 dark:border-white/[0.08]">
          <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground opacity-[0.72]" strokeWidth={2} aria-hidden />
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Комментарий · необязательно"
            disabled={mutation.isPending}
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/45"
          />
        </label>

        <div className="flex items-center justify-between gap-2 border-t border-border/35 pt-3 dark:border-white/[0.06]">
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
              !(mutation.isPending || parsedAmount <= 0 || targetIds.length === 0) && "text-primary hover:text-primary"
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
    </InvestDeskModalShell>
  );
}
