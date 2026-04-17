import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });

    const role = decoded.role;

    let rateHistory: unknown[] = [];
    if (role === "OWNER" || role === "SUPER_ADMIN") {
      rateHistory = await prisma.rateHistory.findMany({
        orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
        take: 120,
        select: {
          id: true,
          oldRate: true,
          newRate: true,
          effectiveDate: true,
          comment: true,
          createdAt: true,
          user: { select: { username: true, role: true } },
        },
      });
    }

    let auditLog: unknown[] = [];
    if (role === "SUPER_ADMIN") {
      auditLog = await prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 150,
        include: {
          user: { select: { username: true, role: true } },
        },
      });
    } else if (role === "OWNER") {
      const invs = await prisma.investor.findMany({
        where: { ownerId: decoded.userId },
        select: { id: true },
      });
      const ids = invs.map((i) => i.id);
      if (ids.length) {
        auditLog = await prisma.auditLog.findMany({
          where: { entityType: "Investor", entityId: { in: ids } },
          orderBy: { createdAt: "desc" },
          take: 100,
          include: {
            user: { select: { username: true, role: true } },
          },
        });
      }
    }

    const topUpInclude = {
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
    } as const;

    let bodyTopUps: unknown[] = [];
    if (role === "SUPER_ADMIN") {
      bodyTopUps = await prisma.bodyTopUpRequest.findMany({
        orderBy: { createdAt: "desc" },
        take: 120,
        include: topUpInclude,
      });
    } else if (role === "OWNER") {
      bodyTopUps = await prisma.bodyTopUpRequest.findMany({
        where: { investor: { ownerId: decoded.userId, isPrivate: false } },
        orderBy: { createdAt: "desc" },
        take: 120,
        include: topUpInclude,
      });
    } else {
      bodyTopUps = await prisma.bodyTopUpRequest.findMany({
        where: {
          investor: {
            OR: [{ linkedUserId: decoded.userId }, { investorUserId: decoded.userId }],
            isPrivate: false,
          },
        },
        orderBy: { createdAt: "desc" },
        take: 120,
        include: topUpInclude,
      });
    }

    return NextResponse.json({
      success: true,
      rateHistory,
      auditLog,
      bodyTopUps,
    });
  } catch (error) {
    console.error("GET REPORTS FEED ERROR:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
