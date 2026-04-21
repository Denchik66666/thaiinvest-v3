import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { hashPassword, verifyToken } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { getNextMonday, getPreviousOrCurrentMonday, countFullWeeksBetween } from "@/lib/weekly";
import { recalculateInvestorAccruedFromRateHistory } from "@/lib/business-rate-accrual-recalc";

type InvestorTxClient = Pick<PrismaClient, "bodyTopUpRequest" | "payment" | "accrual" | "investor" | "user">;

function randomPassword(length = 10): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
}

function buildArchivedUsername(investorId: number) {
  return `archived_inv_${investorId}_${Date.now()}`;
}

// Схема валидации для редактирования инвестора
const UpdateInvestorSchema = z.object({
  name: z.string().min(1, "Имя обязательно").optional(),
  handle: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  body: z.number().min(0, "Тело не может быть отрицательным").optional(),
  rate: z.number().min(0, "Ставка не может быть отрицательной").optional(),
  entryDate: z.string().datetime("Неверный формат даты").optional(),
  activationDate: z.string().datetime("Неверный формат даты").optional(),
});

// Функция расчета процентов (как в создании)
function calculateAccrued(body: number, rate: number, weeks: number): number {
  const weeklyRate = (rate / 100) / 4     // упрощенно: месячная ÷ 4
  return body * weeklyRate * weeks
}

async function generateUniqueInvestorUsername(baseName: string) {
  const slug = (baseName || "investor")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 8) || "investor";

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = `${Math.floor(1000 + Math.random() * 9000)}`;
    const username = `inv_${slug}_${suffix}`;
    const exists = await prisma.user.findUnique({ where: { username } });
    if (!exists) return username;
  }
  return `inv_${Date.now()}`;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });

    const { id } = await context.params;
    const investorId = Number(id);
    if (!Number.isFinite(investorId)) {
      return NextResponse.json({ error: "Некорректный ID инвестора" }, { status: 400 });
    }

    const investor = await prisma.investor.findUnique({
      where: { id: investorId },
      include: {
        owner: { select: { id: true, username: true, role: true } },
        investorUser: { select: { id: true, username: true } },
        payments: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!investor) return NextResponse.json({ error: "Инвестор не найден" }, { status: 404 });

    if (decoded.role === "OWNER") {
      if (investor.ownerId !== decoded.userId || investor.isPrivate) {
        return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
      }
    }
    if (decoded.role === "INVESTOR" && investor.investorUserId !== decoded.userId && investor.linkedUserId !== decoded.userId) {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const topUpRequests = await prisma.bodyTopUpRequest.findMany({
      where: { investorId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        amount: true,
        status: true,
        comment: true,
        createdAt: true,
        decidedAt: true,
      },
    });

    const actions = await prisma.auditLog.findMany({
      where: {
        entityType: "Investor",
        entityId: investorId,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        user: {
          select: { username: true, role: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      investor,
      topUpRequests,
      actions: actions.map((a) => ({
        id: a.id,
        action: a.action,
        oldValue: a.oldValue,
        newValue: a.newValue,
        createdAt: a.createdAt,
        user: a.user,
      })),
    });
  } catch (error) {
    console.error("GET INVESTOR DETAIL ERROR:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });

    const { id } = await context.params;
    const investorId = Number(id);
    if (!Number.isFinite(investorId)) {
      return NextResponse.json({ error: "Некорректный ID инвестора" }, { status: 400 });
    }

    const investor = await prisma.investor.findUnique({ where: { id: investorId } });
    if (!investor) return NextResponse.json({ error: "Инвестор не найден" }, { status: 404 });
    if (investor.isSystemOwner) {
      return NextResponse.json({ error: "Системного инвестора удалять нельзя" }, { status: 400 });
    }

    if (decoded.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Только SUPER_ADMIN может удалять инвесторов" }, { status: 403 });
    }

    await prisma.$transaction(async (tx: InvestorTxClient) => {
      await tx.bodyTopUpRequest.deleteMany({ where: { investorId } });
      await tx.payment.deleteMany({ where: { investorId } });
      await tx.accrual.deleteMany({ where: { investorId } });
      await tx.investor.delete({ where: { id: investorId } });
      if (investor.investorUserId) {
        await tx.user.update({
          where: { id: investor.investorUserId },
          data: {
            username: buildArchivedUsername(investorId),
            password: hashPassword(randomPassword(32)),
            isArchived: true,
            archivedAt: new Date(),
          },
        });
      }
    });

    await logAction({
      userId: decoded.userId,
      action: "DELETE_INVESTOR",
      entityType: "Investor",
      entityId: investorId,
      oldValue: JSON.stringify(investor),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE INVESTOR ERROR:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });
    if (decoded.role !== "OWNER" && decoded.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const { id } = await context.params;
    const investorId = Number(id);
    if (!Number.isFinite(investorId)) {
      return NextResponse.json({ error: "Некорректный ID инвестора" }, { status: 400 });
    }

    const investor = await prisma.investor.findUnique({
      where: { id: investorId },
      include: { investorUser: true },
    });
    if (!investor) return NextResponse.json({ error: "Инвестор не найден" }, { status: 404 });
    if (decoded.role === "OWNER" && investor.ownerId !== decoded.userId) {
      return NextResponse.json({ error: "Недостаточно прав для этого инвестора" }, { status: 403 });
    }

    const nextPassword = randomPassword(10);

    if (investor.investorUserId && investor.investorUser) {
      await prisma.user.update({
        where: { id: investor.investorUserId },
        data: { password: hashPassword(nextPassword) },
      });

      await logAction({
        userId: decoded.userId,
        action: "RESET_INVESTOR_CREDENTIALS",
        entityType: "Investor",
        entityId: investorId,
        newValue: JSON.stringify({ investorUserId: investor.investorUserId }),
      });

      return NextResponse.json({
        success: true,
        credentials: {
          username: investor.investorUser.username,
          password: nextPassword,
        },
      });
    }

    const username = await generateUniqueInvestorUsername(investor.name);

    await prisma.$transaction(async (tx: InvestorTxClient) => {
      const investorUser = await tx.user.create({
        data: {
          username,
          password: hashPassword(nextPassword),
          role: "INVESTOR",
          isSystemOwner: false,
        },
      });
      await tx.investor.update({
        where: { id: investorId },
        data: { investorUserId: investorUser.id },
      });
    });

    await logAction({
      userId: decoded.userId,
      action: "ISSUE_INVESTOR_CREDENTIALS",
      entityType: "Investor",
      entityId: investorId,
      newValue: JSON.stringify({ username }),
    });

    return NextResponse.json({
      success: true,
      credentials: {
        username,
        password: nextPassword,
      },
    });
  } catch (error) {
    console.error("PATCH INVESTOR CREDENTIALS ERROR:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });
    if (decoded.role !== "OWNER" && decoded.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const { id } = await context.params;
    const investorId = Number(id);
    if (!Number.isFinite(investorId)) {
      return NextResponse.json({ error: "Некорректный ID инвестора" }, { status: 400 });
    }

    // Валидация входных данных
    const bodyResult = UpdateInvestorSchema.safeParse(await request.json());
    if (!bodyResult.success) {
      return NextResponse.json({ error: bodyResult.error.issues[0]?.message ?? 'Некорректные данные' }, { status: 400 });
    }

    const updateData = bodyResult.data;

    // Получаем текущего инвестора
    const investor = await prisma.investor.findUnique({
      where: { id: investorId },
    });
    if (!investor) return NextResponse.json({ error: "Инвестор не найден" }, { status: 404 });
    
    // Проверка прав доступа
    if (decoded.role === "OWNER" && investor.ownerId !== decoded.userId) {
      return NextResponse.json({ error: "Недостаточно прав для этого инвестора" }, { status: 403 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Подготовка данных для обновления
    let finalUpdateData: any = {};
    let shouldRecalculateAccrued = false;

    // Обработка полей
    if (updateData.name !== undefined) finalUpdateData.name = updateData.name;
    if (updateData.handle !== undefined) finalUpdateData.handle = updateData.handle;
    if (updateData.phone !== undefined) finalUpdateData.phone = updateData.phone;
    if (updateData.body !== undefined) {
      finalUpdateData.body = updateData.body;
      shouldRecalculateAccrued = true;
    }
    if (updateData.rate !== undefined) {
      finalUpdateData.rate = updateData.rate;
      shouldRecalculateAccrued = true;
    }

    // Обработка дат
    if (updateData.entryDate !== undefined) {
      const entryDate = new Date(updateData.entryDate);
      const activationDate = getNextMonday(entryDate);
      const status = activationDate <= today ? 'active' : 'awaiting_activation';
      
      finalUpdateData.entryDate = entryDate;
      finalUpdateData.activationDate = activationDate;
      finalUpdateData.status = status;
      shouldRecalculateAccrued = true;
    }

    if (updateData.activationDate !== undefined) {
      const activationDate = new Date(updateData.activationDate);
      const status = activationDate <= today ? 'active' : 'awaiting_activation';
      
      finalUpdateData.activationDate = activationDate;
      finalUpdateData.status = status;
      shouldRecalculateAccrued = true;
    }

    // Сохраняем старые значения для аудита
    const oldValues = {
      name: investor.name,
      body: investor.body,
      rate: investor.rate,
      entryDate: investor.entryDate,
      activationDate: investor.activationDate,
      status: investor.status,
    };

    // Обновляем инвестора
    const updatedInvestor = await prisma.$transaction(async (tx: InvestorTxClient) => {
      const updated = await tx.investor.update({
        where: { id: investorId },
        data: finalUpdateData,
      });

      // Если нужно пересчитать начисленные проценты
      if (shouldRecalculateAccrued && updated.status === 'active') {
        const currentWeekMonday = getPreviousOrCurrentMonday(today);
        const weeks = countFullWeeksBetween(updated.activationDate, currentWeekMonday);
        
        if (weeks > 0) {
          const newAccrued = calculateAccrued(updated.body, updated.rate, weeks);
          await tx.investor.update({
            where: { id: investorId },
            data: { accrued: newAccrued },
          });
          updated.accrued = newAccrued;
        }
      }

      return updated;
    });

    // Логирование изменений
    await logAction({
      userId: decoded.userId,
      action: "UPDATE_INVESTOR",
      entityType: "Investor",
      entityId: investorId,
      oldValue: JSON.stringify(oldValues),
      newValue: JSON.stringify({
        name: updatedInvestor.name,
        body: updatedInvestor.body,
        rate: updatedInvestor.rate,
        entryDate: updatedInvestor.entryDate,
        activationDate: updatedInvestor.activationDate,
        status: updatedInvestor.status,
        accrued: updatedInvestor.accrued,
      }),
    });

    // Запускаем полный пересчет для всех инвесторов (для синхронизации)
    if (shouldRecalculateAccrued) {
      try {
        await recalculateInvestorAccruedFromRateHistory();
      } catch (error) {
        console.error("Ошибка при пересчете всех инвесторов:", error);
        // Не прерываем операцию, так как основной инвестор обновлен
      }
    }

    return NextResponse.json({
      success: true,
      investor: updatedInvestor,
      message: "Данные инвестора успешно обновлены и проценты пересчитаны",
    });

  } catch (error) {
    console.error("PUT INVESTOR UPDATE ERROR:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
