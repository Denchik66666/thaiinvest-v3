import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { logAction } from "@/lib/audit";

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

    const where =
      decoded.role === "OWNER"
        ? { investor: { ownerId: decoded.userId, isPrivate: false } }
        : { investor: { OR: [{ linkedUserId: decoded.userId }, { investorUserId: decoded.userId }], isPrivate: false } };

    const requests = await prisma.bodyTopUpRequest.findMany({
      where,
      include: {
        investor: {
          select: {
            id: true,
            name: true,
            body: true,
            ownerId: true,
            linkedUserId: true,
            investorUserId: true,
            isPrivate: true,
          },
        },
        createdBy: { select: { id: true, username: true, role: true } },
        decidedBy: { select: { id: true, username: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ requests });
  } catch (error) {
    console.error("TOPUP REQUESTS GET ERROR:", error);
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
    if (!isObject(body) || typeof body.investorId !== "number" || typeof body.amount !== "number") {
      return NextResponse.json({ error: "Некорректные данные запроса" }, { status: 400 });
    }

    const comment = typeof body.comment === "string" ? body.comment.trim() : null;
    if (body.amount <= 0) return NextResponse.json({ error: "Сумма должна быть больше 0" }, { status: 400 });

    const investor = await prisma.investor.findFirst({
      where: { id: body.investorId, ownerId: decoded.userId, isPrivate: false },
    });
    if (!investor) return NextResponse.json({ error: "Инвестор не найден в общей сети OWNER" }, { status: 404 });
    if (!investor.linkedUserId && !investor.investorUserId) {
      return NextResponse.json({ error: "У инвестора нет привязки к аккаунту для подтверждения запроса" }, { status: 400 });
    }

    const pending = await prisma.bodyTopUpRequest.count({
      where: { investorId: investor.id, status: "pending_investor" },
    });
    if (pending > 0) {
      return NextResponse.json({ error: "У инвестора уже есть активный запрос на пополнение" }, { status: 409 });
    }

    const topUpRequest = await prisma.bodyTopUpRequest.create({
      data: {
        investorId: investor.id,
        amount: body.amount,
        status: "pending_investor",
        comment,
        createdById: decoded.userId,
      },
      include: {
        investor: {
          select: {
            id: true,
            name: true,
            body: true,
            ownerId: true,
            linkedUserId: true,
            investorUserId: true,
            isPrivate: true,
          },
        },
        createdBy: { select: { id: true, username: true, role: true } },
      },
    });

    await logAction({
      userId: decoded.userId,
      action: "BODY_TOPUP_REQUEST_CREATE",
      entityType: "BodyTopUpRequest",
      entityId: topUpRequest.id,
      newValue: JSON.stringify(topUpRequest),
    });

    return NextResponse.json({ success: true, request: topUpRequest });
  } catch (error) {
    console.error("TOPUP REQUESTS POST ERROR:", error);
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
    if (!isObject(body) || typeof body.requestId !== "number") {
      return NextResponse.json({ error: "Некорректные данные запроса" }, { status: 400 });
    }
    const action = parseAction(body.action);
    if (!action) return NextResponse.json({ error: "Некорректное действие" }, { status: 400 });
    const comment = typeof body.comment === "string" ? body.comment.trim() : undefined;

    const existing = await prisma.bodyTopUpRequest.findUnique({
      where: { id: body.requestId },
      include: { investor: true },
    });
    if (!existing) return NextResponse.json({ error: "Запрос не найден" }, { status: 404 });
    if (existing.status !== "pending_investor") {
      return NextResponse.json({ error: "Запрос уже обработан" }, { status: 400 });
    }

    if (action === "owner_cancel") {
      if (decoded.role !== "OWNER" || existing.investor.ownerId !== decoded.userId) {
        return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
      }

      const updated = await prisma.bodyTopUpRequest.update({
        where: { id: existing.id },
        data: {
          status: "cancelled_by_owner",
          comment: comment ? [existing.comment, comment].filter(Boolean).join("\n") : existing.comment,
          decidedById: decoded.userId,
          decidedAt: new Date(),
        },
      });

      await logAction({
        userId: decoded.userId,
        action: "BODY_TOPUP_REQUEST_CANCEL",
        entityType: "BodyTopUpRequest",
        entityId: updated.id,
        newValue: JSON.stringify(updated),
      });

      return NextResponse.json({ success: true, request: updated });
    }

    // Как в GET: решение принимает владелец инвестиционного аккаунта или привязанный к общей позиции пользователь.
    const canInvestorDecide =
      existing.investor.investorUserId === decoded.userId ||
      (!existing.investor.isPrivate && existing.investor.linkedUserId === decoded.userId);
    if (!canInvestorDecide) {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    if (action === "investor_reject") {
      const updated = await prisma.bodyTopUpRequest.update({
        where: { id: existing.id },
        data: {
          status: "rejected_by_investor",
          comment: comment ? [existing.comment, comment].filter(Boolean).join("\n") : existing.comment,
          decidedById: decoded.userId,
          decidedAt: new Date(),
        },
      });

      await logAction({
        userId: decoded.userId,
        action: "BODY_TOPUP_REQUEST_REJECT",
        entityType: "BodyTopUpRequest",
        entityId: updated.id,
        newValue: JSON.stringify(updated),
      });

      return NextResponse.json({ success: true, request: updated });
    }

    const result = await prisma.$transaction(async (tx: TopUpTxClient) => {
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
      });

      return { updatedInvestor, updatedRequest };
    });

    await logAction({
      userId: decoded.userId,
      action: "BODY_TOPUP_REQUEST_ACCEPT",
      entityType: "BodyTopUpRequest",
      entityId: existing.id,
      newValue: JSON.stringify(result.updatedRequest),
    });

    return NextResponse.json({ success: true, request: result.updatedRequest, investor: result.updatedInvestor });
  } catch (error) {
    console.error("TOPUP REQUESTS PATCH ERROR:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
