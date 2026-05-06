"use client";

import { useEffect, useId, useState } from "react";
import { ChevronRight, Clock, Hash, User } from "lucide-react";

import type { OwnerPendingPaymentRow } from "@/components/dashboard/OwnerPendingPaymentsQueue";
import {
  formatOwnerPendingPaymentShortWhen,
  ownerPendingPaymentTypeRu,
} from "@/components/dashboard/OwnerPendingPaymentsQueue";
import { Modal } from "@/components/ui/Modal";
import { cn, formatCurrency } from "@/lib/utils";

export function OwnerWithdrawApproveModal({
  open,
  payment,
  isPending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  payment: OwnerPendingPaymentRow | null;
  isPending: boolean;
  onClose: () => void;
  onConfirm: (args: { comment?: string }) => void;
}) {
  const headingId = useId();
  const commentId = useId();
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (open && payment) setComment("");
  }, [open, payment?.id]);

  const handleClose = () => {
    if (isPending) return;
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payment || isPending) return;
    const trimmed = comment.trim();
    onConfirm({ comment: trimmed ? trimmed : undefined });
  };

  return (
    <Modal
      open={open && !!payment}
      onClose={handleClose}
      className="mx-auto max-w-[min(calc(100vw-1.25rem),21rem)] sm:max-w-[22.5rem]"
      backdropClassName="bg-black/[0.58] backdrop-blur-[14px]"
    >
      {payment ? (
        <div className="thai-owner-lux-approve-modal__surface" role="dialog" aria-modal="true" aria-labelledby={headingId}>
          <div className="thai-owner-lux-approve-modal__accent" aria-hidden />
          <div className="thai-owner-lux-approve-modal__panel">
            <div className="thai-owner-lux-approve-modal__pad">
              <header className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p id={headingId} className="thai-owner-lux-approve-modal__eyebrow">
                    Одобрение вывода
                  </p>
                  <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground/85">
                    Зафиксируйте решение — статус и аудит обновятся автоматически.
                  </p>
                </div>
                <span className="thai-owner-lux-approve-modal__id-pill shrink-0 tabular-nums">
                  <Hash className="h-2.5 w-2.5 opacity-65" strokeWidth={2.5} aria-hidden />
                  {payment.id}
                </span>
              </header>

              <div className="thai-owner-lux-approve-modal__sum-row">
                <p className="thai-owner-lux-approve-modal__sum tabular-nums">{formatCurrency(payment.amount)}</p>
                <span className="thai-owner-lux-approve-modal__chip">{ownerPendingPaymentTypeRu(payment.type)}</span>
              </div>

              <div className="thai-owner-lux-approve-modal__grid">
                <div className="min-w-0">
                  <div className="thai-owner-lux-approve-modal__fact-label">
                    <User className="h-3 w-3 shrink-0 opacity-55" strokeWidth={2} aria-hidden />
                    Позиция
                  </div>
                  <p className="thai-owner-lux-approve-modal__fact-value truncate" title={payment.investorName}>
                    {payment.investorName}
                  </p>
                </div>
                <div className="min-w-0">
                  <div className="thai-owner-lux-approve-modal__fact-label">
                    <Clock className="h-3 w-3 shrink-0 opacity-55" strokeWidth={2} aria-hidden />
                    Подана
                  </div>
                  <p className="thai-owner-lux-approve-modal__fact-value tabular-nums">
                    <time dateTime={payment.createdAt}>{formatOwnerPendingPaymentShortWhen(payment.createdAt)}</time>
                  </p>
                </div>
              </div>

              <div className="thai-owner-lux-approve-modal__flow">
                <span>Запрос</span>
                <ChevronRight className="h-3 w-3 shrink-0 opacity-35" strokeWidth={2} />
                <span className="thai-owner-lux-approve-modal__flow-step">Владелец</span>
                <ChevronRight className="h-3 w-3 shrink-0 opacity-35" strokeWidth={2} />
                <span className="thai-owner-lux-approve-modal__flow-step">Инвестор примет</span>
              </div>

              {payment.comment ? (
                <div className="thai-owner-lux-approve-modal__inv-note">
                  <p className="thai-owner-lux-approve-modal__inv-note-label">От инвестора</p>
                  <p>{payment.comment}</p>
                </div>
              ) : null}

              <form onSubmit={handleSubmit}>
                <label htmlFor={commentId} className="thai-owner-lux-approve-modal__label">
                  Примечание владельца
                </label>
                <textarea
                  id={commentId}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  disabled={isPending}
                  placeholder="По желанию — в карточку заявки и журнал аудита."
                  rows={2}
                  className={cn("thai-owner-lux-approve-modal__textarea", isPending && "cursor-not-allowed opacity-55")}
                />

                <div className="thai-owner-lux-approve-modal__footer">
                  <button
                    type="button"
                    className={cn(
                      "thai-owner-lux-withdraw-decline",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    )}
                    disabled={isPending}
                    onClick={handleClose}
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className={cn(
                      "thai-owner-lux-withdraw-approve",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    )}
                    disabled={isPending}
                  >
                    {isPending ? "Отправка…" : "Подтвердить"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
