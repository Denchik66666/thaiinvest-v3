import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateAuthMeServerCache } from "@/lib/auth-me-server-cache";
import { withDbRetry } from "@/lib/db-retry";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png"]);

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  if (!token) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return NextResponse.json({ error: "Неверный токен" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Ожидается multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Нет файла" }, { status: 400 });
  }

  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: "Допустимы только JPG и PNG" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Файл больше 2 МБ" }, { status: 400 });
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!blobToken) {
    return NextResponse.json(
      {
        error:
          "Не задан BLOB_READ_WRITE_TOKEN (Vercel Blob read/write token). Добавьте переменную в .env.local / Vercel и подключите Blob store к проекту.",
      },
      { status: 503 }
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const ext = file.type === "image/png" ? "png" : "jpg";
  const userId = decoded.userId;

  let avatarUrl: string;
  try {
    const blob = await put(`avatars/user-${userId}.${ext}`, buf, {
      access: "public",
      token: blobToken,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    /** Публичный URL файла в Blob; `BLOB_READ_WRITE_TOKEN` — только ключ API, не префикс URL. */
    avatarUrl = `${blob.url}?v=${Date.now()}`;

    await withDbRetry(() =>
      prisma.user.update({
        where: { id: userId },
        data: { avatarUrl },
      })
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[avatar] blob upload failed", { userId, msg });
    return NextResponse.json(
      {
        error:
          "Не удалось сохранить аватар в Vercel Blob. Проверьте BLOB_READ_WRITE_TOKEN и привязку Blob store к проекту.",
      },
      { status: 502 }
    );
  }

  invalidateAuthMeServerCache(userId);

  return NextResponse.json({ success: true, avatarUrl });
}
