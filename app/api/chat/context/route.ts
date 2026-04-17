import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });

    const me = decoded.userId;
    const user = await prisma.user.findUnique({
      where: { id: me },
      select: { id: true, role: true },
    });
    if (!user) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

    const unreadTotal = await prisma.chatMessage.count({
      where: { recipientId: me, readAt: null },
    });

    let defaultPeer: { id: number; username: string } | null = null;

    if (user.role === "INVESTOR") {
      const inv = await prisma.investor.findFirst({
        where: { investorUserId: me },
        select: { ownerId: true },
      });
      if (inv) {
        const owner = await prisma.user.findUnique({
          where: { id: inv.ownerId },
          select: { id: true, username: true },
        });
        if (owner) defaultPeer = owner;
      }
    } else if (user.role === "OWNER") {
      const admin = await prisma.user.findFirst({
        where: { role: "SUPER_ADMIN", isArchived: false },
        orderBy: { id: "asc" },
        select: { id: true, username: true },
      });
      if (admin) defaultPeer = admin;
    }

    const partnersRaw = await prisma.chatMessage.findMany({
      where: {
        OR: [{ senderId: me }, { recipientId: me }],
      },
      orderBy: { createdAt: "desc" },
      take: 400,
      select: {
        senderId: true,
        recipientId: true,
        createdAt: true,
      },
    });

    const peerIds = new Set<number>();
    for (const m of partnersRaw) {
      const other = m.senderId === me ? m.recipientId : m.senderId;
      peerIds.add(other);
    }

    const partners = await Promise.all(
      [...peerIds].map(async (pid) => {
        const u = await prisma.user.findUnique({
          where: { id: pid },
          select: { id: true, username: true },
        });
        if (!u) return null;
        const unread = await prisma.chatMessage.count({
          where: { senderId: pid, recipientId: me, readAt: null },
        });
        const last = await prisma.chatMessage.findFirst({
          where: {
            OR: [
              { senderId: me, recipientId: pid },
              { senderId: pid, recipientId: me },
            ],
          },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        });
        return {
          id: u.id,
          username: u.username,
          unreadCount: unread,
          lastAt: last?.createdAt.toISOString() ?? null,
        };
      })
    );

    const partnersFiltered = partners.filter(Boolean) as Array<{
      id: number;
      username: string;
      unreadCount: number;
      lastAt: string | null;
    }>;

    partnersFiltered.sort((a, b) => {
      const ta = a.lastAt ? +new Date(a.lastAt) : 0;
      const tb = b.lastAt ? +new Date(b.lastAt) : 0;
      return tb - ta;
    });

    if (user.role === "SUPER_ADMIN" && partnersFiltered.length > 0 && !defaultPeer) {
      const first = partnersFiltered[0];
      defaultPeer = { id: first.id, username: first.username };
    }

    return NextResponse.json({
      success: true,
      defaultPeer,
      unreadTotal,
      partners: partnersFiltered,
    });
  } catch (error) {
    console.error("CHAT CONTEXT ERROR:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
