import type { Investor, Payment, Prisma } from "@prisma/client";
import { moneyRound2 } from "@/lib/money-round";
import { mergePaymentComment } from "@/lib/payment-merge-comment";

export type CorrectionRollbackTarget = "owner_step" | "investor_step";

export type CorrectionPayload =
  | {
      mode: "rollback";
      rollbackTarget: CorrectionRollbackTarget;
      reverseCompletion: boolean;
      patchDates?: Partial<{ createdAt: string; approvedAt: string | null; acceptedAt: string | null }>;
      mergeComment: string;
    }
  | {
      mode: "dates_only";
      patchDates: Partial<{ createdAt: string; approvedAt: string | null; acceptedAt: string | null }>;
      mergeComment: string;
      /** Новая сумма заявки (только если статус не completed — иначе нужна отдельная проводка). */
      patchAmount?: number;
    };

export type TxPaymentInvestor = Pick<Prisma.TransactionClient, "investor" | "payment" | "paymentCorrectionProposal">;

type InvestorForAssignee = Pick<Investor, "ownerId" | "isPrivate" | "linkedUserId" | "investorUserId">;

export function resolvePaymentCorrectionAssigneeUserId(
  investor: InvestorForAssignee,
  role: "OWNER" | "INVESTOR"
): number | null {
  if (role === "OWNER") return investor.ownerId;
  if (investor.isPrivate) return investor.ownerId;
  return investor.linkedUserId ?? investor.investorUserId ?? null;
}

export function parseIsoDateOrNull(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : undefined;
}

/** Откат проводки по завершённой заявке interest/body (перед удалением записи или откатом). */
export async function reverseCompletedPaymentLedger(
  tx: Pick<Prisma.TransactionClient, "investor">,
  payment: Pick<Payment, "investorId" | "type" | "amount">
) {
  const fresh = await tx.investor.findUnique({ where: { id: payment.investorId } });
  if (!fresh) throw new Error("INVESTOR_NOT_FOUND");

  const amt = moneyRound2(payment.amount);
  const typ = payment.type.trim().toLowerCase();

  if (typ === "interest") {
    await tx.investor.update({
      where: { id: fresh.id },
      data: { accrued: moneyRound2(fresh.accrued + amt) },
    });
    return;
  }

  if (typ === "body") {
    const nb = moneyRound2(fresh.body + amt);
    await tx.investor.update({
      where: { id: fresh.id },
      data: {
        body: nb,
        status: nb > 0 && fresh.status === "closed" ? "active" : fresh.status,
      },
    });
    return;
  }

  throw new Error("CLOSE_REVERSAL_UNSUPPORTED");
}

function applyDatePatchesToPaymentData(
  data: Prisma.PaymentUpdateInput,
  patch:
    | Partial<{ createdAt: string; approvedAt: string | null; acceptedAt: string | null }>
    | undefined
) {
  if (!patch) return;
  const d = data as unknown as {
    createdAt?: Date;
    approvedAt?: Date | null;
    acceptedAt?: Date | null;
  };

  const c = parseIsoDateOrNull(patch.createdAt);
  if (c !== undefined && c !== null) d.createdAt = c;

  if (Object.prototype.hasOwnProperty.call(patch, "approvedAt")) {
    if (patch.approvedAt === null) d.approvedAt = null;
    else if (typeof patch.approvedAt === "string") {
      const a = parseIsoDateOrNull(patch.approvedAt);
      if (a !== undefined) d.approvedAt = a;
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, "acceptedAt")) {
    if (patch.acceptedAt === null) d.acceptedAt = null;
    else if (typeof patch.acceptedAt === "string") {
      const a = parseIsoDateOrNull(patch.acceptedAt);
      if (a !== undefined) d.acceptedAt = a;
    }
  }
}

export async function applyApprovedCorrectionPayload(
  tx: TxPaymentInvestor,
  payment: Payment,
  payload: CorrectionPayload
): Promise<Payment> {
  if (payload.mode === "rollback") {
    const needsReverse = payload.reverseCompletion && payment.status === "completed";

    if (needsReverse) {
      if (payment.type === "close") throw new Error("CLOSE_REVERSAL_UNSUPPORTED");
      await reverseCompletedPaymentLedger(tx, payment);
    }

    let status: string;
    let approvedAt: Date | null = payment.approvedAt;
    let acceptedAt: Date | null = payment.acceptedAt;

    if (payload.rollbackTarget === "owner_step") {
      status = "requested";
      approvedAt = null;
      acceptedAt = null;
    } else {
      status = "approved_waiting_accept";
      acceptedAt = null;
    }

    const mergeComment = payload.mergeComment.trim();
    const data: Prisma.PaymentUpdateInput = {
      status,
      approvedAt,
      acceptedAt,
      comment: mergePaymentComment(payment.comment, mergeComment),
    };
    applyDatePatchesToPaymentData(data, payload.patchDates);

    return tx.payment.update({
      where: { id: payment.id },
      data,
    });
  }

  const mergeComment = payload.mergeComment.trim();
  const data: Prisma.PaymentUpdateInput = {
    comment: mergePaymentComment(payment.comment, mergeComment),
  };
  applyDatePatchesToPaymentData(data, payload.patchDates);

  if (payload.patchAmount != null) {
    data.amount = moneyRound2(payload.patchAmount);
  }

  return tx.payment.update({
    where: { id: payment.id },
    data,
  });
}

/** Базовая проверка сочетания текущей заявки и черновика правки (до сохранения в БД). */
export function assertCorrectionAllowedForPayment(
  payment: Pick<Payment, "status" | "type">,
  payload: CorrectionPayload
): void {
  if (payload.mode === "dates_only") {
    const p = payload.patchDates;
    const hasDate =
      p.createdAt != null ||
      Object.prototype.hasOwnProperty.call(p, "approvedAt") ||
      Object.prototype.hasOwnProperty.call(p, "acceptedAt");
    const hasAmount = payload.patchAmount != null;
    if (!hasDate && !hasAmount) throw new Error("PATCH_DATES_EMPTY");
    if (hasAmount && payment.status === "completed") throw new Error("AMOUNT_PATCH_COMPLETED_UNSUPPORTED");
    return;
  }

  const st = payment.status;

  if (payload.reverseCompletion) {
    if (st !== "completed") throw new Error("REVERSE_NOT_COMPLETED");
    if (payment.type === "close") throw new Error("CLOSE_REVERSAL_UNSUPPORTED");
    if (payment.type !== "interest" && payment.type !== "body") throw new Error("BAD_PAYMENT_TYPE");
  }

  if (payload.rollbackTarget === "owner_step") {
    if (st === "requested") throw new Error("ALREADY_AT_OWNER_STEP");
  }

  if (payload.rollbackTarget === "investor_step" && st === "requested") {
    throw new Error("NOT_APPROVED_YET");
  }
}
