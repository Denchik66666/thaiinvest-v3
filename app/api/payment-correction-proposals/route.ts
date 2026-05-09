export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { isTransientDbError, withDbRetry } from "@/lib/db-retry";
import { userHasInvestorScopedAccess } from "@/lib/investor-payment-access";
import {
  assertCorrectionAllowedForPayment,
  resolvePaymentCorrectionAssigneeUserId,
  type CorrectionPayload,
} from "@/lib/payment-correction";
import { notifyPaymentCorrectionProposal } from "@/lib/payment-correction-notify";
import { moneyRound2 } from "@/lib/money-round";
import { getPaymentCorrectionProposalDelegate } from "@/lib/payment-correction-proposal-delegate";
import { isPrismaMissingTableForModel } from "@/lib/prisma-known-errors";

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function mapAssertError(e: unknown): string {
  if (!(e instanceof Error)) return "Некорректные данные правки";
  switch (e.message) {
    case "PATCH_DATES_EMPTY":
      return "Укажите хотя бы одну дату или сумму";
    case "AMOUNT_PATCH_COMPLETED_UNSUPPORTED":
      return "Изменение суммы завершённой заявки недоступно";
    case "REVERSE_NOT_COMPLETED":
      return "Возврат проводки возможен только для завершённой заявки";
    case "CLOSE_REVERSAL_UNSUPPORTED":
      return "Откат завершённой заявки «закрытие позиции» не поддерживается";
    case "BAD_PAYMENT_TYPE":
      return "Некорректный тип заявки для отката";
    case "ALREADY_AT_OWNER_STEP":
      return "Заявка уже на шаге владельца";
    case "NOT_APPROVED_YET":
      return "Заявка ещё не одобрена — откат к шагу инвестора недоступен";
    default:
      return "Некорректные данные правки";
  }
}

function parsePatchDates(
  raw: unknown
): Partial<{ createdAt: string; approvedAt: string | null; acceptedAt: string | null }> | undefined {
  if (!raw || !isObject(raw)) return undefined;
  const out: Partial<{ createdAt: string; approvedAt: string | null; acceptedAt: string | null }> = {};
  if (typeof raw.createdAt === "string" && raw.createdAt.trim()) out.createdAt = raw.createdAt.trim();
  if (raw.approvedAt === null) out.approvedAt = null;
  else if (typeof raw.approvedAt === "string" && raw.approvedAt.trim()) out.approvedAt = raw.approvedAt.trim();
  if (raw.acceptedAt === null) out.acceptedAt = null;
  else if (typeof raw.acceptedAt === "string" && raw.acceptedAt.trim()) out.acceptedAt = raw.acceptedAt.trim();
  return Object.keys(out).length ? out : undefined;
}

function parsePatchAmount(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return moneyRound2(n);
}

function buildServerPayload(
  payment: { status: string; type: string },
  body: Record<string, unknown>
): CorrectionPayload | null {
  const mode = body.mode;
  const mergeComment = typeof body.mergeComment === "string" ? body.mergeComment.trim() : "";
  if (!mergeComment || mergeComment.length < 3) return null;

  const patchDates = parsePatchDates(body.patchDates);
  const patchAmountOnly = parsePatchAmount(body.patchAmount);

  if (mode === "dates_only") {
    const datesAssigneeRole = body.datesAssigneeRole;
    if (datesAssigneeRole !== "OWNER" && datesAssigneeRole !== "INVESTOR") return null;
    const patch = patchDates ?? {};
    try {
      assertCorrectionAllowedForPayment(payment, {
        mode: "dates_only",
        patchDates: patch,
        mergeComment,
        ...(patchAmountOnly !== undefined ? { patchAmount: patchAmountOnly } : {}),
      });
    } catch {
      return null;
    }
    return {
      mode: "dates_only",
      patchDates: patch,
      mergeComment,
      ...(patchAmountOnly !== undefined ? { patchAmount: patchAmountOnly } : {}),
    };
  }

  if (mode !== "rollback") return null;
  const rollbackTarget = body.rollbackTarget;
  if (rollbackTarget !== "owner_step" && rollbackTarget !== "investor_step") return null;

  const reverseCompletion =
    payment.status === "completed" && (payment.type === "interest" || payment.type === "body");

  if (payment.status === "completed" && payment.type === "close") {
    return null;
  }

  const payload: CorrectionPayload = {
    mode: "rollback",
    rollbackTarget,
    reverseCompletion,
    mergeComment,
    patchDates,
  };

  try {
    assertCorrectionAllowedForPayment(payment, payload);
  } catch {
    return null;
  }

  return payload;
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });

    const baseInclude = {
      payment: {
        select: {
          id: true,
          type: true,
          status: true,
          amount: true,
          investor: { select: { id: true, name: true } },
        },
      },
      createdBy: { select: { id: true, username: true } },
    } as const;

    const pcm = getPaymentCorrectionProposalDelegate(prisma);
    if (!pcm) {
      console.error(
        "PRISMA_MISSING_PAYMENT_CORRECTION_PROPOSAL: выполните `npx prisma generate` и перезапустите dev-сервер."
      );
      return NextResponse.json({ incoming: [], outgoing: [] });
    }

    const incoming = (await withDbRetry(() =>
      pcm.findMany({
        where: { assigneeUserId: decoded.userId, status: "pending" },
        include: baseInclude,
        orderBy: { createdAt: "desc" },
      })
    )) as Awaited<ReturnType<typeof prisma.paymentCorrectionProposal.findMany>>;

    const outgoing =
      decoded.role === "SUPER_ADMIN"
        ? ((await withDbRetry(() =>
            pcm.findMany({
              where: { createdById: decoded.userId, status: "pending" },
              include: baseInclude,
              orderBy: { createdAt: "desc" },
            })
          )) as Awaited<ReturnType<typeof prisma.paymentCorrectionProposal.findMany>>)
        : [];

    return NextResponse.json({ incoming, outgoing });
  } catch (error) {
    if (isPrismaMissingTableForModel(error, "PaymentCorrectionProposal")) {
      console.error(
        "PAYMENT_CORRECTION_PROPOSALS_MISSING_TABLE: выполните `npx prisma migrate deploy` (или migrate dev) для текущей DATABASE_URL."
      );
      return NextResponse.json({ incoming: [], outgoing: [] });
    }
    console.error("PAYMENT_CORRECTION_PROPOSALS_GET:", error);
    if (isTransientDbError(error)) {
      /** Не блокируем финансы из‑за пула; список заявок догрузит следующий опрос. */
      return NextResponse.json({ incoming: [], outgoing: [] });
    }
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });

    if (decoded.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Только SUPER_ADMIN может создавать запрос правки" }, { status: 403 });
    }

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
    if (!isObject(raw)) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });

    const paymentId = Number(raw.paymentId);
    if (!Number.isFinite(paymentId) || paymentId <= 0 || !Number.isInteger(paymentId)) {
      return NextResponse.json({ error: "Некорректный paymentId" }, { status: 400 });
    }

    const adminNote = typeof raw.adminNote === "string" ? raw.adminNote.trim() : "";
    if (adminNote.length < 3) {
      return NextResponse.json({ error: "Укажите пояснение для адресата (от 3 символов)" }, { status: 400 });
    }

    const payment = await withDbRetry(() =>
      prisma.payment.findUnique({
        where: { id: paymentId },
        include: { investor: true },
      })
    );
    if (!payment) return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });

    if (!userHasInvestorScopedAccess(decoded.userId, decoded.role, payment.investor)) {
      return NextResponse.json({ error: "Недостаточно прав по позиции" }, { status: 403 });
    }

    if (
      raw.mode === "rollback" &&
      payment.status === "completed" &&
      payment.type === "close"
    ) {
      return NextResponse.json(
        { error: "Откат завершённой заявки на закрытие позиции недоступен" },
        { status: 400 }
      );
    }

    const payload = buildServerPayload(payment, raw);
    if (!payload) {
      return NextResponse.json({ error: "Некорректное тело правки или недопустимое сочетание статуса/режима" }, { status: 400 });
    }

    try {
      assertCorrectionAllowedForPayment(payment, payload);
    } catch (e) {
      return NextResponse.json({ error: mapAssertError(e) }, { status: 400 });
    }

    let assigneeRole: "OWNER" | "INVESTOR";
    if (payload.mode === "dates_only") {
      const r = raw.datesAssigneeRole;
      if (r !== "OWNER" && r !== "INVESTOR") {
        return NextResponse.json({ error: "Укажите datesAssigneeRole: OWNER или INVESTOR" }, { status: 400 });
      }
      assigneeRole = r;
    } else {
      assigneeRole = payload.rollbackTarget === "owner_step" ? "OWNER" : "INVESTOR";
    }

    const assigneeUserId = resolvePaymentCorrectionAssigneeUserId(payment.investor, assigneeRole);
    if (assigneeUserId == null) {
      return NextResponse.json({ error: "Не удалось определить пользователя-адресата" }, { status: 400 });
    }

    const pending = await withDbRetry(() =>
      pcm.count({
        where: { paymentId: payment.id, status: "pending" },
      })
    );
    if (pending > 0) {
      return NextResponse.json({ error: "По этой заявке уже есть активный запрос правки" }, { status: 409 });
    }

    const proposal = await withDbRetry(() =>
      pcm.create({
        data: {
          paymentId: payment.id,
          createdById: decoded.userId,
          assigneeUserId,
          status: "pending",
          adminNote,
          payload: payload as object,
        },
        include: {
          payment: {
            select: {
              id: true,
              type: true,
              status: true,
              amount: true,
              investor: { select: { id: true, name: true } },
            },
          },
          createdBy: { select: { id: true, username: true } },
        },
      })
    );

    void logAction({
      userId: decoded.userId,
      action: "PAYMENT_CORRECTION_PROPOSE",
      entityType: "Payment",
      entityId: payment.id,
      newValue: JSON.stringify({ proposalId: proposal.id, payload }),
    });

    void notifyPaymentCorrectionProposal(prisma, {
      fromUserId: decoded.userId,
      toUserId: assigneeUserId,
      paymentId: payment.id,
      adminNote,
    }).catch((notifyErr) => {
      console.error("PAYMENT_CORRECTION_NOTIFY:", notifyErr);
    });

    return NextResponse.json({ success: true, proposal });
  } catch (error) {
    if (isPrismaMissingTableForModel(error, "PaymentCorrectionProposal")) {
      console.error("PAYMENT_CORRECTION_PROPOSALS_POST_MISSING_TABLE: примените миграции Prisma.");
      return NextResponse.json(
        {
          error:
            "Таблица запросов правок не создана в базе. Выполните: npx prisma migrate deploy (на сервере) или prisma migrate dev (локально).",
        },
        { status: 503 }
      );
    }
    console.error("PAYMENT_CORRECTION_PROPOSALS_POST:", error);
    if (isTransientDbError(error)) {
      return NextResponse.json({ error: "Временная ошибка БД, повторите запрос" }, { status: 503 });
    }
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
