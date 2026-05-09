import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { isTransientDbError, withDbRetry } from "@/lib/db-retry";
import { applyApprovedCorrectionPayload, type CorrectionPayload } from "@/lib/payment-correction";
import { getPaymentCorrectionProposalDelegate } from "@/lib/payment-correction-proposal-delegate";
import { isPrismaMissingTableForModel } from "@/lib/prisma-known-errors";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: sid } = await context.params;
    const id = Number(sid);
    if (!Number.isFinite(id) || id <= 0 || !Number.isInteger(id)) {
      return NextResponse.json({ error: "Некорректный id" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });

    const pcm = getPaymentCorrectionProposalDelegate(prisma);
    if (!pcm) {
      console.error(
        "PRISMA_MISSING_PAYMENT_CORRECTION_PROPOSAL: выполните `npx prisma generate` и перезапустите dev-сервер."
      );
      return NextResponse.json(
        {
          error:
            "Клиент БД устарел после обновления схемы: выполните `npx prisma generate` и перезапустите сервер.",
        },
        { status: 503 }
      );
    }

    const raw = await request.json().catch(() => null);
    const decision =
      typeof raw === "object" && raw !== null && "decision" in raw
        ? (raw as { decision?: unknown }).decision
        : null;
    if (decision !== "approve" && decision !== "reject") {
      return NextResponse.json({ error: "Укажите decision: approve или reject" }, { status: 400 });
    }

    const proposal = await withDbRetry(() =>
      pcm.findUnique({
        where: { id },
        include: { payment: true },
      })
    );
    if (!proposal) return NextResponse.json({ error: "Запрос не найден" }, { status: 404 });
    if (proposal.status !== "pending") {
      return NextResponse.json({ error: "Запрос уже обработан" }, { status: 400 });
    }
    if (proposal.assigneeUserId !== decoded.userId) {
      return NextResponse.json({ error: "Только адресат может принять решение" }, { status: 403 });
    }

    if (decision === "reject") {
      await withDbRetry(() =>
        pcm.update({
          where: { id },
          data: {
            status: "rejected",
            decidedById: decoded.userId,
            decidedAt: new Date(),
          },
        })
      );
      void logAction({
        userId: decoded.userId,
        action: "PAYMENT_CORRECTION_REJECT",
        entityType: "Payment",
        entityId: proposal.paymentId,
        newValue: JSON.stringify({ proposalId: proposal.id }),
      });
      return NextResponse.json({ success: true });
    }

    try {
      const updatedPayment = await prisma.$transaction(async (tx) => {
        const freshProposal = await tx.paymentCorrectionProposal.findUnique({
          where: { id },
          include: { payment: true },
        });
        if (!freshProposal || freshProposal.status !== "pending") throw new Error("STALE");
        if (freshProposal.assigneeUserId !== decoded.userId) throw new Error("FORBIDDEN");

        const payload = freshProposal.payload as unknown as CorrectionPayload;
        const pay = freshProposal.payment;

        const updated = await applyApprovedCorrectionPayload(tx, pay, payload);

        await tx.paymentCorrectionProposal.update({
          where: { id },
          data: {
            status: "approved",
            decidedById: decoded.userId,
            decidedAt: new Date(),
          },
        });

        return updated;
      });

      void logAction({
        userId: decoded.userId,
        action: "PAYMENT_CORRECTION_APPROVE",
        entityType: "Payment",
        entityId: proposal.paymentId,
        newValue: JSON.stringify({ proposalId: proposal.id, paymentId: updatedPayment.id }),
      });

      return NextResponse.json({ success: true, payment: updatedPayment });
    } catch (err) {
      if (err instanceof Error && err.message === "STALE") {
        return NextResponse.json({ error: "Запрос уже обработан" }, { status: 400 });
      }
      if (err instanceof Error && err.message === "FORBIDDEN") {
        return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
      }
      if (err instanceof Error && err.message === "CLOSE_REVERSAL_UNSUPPORTED") {
        return NextResponse.json({ error: "Откат этой заявки не поддерживается" }, { status: 400 });
      }
      if (err instanceof Error && err.message === "INVESTOR_NOT_FOUND") {
        return NextResponse.json({ error: "Позиция не найдена" }, { status: 400 });
      }
      throw err;
    }
  } catch (error) {
    if (isPrismaMissingTableForModel(error, "PaymentCorrectionProposal")) {
      console.error("PAYMENT_CORRECTION_PROPOSAL_PATCH_MISSING_TABLE: примените миграции Prisma.");
      return NextResponse.json(
        {
          error:
            "Таблица запросов правок не создана в базе. Выполните миграции Prisma для текущей DATABASE_URL.",
        },
        { status: 503 }
      );
    }
    console.error("PAYMENT_CORRECTION_PROPOSAL_PATCH:", error);
    if (isTransientDbError(error)) {
      return NextResponse.json({ error: "Временная ошибка БД, повторите запрос" }, { status: 503 });
    }
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
