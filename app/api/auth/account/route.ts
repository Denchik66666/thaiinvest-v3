import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { verifyToken, hashPassword } from "@/lib/auth";

type AccountUpdateBody = {
  username?: string;
  currentPassword?: string;
  newPassword?: string;
};

export async function PATCH(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });

    const body = (await request.json()) as AccountUpdateBody;
    const nextUsername = body.username?.trim();
    const wantsPasswordChange = Boolean(body.newPassword);

    if (!nextUsername && !wantsPasswordChange) {
      return NextResponse.json({ error: "Нет данных для обновления" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

    const updateData: { username?: string; password?: string } = {};

    if (nextUsername && nextUsername !== user.username) {
      if (nextUsername.length < 3) {
        return NextResponse.json({ error: "Логин должен быть минимум 3 символа" }, { status: 400 });
      }

      const existing = await prisma.user.findUnique({ where: { username: nextUsername } });
      if (existing && existing.id !== user.id) {
        return NextResponse.json({ error: "Такой логин уже занят" }, { status: 400 });
      }
      updateData.username = nextUsername;
    }

    if (wantsPasswordChange) {
      if (!body.currentPassword) {
        return NextResponse.json({ error: "Введите текущий пароль" }, { status: 400 });
      }
      if (!body.newPassword || body.newPassword.length < 6) {
        return NextResponse.json({ error: "Новый пароль должен быть минимум 6 символов" }, { status: 400 });
      }
      const ok = bcrypt.compareSync(body.currentPassword, user.password);
      if (!ok) {
        return NextResponse.json({ error: "Текущий пароль неверный" }, { status: 400 });
      }
      updateData.password = hashPassword(body.newPassword);
    }

    if (!updateData.username && !updateData.password) {
      return NextResponse.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          isSystemOwner: user.isSystemOwner,
        },
      });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
      select: {
        id: true,
        username: true,
        role: true,
        isSystemOwner: true,
      },
    });

    return NextResponse.json({ success: true, user: updated });
  } catch (error) {
    console.error("ACCOUNT PATCH ERROR:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
