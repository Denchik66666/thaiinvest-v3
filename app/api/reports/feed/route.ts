import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { findBodyTopUpsForReportsFeed } from "@/lib/body-topup-request-date-compat";
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

    let bodyTopUps: unknown[] = [];
    if (role === "SUPER_ADMIN") {
      bodyTopUps = await findBodyTopUpsForReportsFeed({ take: 120 });
    } else if (role === "OWNER") {
      bodyTopUps = await findBodyTopUpsForReportsFeed({
        where: { investor: { ownerId: decoded.userId, isPrivate: false } },
        take: 120,
      });
    } else {
      bodyTopUps = await findBodyTopUpsForReportsFeed({
        where: {
          investor: {
            OR: [{ linkedUserId: decoded.userId }, { investorUserId: decoded.userId }],
            isPrivate: false,
          },
        },
        take: 120,
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
