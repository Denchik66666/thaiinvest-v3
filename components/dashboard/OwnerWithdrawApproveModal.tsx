"use client";

import { useEffect, useId, useState } from "react";
import { ChevronRight, Clock, Hash, User } from "lucide-react";

import type { OwnerPendingPaymentRow } from "@/components/dashboard/OwnerPendingPaymentsQueue";
import {
  formatOwnerPendingPaymentShortWhen,
  ownerPendingPaymentTypeRu,
} from "@/components/dashboard/OwnerPendingPaymentsQueue";
import { InvestDeskModalShell } from "@/components/investors/InvestDeskModalShell";
import { Button } from "@/components/ui/Button";
import { cn, formatCurrency } from "@/lib/utils";
import { glassAccentSurface } from "@/lib/dashboard-glass-accent";

export function OwnerWithdrawApproveModal({
  open,
  payment,
  isPending,
  onClose,
  onConfirm,
  variant = "approve",
}: {
  open: boolean;
  payment: OwnerPendingPaymentRow | null;
  isPending: boolean;
  onClose: () => void;
  onConfirm: (args: { comment?: string }) => void;
  variant?: "approve" | "reject";
}) {
  const commentId = useId();
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (!open || !payment) return;
    queueMicrotask(() => setComment(""));
  }, [open, payment?.id, variant]);

  const handleClose = () => {
    if (isPending) return;
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payment || isPending) return;
    const trimmed = comment.trim();
    if (variant === "reject") {
      if (!trimmed) return;
      onConfirm({ comment: trimmed });
      return;
    }
    onConfirm({ comment: trimmed ? trimmed : undefined });
  };

  if (!payment) return null;
  const isOpen = open;

  return (
    <InvestDeskModalShell
      open={isOpen}
      onClose={handleClose}
      maxWidthClass="max-w-[min(100vw-2rem,22.5rem)]"
      eyebrow={variant === "reject" ? "Выплата · отклонение" : "Выплата · одобрение"}
      title={formatCurrency(payment.amount)}
      summary={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="inline-flex items-center gap-0.5 tabular-nums text-foreground/90">
            <Hash className="h-3 w-3 opacity-50" strokeWidth={2} aria-hidden />
            {payment.id}
          </span>
          <span className="text-muted-foreground/80">·</span>
          <span className="rounded-md border border-border/50 bg-muted/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/90">
            {ownerPendingPaymentTypeRu(payment.type)}
          </span>
        </span>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="min-w-0 rounded-lg border border-border/40 bg-muted/10 px-2 py-1.5 dark:border-white/[0.06]">
            <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <User className="h-3 w-3 opacity-50" strokeWidth={2} aria-hidden />
              Позиция
            </div>
            <p className="mt-0.5 truncate font-medium text-foreground" title={payment.investorName}>
              {payment.investorName}
            </p>
          </div>
          <div className="min-w-0 rounded-lg border border-border/40 bg-muted/10 px-2 py-1.5 dark:border-white/[0.06]">
            <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Clock className="h-3 w-3 opacity-50" strokeWidth={2} aria-hidden />
              Подана
            </div>
            <p className="mt-0.5 font-medium tabular-nums text-foreground">
              <time dateTime={payment.createdAt}>{formatOwnerPendingPaymentShortWhen(payment.createdAt)}</time>
            </p>
          </div>
        </div>

        <p className="text-[10px] leading-snug text-muted-foreground">
          {variant === "reject"
            ? "Комментарий обязателен — он попадёт в заявку и журнал аудита."
            : "Решение фиксируется в заявке; инвестор подтвердит выплату в «Финансах»."}
        </p>

        {variant === "approve" ? (
          <div className="flex flex-wrap items-center gap-0.5 text-[10px] text-muted-foreground">
            <span>Запрос</span>
            <ChevronRight className="h-3 w-3 shrink-0 opacity-35" strokeWidth={2} aria-hidden />
            <span className="font-medium text-foreground/90">Владелец</span>
            <ChevronRight className="h-3 w-3 shrink-0 opacity-35" strokeWidth={2} aria-hidden />
            <span className="font-medium text-foreground/90">Инвестор примет</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-0.5 text-[10px] text-muted-foreground">
            <span>Заявка</span>
            <ChevronRight className="h-3 w-3 shrink-0 opacity-35" strokeWidth={2} aria-hidden />
            <span className="font-medium text-foreground/90">Отклонение</span>
          </div>
        )}

        {payment.comment ? (
          <div className="rounded-lg border border-border/40 bg-muted/15 px-2.5 py-2 text-[11px] leading-snug dark:border-white/[0.06]">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">От инвестора</p>
            <p className="mt-1 text-foreground/95">{payment.comment}</p>
          </div>
        ) : null}

        <form className="space-y-2" onSubmit={handleSubmit}>
          <label htmlFor={commentId} className="text-[11px] font-medium text-muted-foreground">
            {variant === "reject" ? "Причина отклонения *" : "Примечание владельца"}
          </label>
          <textarea
            id={commentId}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={isPending}
            placeholder={
              variant === "reject"
                ? "Кратко укажите причину."
                : "По желанию — в карточку и аудит."
            }
            rows={2}
            required={variant === "reject"}
            className={cn(
              "w-full resize-none rounded-lg border border-border/50 bg-background px-2.5 py-2 text-sm outline-none transition",
              "placeholder:text-muted-foreground/55 focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "dark:border-white/[0.08] dark:bg-black/25",
              isPending && "cursor-not-allowed opacity-55"
            )}
          />

          <div className="flex gap-2 border-t border-border/40 pt-3 dark:border-white/[0.06]">
            <Button type="button" variant="outline" className="h-9 flex-1 text-sm" disabled={isPending} onClick={handleClose}>
              Отмена
            </Button>
            <Button
              type="submit"
              variant="outline"
              disabled={isPending || (variant === "reject" && !comment.trim())}
              className={cn(
                "h-9 flex-1 text-sm",
                variant === "approve" ? glassAccentSurface : "border-destructive/45 text-destructive hover:bg-destructive/10"
              )}
            >
              {isPending ? "Отправка…" : variant === "reject" ? "Отклонить" : "Подтвердить"}
            </Button>
          </div>
        </form>
      </div>
    </InvestDeskModalShell>
  );
}
