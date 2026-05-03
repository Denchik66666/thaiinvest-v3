import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { canChatWithPeer } from "@/lib/chat-peer-permission";

const MAX_LEN = 2000;

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });

    const peerId = Number(request.nextUrl.searchParams.get("peerId"));
    if (!Number.isFinite(peerId)) {
      return NextResponse.json({ error: "Укажите peerId" }, { status: 400 });
    }

    const me = decoded.userId;
    const allowedRead = await canChatWithPeer(prisma, me, peerId);
    if (!allowedRead) {
      return NextResponse.json({ error: "Недостаточно прав для переписки с этим пользователем" }, { status: 403 });
    }

    const messages = await prisma.chatMessage.findMany({
      where: {
        OR: [
          { senderId: me, recipientId: peerId },
          { senderId: peerId, recipientId: me },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: 500,
      include: {
        sender: { select: { id: true, username: true } },
      },
    });
    const mappedMessages = messages as Array<{
      id: number;
      body: string;
      createdAt: Date;
      senderId: number;
      sender: { username: string };
    }>;

    return NextResponse.json({
      success: true,
      messages: mappedMessages.map((m) => ({
        id: m.id,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
        senderId: m.senderId,
        senderUsername: m.sender.username,
      })),
    });
  } catch (error) {
    console.error("CHAT MESSAGES GET ERROR:", error);
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

    const body = (await request.json()) as { recipientId?: number; body?: string };
    const recipientId = Number(body.recipientId);
    const text = (body.body ?? "").trim();
    if (!Number.isFinite(recipientId)) {
      return NextResponse.json({ error: "Некорректный получатель" }, { status: 400 });
    }
    if (!text || text.length > MAX_LEN) {
      return NextResponse.json({ error: `Сообщение 1–${MAX_LEN} символов` }, { status: 400 });
    }

    const me = decoded.userId;
    if (recipientId === me) {
      return NextResponse.json({ error: "Нельзя писать самому себе" }, { status: 400 });
    }

    const recipient = await prisma.user.findFirst({
      where: { id: recipientId, isArchived: false },
    });
    if (!recipient) {
      return NextResponse.json({ error: "Получатель не найден" }, { status: 404 });
    }

    const allowed = await canChatWithPeer(prisma, me, recipientId);

    if (!allowed) {
      return NextResponse.json({ error: "Недостаточно прав для переписки с этим пользователем" }, { status: 403 });
    }

    const msg = await prisma.chatMessage.create({
      data: {
        senderId: me,
        recipientId,
        body: text,
      },
      include: {
        sender: { select: { id: true, username: true } },
      },
    });

    return NextResponse.json({
      success: true,
      message: {
        id: msg.id,
        body: msg.body,
        createdAt: msg.createdAt.toISOString(),
        senderId: msg.senderId,
        senderUsername: msg.sender.username,
      },
    });
  } catch (error) {
    console.error("CHAT MESSAGES POST ERROR:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
