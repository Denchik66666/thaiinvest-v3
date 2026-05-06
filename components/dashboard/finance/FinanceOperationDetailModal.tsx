"use client";

import type { ReactNode } from "react";
import type { FinanceOperationItem } from "@/types/finance-operations";
import { Modal } from "@/components/ui/Modal";
import { Text } from "@/components/ui/Text";
import { cn, formatCurrency } from "@/lib/utils";
import { X } from "lucide-react";

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateShort(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function paymentTypeRu(type: string) {
  if (type === "interest") return "Проценты";
  if (type === "body") return "Вывод тела";
  if (type === "close") return "Закрытие позиции";
  return type;
}

function paymentStatusRu(status: string) {
  const map: Record<string, string> = {
    completed: "Завершено",
    requested: "На рассмотрении у владельца",
    pending: "В очереди",
    approved_waiting_accept: "Одобрено, ждёт вашего решения",
    rejected: "Отклонено",
    expired: "Истекло",
    disputed: "Спор",
    completed_at_creation: "При создании позиции",
  };
  return map[status] ?? status;
}

function topUpStatusRu(status: string) {
  const map: Record<string, string> = {
    pending_investor: "Ожидает решения инвестора",
    accepted_by_investor: "Принято",
    rejected_by_investor: "Отклонено инвестором",
    cancelled_by_owner: "Отменено владельцем",
  };
  return map[status] ?? status;
}

function premiumChromeStyle() {
  return {
    background:
      "radial-gradient(120% 90% at 50% -8%, color-mix(in srgb, hsl(var(--primary)) 20%, transparent), transparent 62%)," +
      "linear-gradient(180deg, color-mix(in srgb, hsl(var(--card)) 82%, transparent), color-mix(in srgb, hsl(var(--card)) 62%, transparent))",
    borderColor: "color-mix(in srgb, hsl(var(--border)) 70%, transparent)",
    backdropFilter: "blur(22px) saturate(165%)",
    WebkitBackdropFilter: "blur(22px) saturate(165%)",
  } as const;
}

/** Одна строка label · value — максимально плотно */
function Kv({ label, children, valueClassName }: { label: string; children: ReactNode; valueClassName?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 text-right text-[11px] leading-tight text-foreground", valueClassName)}>{children}</span>
    </div>
  );
}

function MetricMini({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border px-1.5 py-1 text-center", className)}>
      <div className="text-[8px] font-semibold uppercase tracking-wide opacity-85">{label}</div>
      <div className="mt-0.5 text-[11px] font-bold tabular-nums leading-none">{value}</div>
    </div>
  );
}

export function FinanceOperationDetailModal({
  item,
  open,
  onClose,
}: {
  item: FinanceOperationItem | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!open || !item) return null;

  let title = "Операция";
  if (item.kind === "week_accrual") title = "Начисление за неделю";
  if (item.kind === "payment") title = `${paymentTypeRu(item.type)} · ${item.positionName}`;
  if (item.kind === "topup") title = item.initialFromCreation ? "Тело при создании позиции" : `Пополнение · ${item.positionName}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      className={cn(
        "mx-4 max-h-[min(92dvh,560px)] w-full max-w-[min(100%,22rem)] overflow-hidden sm:max-w-[24rem]",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      )}
      backdropClassName="bg-black/70 [@supports(backdrop-filter:blur(1px))]:bg-black/55"
    >
      <div
        className={cn(
          "thai-glass flex max-h-[inherit] flex-col overflow-hidden rounded-2xl border shadow-[0_24px_70px_-44px_rgba(0,0,0,0.85)]",
          "ring-1 ring-white/5 dark:ring-white/7"
        )}
        style={premiumChromeStyle()}
      >
        <div className="relative shrink-0 border-b border-border/15 px-3 pb-2 pt-3">
          <div
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              background:
                "radial-gradient(85% 65% at 20% 0%, rgba(250, 204, 21, 0.12), transparent 58%), radial-gradient(75% 55% at 100% 0%, rgba(167, 139, 250, 0.18), transparent 55%)",
            }}
            aria-hidden
          />
          <div className="relative flex items-start justify-between gap-2">
            <div className="min-w-0 pr-1">
              <Text className="line-clamp-2 text-[13px] font-semibold leading-snug tracking-tight text-foreground">{title}</Text>
              <Text className="mt-0.5 text-[9px] leading-tight text-muted-foreground">Карточка операции</Text>
            </div>
            <button
              type="button"
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/35 bg-background/15 text-muted-foreground",
                "transition hover:bg-muted/25 hover:text-foreground active:bg-muted/30",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              )}
              onClick={onClose}
              aria-label="Закрыть"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden px-3 pb-3 pt-2">
          {item.kind === "week_accrual" ? (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] leading-snug text-muted-foreground">
                Проценты за торговую неделю по ставке сети · суммы ниже по этой неделе.
              </p>
              <div className="flex items-center justify-between rounded-lg border border-violet-400/25 bg-violet-500/10 px-2 py-1">
                <span className="text-[9px] font-semibold uppercase tracking-wide text-violet-200/80">Неделя</span>
                <span className="text-[11px] font-semibold tabular-nums text-violet-100">
                  {formatDateShort(item.weekStart)} — {formatDateShort(item.weekEnd)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/12 px-2 py-1.5">
                  <div className="text-[9px] font-semibold uppercase text-emerald-200/85">Начислено</div>
                  <div className="text-[14px] font-bold tabular-nums leading-none text-emerald-300">{formatCurrency(item.accrued)}</div>
                </div>
                <div className="rounded-lg border border-sky-400/30 bg-sky-500/12 px-2 py-1.5">
                  <div className="text-[9px] font-semibold uppercase text-sky-200/85">Выплачено</div>
                  <div className="text-[14px] font-bold tabular-nums leading-none text-sky-200">{formatCurrency(item.paidTotal)}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <MetricMini
                  label="Из %"
                  value={formatCurrency(item.paidInterest)}
                  className="border-amber-400/28 bg-amber-500/12 text-amber-100"
                />
                <MetricMini
                  label="Тело"
                  value={formatCurrency(item.paidBody)}
                  className="border-orange-400/28 bg-orange-500/12 text-orange-100"
                />
                <MetricMini
                  label="Закр."
                  value={formatCurrency(item.paidClose)}
                  className="border-rose-400/28 bg-rose-500/12 text-rose-100"
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-border/15 pt-1.5 text-[9px] text-muted-foreground">
                {item.networkRatePercent != null ? (
                  <span className="rounded bg-fuchsia-500/15 px-1.5 py-0.5 font-medium tabular-nums text-fuchsia-200">
                    Сеть {item.networkRatePercent.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}% / нед
                  </span>
                ) : null}
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 font-medium",
                    item.syntheticOpen ? "bg-cyan-500/15 text-cyan-200" : "bg-zinc-500/15 text-zinc-300"
                  )}
                >
                  {item.syntheticOpen ? "Открытая неделя" : "Закрытая неделя"}
                </span>
                <span className="tabular-nums">{formatDateTime(item.sortAt)}</span>
              </div>
            </div>
          ) : null}

          {item.kind === "payment" ? (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] leading-snug text-muted-foreground">
                Выплата с позиции · тип и статус ниже.
              </p>
              <div
                className={cn(
                  "rounded-lg border px-2 py-1.5",
                  item.status === "completed"
                    ? "border-teal-400/30 bg-teal-500/12"
                    : "border-amber-400/35 bg-amber-500/12"
                )}
              >
                <div className="text-[9px] font-semibold uppercase text-muted-foreground">Сумма</div>
                <div
                  className={cn(
                    "text-[15px] font-bold tabular-nums leading-none",
                    item.status === "completed" ? "text-teal-200" : "text-amber-200"
                  )}
                >
                  {formatCurrency(item.amount)}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-0.5 rounded-lg border border-border/20 bg-background/10 px-2 py-1.5">
                <Kv label="Позиция" valueClassName="text-violet-200">
                  {item.positionName}
                </Kv>
                <Kv label="Тип" valueClassName="font-medium">
                  {paymentTypeRu(item.type)}
                </Kv>
                <Kv label="Статус" valueClassName="text-sky-200">
                  {paymentStatusRu(item.status)}
                </Kv>
                {item.comment ? (
                  <Kv label="Комментарий" valueClassName="line-clamp-3 text-[10px] font-normal text-foreground/90">
                    {item.comment}
                  </Kv>
                ) : null}
                <Kv label="Создана">{formatDateTime(item.createdAt)}</Kv>
                {item.approvedAt ? <Kv label="Одобрено">{formatDateTime(item.approvedAt)}</Kv> : null}
                {item.acceptedAt ? <Kv label="Завершено">{formatDateTime(item.acceptedAt)}</Kv> : null}
              </div>
              <div className="flex flex-wrap gap-x-2 text-[9px] tabular-nums text-muted-foreground">
                <span className="rounded bg-zinc-500/15 px-1 py-0.5">Поз. #{item.investorId}</span>
                <span className="rounded bg-zinc-500/15 px-1 py-0.5">Pay #{item.paymentId}</span>
                <span className="rounded bg-zinc-500/15 px-1 py-0.5 truncate max-w-full" title={item.id}>
                  {item.id}
                </span>
              </div>
            </div>
          ) : null}

          {item.kind === "topup" ? (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] leading-snug text-muted-foreground">
                {item.initialFromCreation ? "Тело при создании позиции." : "Пополнение тела по заявке."}
              </p>
              <div className="rounded-lg border border-teal-400/30 bg-teal-500/12 px-2 py-1.5">
                <div className="text-[9px] font-semibold uppercase text-muted-foreground">Сумма</div>
                <div className="text-[15px] font-bold tabular-nums leading-none text-teal-200">{formatCurrency(item.amount)}</div>
              </div>
              <div className="grid grid-cols-1 gap-0.5 rounded-lg border border-border/20 bg-background/10 px-2 py-1.5">
                <Kv label="Позиция" valueClassName="text-violet-200">
                  {item.positionName}
                </Kv>
                <Kv label="Статус" valueClassName="text-cyan-200">
                  {topUpStatusRu(item.status)}
                </Kv>
                {item.comment ? (
                  <Kv label="Комментарий" valueClassName="line-clamp-3 text-[10px] font-normal">
                    {item.comment}
                  </Kv>
                ) : null}
                {item.entryDate ? <Kv label="Вход">{formatDateShort(item.entryDate)}</Kv> : null}
                {item.activationDate ? <Kv label="Активация">{formatDateShort(item.activationDate)}</Kv> : null}
                <Kv label="Создано">{formatDateTime(item.createdAt)}</Kv>
                {item.decidedAt ? <Kv label="Решение">{formatDateTime(item.decidedAt)}</Kv> : null}
              </div>
              <div className="flex flex-wrap gap-x-2 text-[9px] tabular-nums text-muted-foreground">
                <span className="rounded bg-zinc-500/15 px-1 py-0.5">Поз. #{item.investorId}</span>
                <span className="rounded bg-zinc-500/15 px-1 py-0.5">Заявка #{item.requestId}</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
