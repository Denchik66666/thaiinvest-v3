import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { findInvestorSlotForUser, getFirstActiveOwner } from "@/lib/chat-network";

export const dynamic = "force-dynamic";

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

    const lastUnreadRow = await prisma.chatMessage.findFirst({
      where: { recipientId: me, readAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        body: true,
        senderId: true,
        sender: { select: { username: true } },
      },
    });

    const lastUnread = lastUnreadRow
      ? {
          id: lastUnreadRow.id,
          senderId: lastUnreadRow.senderId,
          senderUsername: lastUnreadRow.sender.username,
          bodyPreview:
            lastUnreadRow.body.length > 100 ? `${lastUnreadRow.body.slice(0, 100)}…` : lastUnreadRow.body,
          createdAt: lastUnreadRow.createdAt.toISOString(),
        }
      : null;

    let defaultPeer: { id: number; username: string } | null = null;

    if (user.role === "INVESTOR") {
      const inv = await findInvestorSlotForUser(prisma, me);
      if (inv) {
        const owner = await prisma.user.findUnique({
          where: { id: inv.ownerId },
          select: { id: true, username: true },
        });
        if (owner) defaultPeer = owner;
      }
      if (!defaultPeer) {
        const fallbackOwner = await getFirstActiveOwner(prisma);
        if (fallbackOwner) defaultPeer = fallbackOwner;
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
      take: 200,
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
    const peerIdList = [...peerIds];

    let partnersFiltered: Array<{
      id: number;
      username: string;
      unreadCount: number;
      lastAt: string | null;
    }> = [];

    if (peerIdList.length > 0) {
      const [usersList, unreadGroups] = await Promise.all([
        prisma.user.findMany({
          where: { id: { in: peerIdList } },
          select: { id: true, username: true },
        }),
        prisma.chatMessage.groupBy({
          by: ["senderId"],
          where: { recipientId: me, readAt: null, senderId: { in: peerIdList } },
          _count: { _all: true },
        }),
      ]);

      const userById = new Map(usersList.map((u) => [u.id, u]));
      const unreadBySender = new Map(unreadGroups.map((g) => [g.senderId, g._count._all]));

      const lastAtByPeer = new Map<number, Date>();
      for (const m of partnersRaw) {
        const other = m.senderId === me ? m.recipientId : m.senderId;
        if (!lastAtByPeer.has(other)) lastAtByPeer.set(other, m.createdAt);
      }

      partnersFiltered = peerIdList
        .map((pid) => {
          const u = userById.get(pid);
          if (!u) return null;
          return {
            id: u.id,
            username: u.username,
            unreadCount: unreadBySender.get(pid) ?? 0,
            lastAt: lastAtByPeer.get(pid)?.toISOString() ?? null,
          };
        })
        .filter(Boolean) as Array<{
        id: number;
        username: string;
        unreadCount: number;
        lastAt: string | null;
      }>;
    }

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
      lastUnread,
      partners: partnersFiltered,
    });
  } catch (error) {
    console.error("CHAT CONTEXT ERROR:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
