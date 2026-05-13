import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { Prisma, PrismaClient } from "@prisma/client";

import {
  bodyTopUpRequestUpdateReturnSelect,
  createBodyTopUpRequestWithDateCompat,
  findBodyTopUpRequestForPatch,
  findBodyTopUpsForOwnerFeed,
} from "@/lib/body-topup-request-date-compat";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { parseCalendarDateOnlyYmd } from "@/lib/calendar-request-date";
import { isTransientDbError, withDbRetry } from "@/lib/db-retry";

type TopUpAction = "investor_accept" | "investor_reject" | "owner_cancel";
type TopUpTxClient = Pick<PrismaClient, "investor" | "bodyTopUpRequest">;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function parseAction(v: unknown): TopUpAction | null {
  if (v === "investor_accept" || v === "investor_reject" || v === "owner_cancel") return v;
  return null;
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });

    const where: Prisma.BodyTopUpRequestWhereInput =
      decoded.role === "OWNER"
        ? { investor: { ownerId: decoded.userId, isPrivate: false } }
        : decoded.role === "SUPER_ADMIN"
          ? {}
          : { investor: { OR: [{ linkedUserId: decoded.userId }, { investorUserId: decoded.userId }], isPrivate: false } };

    const requests = await withDbRetry(() => findBodyTopUpsForOwnerFeed(where));

    return NextResponse.json({ requests });
  } catch (error) {
    console.error("TOPUP REQUESTS GET ERROR:", error);
    if (isTransientDbError(error)) {
      return NextResponse.json({ error: "Временная ошибка БД, повторите запрос" }, { status: 503 });
    }
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });
    if (decoded.role !== "OWNER") {
      return NextResponse.json({ error: "Только OWNER может создавать запросы пополнения" }, { status: 403 });
    }

    const body = await request.json();
    if (!isObject(body)) {
      return NextResponse.json({ error: "Некорректные данные запроса" }, { status: 400 });
    }
    const investorId = body.investorId;
    const amount = body.amount;
    if (typeof investorId !== "number" || typeof amount !== "number") {
      return NextResponse.json({ error: "Некорректные данные запроса" }, { status: 400 });
    }

    const comment = typeof body.comment === "string" ? body.comment.trim() : null;
    if (amount <= 0) return NextResponse.json({ error: "Сумма должна быть больше 0" }, { status: 400 });

    let requestCalendarAt: Date | undefined;
    if (body.requestDate !== undefined) {
      if (typeof body.requestDate !== "string") {
        return NextResponse.json({ error: "Некорректная дата заявки" }, { status: 400 });
      }
      const trimmed = body.requestDate.trim();
      if (trimmed.length > 0) {
        const parsed = parseCalendarDateOnlyYmd(trimmed);
        if (!parsed) {
          return NextResponse.json({ error: "Дата заявки: ожидается YYYY-MM-DD" }, { status: 400 });
        }
        requestCalendarAt = parsed;
      }
    }

    const investor = await withDbRetry(() => prisma.investor.findFirst({
      where: { id: investorId, ownerId: decoded.userId, isPrivate: false },
    }));
    if (!investor) return NextResponse.json({ error: "Инвестор не найден в общей сети OWNER" }, { status: 404 });
    if (!investor.linkedUserId && !investor.investorUserId) {
      return NextResponse.json({ error: "У инвестора нет привязки к аккаунту для подтверждения запроса" }, { status: 400 });
    }

    const pending = await withDbRetry(() => prisma.bodyTopUpRequest.count({
      where: { investorId: investor.id, status: "pending_investor" },
    }));
    if (pending > 0) {
      return NextResponse.json({ error: "У инвестора уже есть активный запрос на пополнение" }, { status: 409 });
    }

    const topUpRequest = await withDbRetry(() =>
      createBodyTopUpRequestWithDateCompat(
        {
          investorId: investor.id,
          amount,
          status: "pending_investor",
          comment,
          createdById: decoded.userId,
        },
        requestCalendarAt
      )
    );

    try {
      await withDbRetry(() => logAction({
        userId: decoded.userId,
        action: "BODY_TOPUP_REQUEST_CREATE",
        entityType: "BodyTopUpRequest",
        entityId: topUpRequest.id,
        newValue: JSON.stringify(topUpRequest),
      }));
    } catch (auditError) {
      console.error("TOPUP REQUESTS POST AUDIT ERROR:", auditError);
    }

    return NextResponse.json({ success: true, request: topUpRequest });
  } catch (error) {
    console.error("TOPUP REQUESTS POST ERROR:", error);
    if (isTransientDbError(error)) {
      return NextResponse.json({ error: "Временная ошибка БД, повторите операцию" }, { status: 503 });
    }
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });

    const body = await request.json();
    if (!isObject(body)) {
      return NextResponse.json({ error: "Некорректные данные запроса" }, { status: 400 });
    }
    const requestId = body.requestId;
    if (typeof requestId !== "number") {
      return NextResponse.json({ error: "Некорректные данные запроса" }, { status: 400 });
    }
    const action = parseAction(body.action);
    if (!action) return NextResponse.json({ error: "Некорректное действие" }, { status: 400 });
    const comment = typeof body.comment === "string" ? body.comment.trim() : undefined;

    const existing = await withDbRetry(() => findBodyTopUpRequestForPatch(requestId));
    if (!existing) return NextResponse.json({ error: "Запрос не найден" }, { status: 404 });
    if (existing.status !== "pending_investor") {
      return NextResponse.json({ error: "Запрос уже обработан" }, { status: 400 });
    }

    if (action === "owner_cancel") {
      const isOwner = decoded.role === "OWNER" && existing.investor.ownerId === decoded.userId;
      const isSuperAdmin = decoded.role === "SUPER_ADMIN";
      if (!isOwner && !isSuperAdmin) {
        return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
      }

      const updated = await withDbRetry(() => prisma.bodyTopUpRequest.update({
        where: { id: existing.id },
        data: {
          status: "cancelled_by_owner",
          comment: comment ? [existing.comment, comment].filter(Boolean).join("\n") : existing.comment,
          decidedById: decoded.userId,
          decidedAt: new Date(),
        },
        select: bodyTopUpRequestUpdateReturnSelect,
      }));

      try {
        await withDbRetry(() => logAction({
          userId: decoded.userId,
          action: "BODY_TOPUP_REQUEST_CANCEL",
          entityType: "BodyTopUpRequest",
          entityId: updated.id,
          newValue: JSON.stringify(updated),
        }));
      } catch (auditError) {
        console.error("TOPUP REQUESTS CANCEL AUDIT ERROR:", auditError);
      }

      return NextResponse.json({ success: true, request: updated });
    }

    // Как в GET: инвестор по привязке; SUPER_ADMIN — как в сценариях выплат (единая линия решений).
    const canInvestorDecide =
      existing.investor.investorUserId === decoded.userId ||
      (!existing.investor.isPrivate && existing.investor.linkedUserId === decoded.userId) ||
      decoded.role === "SUPER_ADMIN";
    if (!canInvestorDecide) {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    if (action === "investor_reject") {
      const updated = await withDbRetry(() => prisma.bodyTopUpRequest.update({
        where: { id: existing.id },
        data: {
          status: "rejected_by_investor",
          comment: comment ? [existing.comment, comment].filter(Boolean).join("\n") : existing.comment,
          decidedById: decoded.userId,
          decidedAt: new Date(),
        },
        select: bodyTopUpRequestUpdateReturnSelect,
      }));

      try {
        await withDbRetry(() => logAction({
          userId: decoded.userId,
          action: "BODY_TOPUP_REQUEST_REJECT",
          entityType: "BodyTopUpRequest",
          entityId: updated.id,
          newValue: JSON.stringify(updated),
        }));
      } catch (auditError) {
        console.error("TOPUP REQUESTS REJECT AUDIT ERROR:", auditError);
      }

      return NextResponse.json({ success: true, request: updated });
    }

    const result = await withDbRetry(() => prisma.$transaction(async (tx: TopUpTxClient) => {
      const investor = await tx.investor.findUnique({ where: { id: existing.investorId } });
      if (!investor) throw new Error("INVESTOR_NOT_FOUND");

      const updatedInvestor = await tx.investor.update({
        where: { id: investor.id },
        data: { body: investor.body + existing.amount },
      });

      const updatedRequest = await tx.bodyTopUpRequest.update({
        where: { id: existing.id },
        data: {
          status: "accepted_by_investor",
          comment: comment ? [existing.comment, comment].filter(Boolean).join("\n") : existing.comment,
          decidedById: decoded.userId,
          decidedAt: new Date(),
        },
        select: bodyTopUpRequestUpdateReturnSelect,
      });

      return { updatedInvestor, updatedRequest };
    }));

    try {
      await withDbRetry(() => logAction({
        userId: decoded.userId,
        action: "BODY_TOPUP_REQUEST_ACCEPT",
        entityType: "BodyTopUpRequest",
        entityId: existing.id,
        newValue: JSON.stringify(result.updatedRequest),
      }));
    } catch (auditError) {
      console.error("TOPUP REQUESTS ACCEPT AUDIT ERROR:", auditError);
    }

    return NextResponse.json({ success: true, request: result.updatedRequest, investor: result.updatedInvestor });
  } catch (error) {
    console.error("TOPUP REQUESTS PATCH ERROR:", error);
    if (isTransientDbError(error)) {
      return NextResponse.json({ error: "Временная ошибка БД, повторите операцию" }, { status: 503 });
    }
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
