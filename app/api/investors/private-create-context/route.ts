import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { verifyToken } from "@/lib/auth";
import { getPrivateInvestorCreateContext } from "@/lib/private-investor-create-context";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });

    if (decoded.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const context = await getPrivateInvestorCreateContext(decoded.userId);
    return NextResponse.json({ success: true, context });
  } catch (error) {
    console.error("GET private-create-context:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
