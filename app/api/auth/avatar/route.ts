import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Загрузка аватара временно отключена. Нужна миграция базы данных." },
    { status: 503 }
  );
}
