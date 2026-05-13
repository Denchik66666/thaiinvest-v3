"use client";

import { CheckCircle2, ChevronRight, Clock3, XCircle } from "lucide-react";

import { cn, formatCurrency } from "@/lib/utils";

/** Платежи из GET /api/investors?lean=1 (mapPaymentsToPayload). Статусы — как в app/api/payments/route.ts и prisma. */
export type WithdrawalRequestPayment = {
  id: number;
  type: string;
  amount: number;
  status: string;
  createdAt: string;
  approvedAt?: string | null;
  acceptedAt?: string | null;
};

const WITHDRAWAL_TYPES = new Set(["interest", "body", "close"]);

export type LatestWithdrawalRequestPick = {
  payment: WithdrawalRequestPayment;
  investorId: number;
};

export function pickLatestWithdrawalRequest(
  investors: Array<{ id: number; payments?: WithdrawalRequestPayment[] | null }>
): LatestWithdrawalRequestPick | null {
  const candidates: LatestWithdrawalRequestPick[] = [];
  for (const inv of investors) {
    for (const p of inv.payments ?? []) {
      if (!WITHDRAWAL_TYPES.has(p.type)) continue;
      if (
        p.status !== "requested" &&
        p.status !== "pending" &&
        p.status !== "approved_waiting_accept" &&
        p.status !== "rejected"
      ) {
        continue;
      }
      candidates.push({ payment: p, investorId: inv.id });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => new Date(b.payment.createdAt).getTime() - new Date(a.payment.createdAt).getTime());
  return candidates[0] ?? null;
}

function paymentTypeRu(type: string) {
  if (type === "interest") return "Проценты";
  if (type === "body") return "Тело";
  if (type === "close") return "Закрытие";
  return type;
}

function formatDateShort(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Дата «обновления» для UI: в модели Payment нет updatedAt — для одобрения берём approvedAt. */
function displayDecisionDate(payment: WithdrawalRequestPayment) {
  return formatDateShort(payment.approvedAt ?? payment.createdAt);
}

export function InvestorWithdrawalStatusBanner({
  payment,
  investorId,
  investorName,
  onOpenDecision,
}: {
  payment: WithdrawalRequestPayment;
  investorId: number;
  /** Подпись позиции в подсказке (компактнее, чем только id) */
  investorName?: string;
  /** Переход к экрану, где можно принять выплату / спор (раздел «Отчёты») */
  onOpenDecision: () => void;
}) {
  const s = payment.status;
  const typeLabel = paymentTypeRu(payment.type);
  const amountLabel = formatCurrency(payment.amount);

  const variant =
    s === "requested" || s === "pending" ? "pending" : s === "approved_waiting_accept" ? "approved" : s === "rejected" ? "rejected" : null;
  if (!variant) return null;

  const Icon =
    variant === "pending" ? Clock3 : variant === "approved" ? CheckCircle2 : XCircle;

  const title =
    variant === "pending"
      ? "На рассмотрении"
      : variant === "approved"
        ? "Одобрено"
        : "Отклонено";

  const meta =
    variant === "pending"
      ? `${typeLabel} · ${amountLabel} · подана ${formatDateShort(payment.createdAt)}`
      : variant === "approved"
        ? `${typeLabel} · ${amountLabel} · одобрена ${displayDecisionDate(payment)}`
        : `${typeLabel} · ${amountLabel} · ${displayDecisionDate(payment)}`;

  const hint =
    variant === "pending"
      ? "Ожидает владельца · отчёты"
      : variant === "approved"
        ? "Подтвердите получение · отчёты"
        : "История и новая заявка · отчёты";

  const ariaLabel =
    variant === "approved"
      ? `Заявка одобрена, ${amountLabel}. Открыть отчёты позиции для подтверждения получения`
      : variant === "pending"
        ? `Заявка на рассмотрении, ${amountLabel}. Открыть отчёты позиции`
        : `Заявка отклонена. Открыть отчёты позиции`;

  return (
    <button
      type="button"
      onClick={onOpenDecision}
      aria-label={ariaLabel}
      className={cn(
        "thai-investor-withdraw-strip group w-full text-left transition-[transform,box-shadow,border-color] duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        variant === "pending" && "thai-investor-withdraw-strip--pending",
        variant === "approved" && "thai-investor-withdraw-strip--approved",
        variant === "rejected" && "thai-investor-withdraw-strip--rejected"
      )}
    >
      <span className="thai-investor-withdraw-strip__accent" aria-hidden />
      <span className="thai-investor-withdraw-strip__icon" aria-hidden>
        <Icon className="h-[15px] w-[15px]" strokeWidth={2.2} />
      </span>
      <span className="thai-investor-withdraw-strip__main">
        <span className="thai-investor-withdraw-strip__top">
          <span className="thai-investor-withdraw-strip__title">{title}</span>
          <span className="thai-investor-withdraw-strip__chev" aria-hidden>
            <ChevronRight className="h-3.5 w-3.5 opacity-55 transition group-hover:opacity-90 group-hover:translate-x-[1px]" />
          </span>
        </span>
        <span className="thai-investor-withdraw-strip__meta">{meta}</span>
        <span className="thai-investor-withdraw-strip__hint">
          {(investorName ?? `Позиция #${investorId}`).trim()} · {hint}
        </span>
      </span>
    </button>
  );
}
