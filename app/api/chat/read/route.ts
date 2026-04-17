import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export async function PATCH(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });

    const body = (await request.json()) as { peerId?: number };
    const peerId = Number(body.peerId);
    if (!Number.isFinite(peerId)) {
      return NextResponse.json({ error: "Некорректный peerId" }, { status: 400 });
    }

    const me = decoded.userId;
    const now = new Date();

    await prisma.chatMessage.updateMany({
      where: {
        senderId: peerId,
        recipientId: me,
        readAt: null,
      },
      data: { readAt: now },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("CHAT READ PATCH ERROR:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
