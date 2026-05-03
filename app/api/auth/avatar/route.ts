import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { verifyToken } from "@/lib/auth";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  if (!token) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return NextResponse.json({ error: "Неверный токен" }, { status: 401 });
  }

  return NextResponse.json(
    { error: "Загрузка аватара временно отключена. Нужна миграция базы данных." },
    { status: 503 }
  );
}
