import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { hashPassword, verifyToken } from "@/lib/auth";
import { logAction } from "@/lib/audit";

type InvestorTxClient = Pick<PrismaClient, "bodyTopUpRequest" | "payment" | "accrual" | "investor" | "user">;

function randomPassword(length = 10): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
}

function buildArchivedUsername(investorId: number) {
  return `archived_inv_${investorId}_${Date.now()}`;
}

async function generateUniqueInvestorUsername(baseName: string) {
  const slug = (baseName || "investor")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 8) || "investor";

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = `${Math.floor(1000 + Math.random() * 9000)}`;
    const username = `inv_${slug}_${suffix}`;
    const exists = await prisma.user.findUnique({ where: { username } });
    if (!exists) return username;
  }
  return `inv_${Date.now()}`;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });

    const { id } = await context.params;
    const investorId = Number(id);
    if (!Number.isFinite(investorId)) {
      return NextResponse.json({ error: "Некорректный ID инвестора" }, { status: 400 });
    }

    const investor = await prisma.investor.findUnique({
      where: { id: investorId },
      include: {
        owner: { select: { id: true, username: true, role: true } },
        investorUser: { select: { id: true, username: true } },
        payments: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!investor) return NextResponse.json({ error: "Инвестор не найден" }, { status: 404 });

    if (decoded.role === "OWNER") {
      if (investor.ownerId !== decoded.userId || investor.isPrivate) {
        return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
      }
    }
    if (decoded.role === "INVESTOR" && investor.investorUserId !== decoded.userId && investor.linkedUserId !== decoded.userId) {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const topUpRequests = await prisma.bodyTopUpRequest.findMany({
      where: { investorId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        amount: true,
        status: true,
        comment: true,
        createdAt: true,
        decidedAt: true,
      },
    });

    const actions = await prisma.auditLog.findMany({
      where: {
        entityType: "Investor",
        entityId: investorId,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        user: {
          select: { username: true, role: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      investor,
      topUpRequests,
      actions: actions.map((a) => ({
        id: a.id,
        action: a.action,
        oldValue: a.oldValue,
        newValue: a.newValue,
        createdAt: a.createdAt,
        user: a.user,
      })),
    });
  } catch (error) {
    console.error("GET INVESTOR DETAIL ERROR:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });

    const { id } = await context.params;
    const investorId = Number(id);
    if (!Number.isFinite(investorId)) {
      return NextResponse.json({ error: "Некорректный ID инвестора" }, { status: 400 });
    }

    const investor = await prisma.investor.findUnique({ where: { id: investorId } });
    if (!investor) return NextResponse.json({ error: "Инвестор не найден" }, { status: 404 });
    if (investor.isSystemOwner) {
      return NextResponse.json({ error: "Системного инвестора удалять нельзя" }, { status: 400 });
    }

    if (decoded.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Только SUPER_ADMIN может удалять инвесторов" }, { status: 403 });
    }

    await prisma.$transaction(async (tx: InvestorTxClient) => {
      await tx.bodyTopUpRequest.deleteMany({ where: { investorId } });
      await tx.payment.deleteMany({ where: { investorId } });
      await tx.accrual.deleteMany({ where: { investorId } });
      await tx.investor.delete({ where: { id: investorId } });
      if (investor.investorUserId) {
        await tx.user.update({
          where: { id: investor.investorUserId },
          data: {
            username: buildArchivedUsername(investorId),
            password: hashPassword(randomPassword(32)),
            isArchived: true,
            archivedAt: new Date(),
          },
        });
      }
    });

    await logAction({
      userId: decoded.userId,
      action: "DELETE_INVESTOR",
      entityType: "Investor",
      entityId: investorId,
      oldValue: JSON.stringify(investor),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE INVESTOR ERROR:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });
    if (decoded.role !== "OWNER" && decoded.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const { id } = await context.params;
    const investorId = Number(id);
    if (!Number.isFinite(investorId)) {
      return NextResponse.json({ error: "Некорректный ID инвестора" }, { status: 400 });
    }

    const investor = await prisma.investor.findUnique({
      where: { id: investorId },
      include: { investorUser: true },
    });
    if (!investor) return NextResponse.json({ error: "Инвестор не найден" }, { status: 404 });
    if (decoded.role === "OWNER" && investor.ownerId !== decoded.userId) {
      return NextResponse.json({ error: "Недостаточно прав для этого инвестора" }, { status: 403 });
    }

    const nextPassword = randomPassword(10);

    if (investor.investorUserId && investor.investorUser) {
      await prisma.user.update({
        where: { id: investor.investorUserId },
        data: { password: hashPassword(nextPassword) },
      });

      await logAction({
        userId: decoded.userId,
        action: "RESET_INVESTOR_CREDENTIALS",
        entityType: "Investor",
        entityId: investorId,
        newValue: JSON.stringify({ investorUserId: investor.investorUserId }),
      });

      return NextResponse.json({
        success: true,
        credentials: {
          username: investor.investorUser.username,
          password: nextPassword,
        },
      });
    }

    const username = await generateUniqueInvestorUsername(investor.name);

    await prisma.$transaction(async (tx: InvestorTxClient) => {
      const investorUser = await tx.user.create({
        data: {
          username,
          password: hashPassword(nextPassword),
          role: "INVESTOR",
          isSystemOwner: false,
        },
      });
      await tx.investor.update({
        where: { id: investorId },
        data: { investorUserId: investorUser.id },
      });
    });

    await logAction({
      userId: decoded.userId,
      action: "ISSUE_INVESTOR_CREDENTIALS",
      entityType: "Investor",
      entityId: investorId,
      newValue: JSON.stringify({ username }),
    });

    return NextResponse.json({
      success: true,
      credentials: {
        username,
        password: nextPassword,
      },
    });
  } catch (error) {
    console.error("PATCH INVESTOR CREDENTIALS ERROR:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
