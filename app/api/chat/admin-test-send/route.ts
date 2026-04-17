import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

const MAX_LEN = 2000;

/**
 * Только SUPER_ADMIN: отправить сообщение от имени другого пользователя (для проверки уведомлений).
 * Не используйте в публичных клиентах — только ручной вызов / внутренние инструменты.
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });
    if (decoded.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const body = (await request.json()) as { senderId?: number; recipientId?: number; body?: string };
    const senderId = Number(body.senderId);
    const recipientId = Number(body.recipientId);
    const text = (body.body ?? "").trim();

    if (!Number.isFinite(senderId) || !Number.isFinite(recipientId)) {
      return NextResponse.json({ error: "Некорректные senderId / recipientId" }, { status: 400 });
    }
    if (senderId === recipientId) {
      return NextResponse.json({ error: "Нельзя писать самому себе" }, { status: 400 });
    }
    if (!text || text.length > MAX_LEN) {
      return NextResponse.json({ error: `Сообщение 1–${MAX_LEN} символов` }, { status: 400 });
    }

    const [sender, recipient] = await Promise.all([
      prisma.user.findFirst({ where: { id: senderId, isArchived: false } }),
      prisma.user.findFirst({ where: { id: recipientId, isArchived: false } }),
    ]);
    if (!sender) return NextResponse.json({ error: "Отправитель не найден" }, { status: 404 });
    if (!recipient) return NextResponse.json({ error: "Получатель не найден" }, { status: 404 });

    const msg = await prisma.chatMessage.create({
      data: {
        senderId,
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
    console.error("CHAT ADMIN TEST SEND ERROR:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
