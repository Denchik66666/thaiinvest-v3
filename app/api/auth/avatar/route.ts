import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateAuthMeServerCache } from "@/lib/auth-me-server-cache";
import { withDbRetry } from "@/lib/db-retry";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png"]);

function avatarDir() {
  return path.join(process.cwd(), "public", "uploads", "avatars");
}

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

  const buf = Buffer.from(await file.arrayBuffer());
  const ext = file.type === "image/png" ? "png" : "jpg";
  const dir = avatarDir();
  await mkdir(dir, { recursive: true });

  const userId = decoded.userId;
  for (const e of ["jpg", "jpeg", "png"] as const) {
    try {
      await unlink(path.join(dir, `${userId}.${e}`));
    } catch {
      /* ignore */
    }
  }

  const filename = `${userId}.${ext}`;
  const filepath = path.join(dir, filename);
  await writeFile(filepath, buf);

  const avatarUrl = `/uploads/avatars/${filename}?v=${Date.now()}`;

  await withDbRetry(() =>
    prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    })
  );

  invalidateAuthMeServerCache(userId);

  return NextResponse.json({ success: true, avatarUrl });
}
