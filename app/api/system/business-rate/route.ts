import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { getCurrentBusinessRate, upsertBusinessRate } from "@/lib/business-rate";
import { recalculateInvestorAccruedFromRateHistory } from "@/lib/business-rate-accrual-recalc";

function parseDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });

    const current = await getCurrentBusinessRate(new Date());
    return NextResponse.json({ success: true, current });
  } catch (error) {
    console.error("GET BUSINESS RATE ERROR:", error);
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

    if (decoded.role !== "OWNER" && decoded.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const body = (await request.json()) as { newRate?: number; effectiveDate?: string; comment?: string };
    if (typeof body.newRate !== "number" || body.newRate <= 0) {
      return NextResponse.json({ error: "newRate должен быть числом > 0" }, { status: 400 });
    }
    if (body.comment !== undefined && typeof body.comment !== "string") {
      return NextResponse.json({ error: "comment должен быть строкой" }, { status: 400 });
    }

    const parsedEffectiveDate = parseDate(body.effectiveDate);
    if (parsedEffectiveDate === null) {
      return NextResponse.json({ error: "Некорректный effectiveDate" }, { status: 400 });
    }

    const rate = await upsertBusinessRate({
      changedBy: decoded.userId,
      newRate: body.newRate,
      effectiveDate: parsedEffectiveDate,
      comment: body.comment,
    });

    await recalculateInvestorAccruedFromRateHistory();

    return NextResponse.json({ success: true, rate });
  } catch (error) {
    console.error("POST BUSINESS RATE ERROR:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
