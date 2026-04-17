import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { findInvestorSlotForUser, getFirstActiveOwner } from "@/lib/chat-network";

/** Список пользователей для выбора собеседника (в основном для SUPER_ADMIN). */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });

    const me = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role: true },
    });
    if (!me) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

    if (me.role === "SUPER_ADMIN") {
      /**
       * Раньше здесь были все OWNER/INVESTOR в базе — из‑за этого в чате появлялись
       * e2e и прочие «технические» аккаунты, которых нет в вашем списке на главной.
       * Список собеседников совпадает с кабинетом: владельцы сети + инвесторы из общей
       * сети, привязанные к этому SUPER_ADMIN (`linkedUserId`).
       */
      const owners = await prisma.user.findMany({
        where: {
          isArchived: false,
          id: { not: me.id },
          role: "OWNER",
        },
        select: { id: true, username: true, role: true },
        orderBy: { username: "asc" },
        take: 200,
      });

      const invRows = await prisma.investor.findMany({
        where: {
          isPrivate: false,
          linkedUserId: me.id,
          investorUserId: { not: null },
        },
        select: {
          investorUser: { select: { id: true, username: true, role: true } },
        },
        take: 300,
      });

      const fromInvestors = invRows
        .map((r) => r.investorUser)
        .filter((u): u is NonNullable<(typeof invRows)[number]["investorUser"]> => u != null);

      const seen = new Set<number>();
      const users: Array<{ id: number; username: string; role: string }> = [];
      for (const u of [...owners, ...fromInvestors]) {
        if (u.id === me.id || seen.has(u.id)) continue;
        seen.add(u.id);
        users.push(u);
      }
      users.sort((a, b) => a.username.localeCompare(b.username, "ru"));
      return NextResponse.json({ success: true, users });
    }

    if (me.role === "OWNER") {
      const admin = await prisma.user.findFirst({
        where: { role: "SUPER_ADMIN", isArchived: false },
        orderBy: { id: "asc" },
        select: { id: true, username: true, role: true },
      });
      const invRows = await prisma.investor.findMany({
        where: { ownerId: me.id, investorUserId: { not: null } },
        select: { investorUser: { select: { id: true, username: true, role: true } } },
        take: 200,
      });
      const investors = invRows
        .map((r: { investorUser: { id: number; username: string; role: string } | null }) => r.investorUser)
        .filter(Boolean) as Array<{ id: number; username: string; role: string }>;
      const seen = new Set<number>();
      const users: Array<{ id: number; username: string; role: string }> = [];
      if (admin) {
        users.push(admin);
        seen.add(admin.id);
      }
      for (const u of investors) {
        if (!seen.has(u.id)) {
          users.push(u);
          seen.add(u.id);
        }
      }
      users.sort((a, b) => a.username.localeCompare(b.username, "ru"));
      return NextResponse.json({ success: true, users });
    }

    if (me.role === "INVESTOR") {
      const inv = await findInvestorSlotForUser(prisma, me.id);
      if (inv) {
        const owner = await prisma.user.findUnique({
          where: { id: inv.ownerId },
          select: { id: true, username: true, role: true },
        });
        return NextResponse.json({ success: true, users: owner ? [owner] : [] });
      }
      const fallbackOwner = await getFirstActiveOwner(prisma);
      return NextResponse.json({
        success: true,
        users: fallbackOwner ? [{ ...fallbackOwner, role: "OWNER" as const }] : [],
      });
    }

    return NextResponse.json({ success: true, users: [] });
  } catch (error) {
    console.error("CHAT DIRECTORY ERROR:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
