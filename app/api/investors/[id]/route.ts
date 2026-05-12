import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import { findBodyTopUpsForInvestorDetail } from "@/lib/body-topup-request-date-compat";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyToken } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { getNextMonday } from "@/lib/weekly";
import { getCurrentBusinessRateForCalendarYmd, dateToUtcCalendarYmd } from "@/lib/business-rate";
import { isTransientDbError, withDbRetry } from "@/lib/db-retry";
import { scheduleBusinessRateRecalc } from "@/lib/business-rate-recalc-queue";
import { moneyRound2 } from "@/lib/money-round";
import {
  computeInvestorAccruedEndFromLedger,
  computeInvestorPaidCompletedTotal,
  toWeeklyLedgerPayments,
} from "@/lib/investor-accrued-ledger";

type InvestorTxClient = Pick<
  PrismaClient,
  "bodyTopUpRequest" | "payment" | "accrual" | "investor" | "user" | "rateHistory"
>;

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
  /** SUPER_ADMIN: ручная правка «начислено» / «выплачено» при переносе с другой базы */
  accrued: z.number().min(0, "Начислено не может быть отрицательным").optional(),
  paid: z.number().min(0, "Выплачено не может быть отрицательным").optional(),
  entryDate: z.string().datetime("Неверный формат даты").optional(),
  activationDate: z.string().datetime("Неверный формат даты").optional(),
});

/** UI календаря даёт YYYY-MM-DD — приводим к ISO для zod .datetime() */
function normalizeInvestorPutPayload(raw: Record<string, unknown>) {
  for (const key of ["entryDate", "activationDate"] as const) {
    const v = raw[key];
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) {
      raw[key] = `${v.trim()}T12:00:00.000Z`;
    }
  }
  for (const key of ["body", "rate", "accrued", "paid"] as const) {
    const v = raw[key];
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v.replace(/\s/g, "").replace(",", "."));
      if (Number.isFinite(n)) raw[key] = n;
    }
  }
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

    const investor = await withDbRetry(() =>
      prisma.investor.findUnique({
        where: { id: investorId },
        include: {
          owner: { select: { id: true, username: true, role: true } },
          investorUser: { select: { id: true, username: true, avatarUrl: true } },
          linkedUser: { select: { id: true, username: true, avatarUrl: true } },
          payments: { orderBy: { createdAt: "desc" } },
        },
      })
    );
    if (!investor) return NextResponse.json({ error: "Инвестор не найден" }, { status: 404 });

    if (decoded.role === "OWNER") {
      if (investor.ownerId !== decoded.userId || investor.isPrivate) {
        return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
      }
    }
    if (decoded.role === "INVESTOR" && investor.investorUserId !== decoded.userId && investor.linkedUserId !== decoded.userId) {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const topUpRequests = await withDbRetry(() => findBodyTopUpsForInvestorDetail(investorId));

    const actions = await withDbRetry(() =>
      prisma.auditLog.findMany({
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
      })
    );

    const completedPayments = investor.payments.filter((p) => p.status === "completed");
    const lifetimeInterestPaid = moneyRound2(
      completedPayments.filter((p) => p.type === "interest").reduce((s, p) => s + p.amount, 0)
    );
    /** Начислено: `Investor.accrued` из БД; пересчёт — `computeInvestorAccruedEndFromLedger` / `recalculateInvestorAccruedFromRateHistory`. */
    const accruedRounded = moneyRound2(Math.max(investor.accrued, 0));
    const due = accruedRounded;

    return NextResponse.json({
      success: true,
      investor: { ...investor, accrued: accruedRounded, due, lifetimeInterestPaid },
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
    if (isTransientDbError(error)) {
      return NextResponse.json({ error: "Временная ошибка БД, повторите запрос" }, { status: 503 });
    }
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

    const investor = await withDbRetry(() => prisma.investor.findUnique({ where: { id: investorId } }));
    if (!investor) return NextResponse.json({ error: "Инвестор не найден" }, { status: 404 });
    if (investor.isSystemOwner) {
      return NextResponse.json({ error: "Системного инвестора удалять нельзя" }, { status: 400 });
    }

    if (decoded.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Только SUPER_ADMIN может удалять инвесторов" }, { status: 403 });
    }

    await withDbRetry(() => prisma.$transaction(async (tx: InvestorTxClient) => {
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
    }));

    try {
      await withDbRetry(() =>
        logAction({
          userId: decoded.userId,
          action: "DELETE_INVESTOR",
          entityType: "Investor",
          entityId: investorId,
          oldValue: JSON.stringify(investor),
        })
      );
    } catch (auditError) {
      console.error("DELETE INVESTOR AUDIT ERROR:", auditError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE INVESTOR ERROR:", error);
    if (isTransientDbError(error)) {
      return NextResponse.json({ error: "Временная ошибка БД, повторите операцию" }, { status: 503 });
    }
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

    const investor = await withDbRetry(() =>
      prisma.investor.findUnique({
        where: { id: investorId },
        include: { investorUser: true },
      })
    );
    if (!investor) return NextResponse.json({ error: "Инвестор не найден" }, { status: 404 });
    if (decoded.role === "OWNER" && investor.ownerId !== decoded.userId) {
      return NextResponse.json({ error: "Недостаточно прав для этого инвестора" }, { status: 403 });
    }

    const nextPassword = randomPassword(10);

    const linkedInvestorUser = investor.investorUser;
    if (investor.investorUserId && linkedInvestorUser) {
      const userId = linkedInvestorUser.id;
      await withDbRetry(() =>
        prisma.user.update({
          where: { id: userId },
          data: { password: hashPassword(nextPassword) },
        })
      );

      try {
        await withDbRetry(() =>
          logAction({
            userId: decoded.userId,
            action: "RESET_INVESTOR_CREDENTIALS",
            entityType: "Investor",
            entityId: investorId,
            newValue: JSON.stringify({ investorUserId: investor.investorUserId }),
          })
        );
      } catch (auditError) {
        console.error("RESET INVESTOR CREDENTIALS AUDIT ERROR:", auditError);
      }

      return NextResponse.json({
        success: true,
        credentials: {
          username: linkedInvestorUser.username,
          password: nextPassword,
        },
      });
    }

    const username = await generateUniqueInvestorUsername(investor.name);

    await withDbRetry(() => prisma.$transaction(async (tx: InvestorTxClient) => {
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
    }));

    try {
      await withDbRetry(() =>
        logAction({
          userId: decoded.userId,
          action: "ISSUE_INVESTOR_CREDENTIALS",
          entityType: "Investor",
          entityId: investorId,
          newValue: JSON.stringify({ username }),
        })
      );
    } catch (auditError) {
      console.error("ISSUE INVESTOR CREDENTIALS AUDIT ERROR:", auditError);
    }

    return NextResponse.json({
      success: true,
      credentials: {
        username,
        password: nextPassword,
      },
    });
  } catch (error) {
    console.error("PATCH INVESTOR CREDENTIALS ERROR:", error);
    if (isTransientDbError(error)) {
      return NextResponse.json({ error: "Временная ошибка БД, повторите операцию" }, { status: 503 });
    }
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

    const rawJson = await request.json().catch(() => null);
    if (!rawJson || typeof rawJson !== "object") {
      return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
    }
    const rawPayload = rawJson as Record<string, unknown>;
    normalizeInvestorPutPayload(rawPayload);

    const bodyResult = UpdateInvestorSchema.safeParse(rawPayload);
    if (!bodyResult.success) {
      return NextResponse.json({ error: bodyResult.error.issues[0]?.message ?? "Некорректные данные" }, { status: 400 });
    }

    const updateData = bodyResult.data;

    if (
      (updateData.accrued !== undefined || updateData.paid !== undefined) &&
      decoded.role !== "SUPER_ADMIN"
    ) {
      return NextResponse.json(
        { error: "Только SUPER_ADMIN может править поля «начислено» и «выплачено»" },
        { status: 403 }
      );
    }

    // Получаем текущего инвестора
    const investor = await withDbRetry(() =>
      prisma.investor.findUnique({
        where: { id: investorId },
      })
    );
    if (!investor) return NextResponse.json({ error: "Инвестор не найден" }, { status: 404 });
    
    // Проверка прав доступа
    if (decoded.role === "OWNER" && investor.ownerId !== decoded.userId) {
      return NextResponse.json({ error: "Недостаточно прав для этого инвестора" }, { status: 403 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Подготовка данных для обновления
    const finalUpdateData: Record<string, unknown> = {};
    let shouldRecalculateAccrued = false;
    const manualAccruedOverride = decoded.role === "SUPER_ADMIN" && updateData.accrued !== undefined;

    // Обработка полей
    if (updateData.name !== undefined) finalUpdateData.name = updateData.name;
    if (updateData.handle !== undefined) finalUpdateData.handle = updateData.handle;
    if (updateData.phone !== undefined) finalUpdateData.phone = updateData.phone;
    if (updateData.body !== undefined) {
      finalUpdateData.body = moneyRound2(updateData.body);
      shouldRecalculateAccrued = true;
    }
    if (updateData.rate !== undefined) {
      finalUpdateData.rate = updateData.rate;
      shouldRecalculateAccrued = true;
    }
    if (updateData.accrued !== undefined) {
      finalUpdateData.accrued = moneyRound2(updateData.accrued);
    }
    if (updateData.paid !== undefined) {
      finalUpdateData.paid = moneyRound2(updateData.paid);
    }

    // Даты: SUPER_ADMIN может править «дату входа» без автоподстановки активации (перенос с прошлыми датами).
    if (updateData.entryDate !== undefined) {
      const entryDate = new Date(updateData.entryDate);
      finalUpdateData.entryDate = entryDate;
      shouldRecalculateAccrued = true;
      if (decoded.role !== "SUPER_ADMIN") {
        const activationDate = getNextMonday(entryDate);
        finalUpdateData.activationDate = activationDate;
        finalUpdateData.status = activationDate <= today ? "active" : "awaiting_activation";
      }
    }

    if (updateData.activationDate !== undefined) {
      const activationDate = new Date(updateData.activationDate);
      finalUpdateData.activationDate = activationDate;
      finalUpdateData.status = activationDate <= today ? "active" : "awaiting_activation";
      shouldRecalculateAccrued = true;
    }

    if (!investor.isPrivate) {
      const resolvedEntry =
        finalUpdateData.entryDate !== undefined
          ? new Date(finalUpdateData.entryDate as Date | string)
          : new Date(investor.entryDate);
      const snap = await getCurrentBusinessRateForCalendarYmd(dateToUtcCalendarYmd(resolvedEntry));
      if (!snap) {
        const d = resolvedEntry.toLocaleDateString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });
        return NextResponse.json(
          {
            error: `На дату входа ${d} нет действующей бизнес-ставки. Задайте её в «Управлении» (владелец) или смените дату входа.`,
          },
          { status: 400 }
        );
      }
      const nextRate = snap.rate;
      if (
        Math.abs(moneyRound2(investor.rate) - moneyRound2(nextRate)) > 0.005 ||
        updateData.entryDate !== undefined ||
        updateData.body !== undefined
      ) {
        shouldRecalculateAccrued = true;
      }
      finalUpdateData.rate = moneyRound2(nextRate);
    }

    if (Object.keys(finalUpdateData).length === 0) {
      return NextResponse.json({ error: "Нет полей для обновления" }, { status: 400 });
    }

    // Сохраняем старые значения для аудита
    const oldValues = {
      name: investor.name,
      body: investor.body,
      rate: investor.rate,
      accrued: investor.accrued,
      paid: investor.paid,
      entryDate: investor.entryDate,
      activationDate: investor.activationDate,
      status: investor.status,
    };

    // Обновляем инвестора
    const updatedInvestor = await withDbRetry(() => prisma.$transaction(async (tx: InvestorTxClient) => {
      const updated = await tx.investor.update({
        where: { id: investorId },
        data: finalUpdateData,
      });

      // Пересчёт accrued/paid только через леджер (см. `lib/investor-accrued-ledger.ts`)
      if (shouldRecalculateAccrued && updated.status === "active" && !manualAccruedOverride) {
        const [invFull, topRows, rateHistory] = await Promise.all([
          tx.investor.findUnique({
            where: { id: investorId },
            include: {
              payments: {
                where: { status: "completed" },
                orderBy: { createdAt: "asc" },
              },
            },
          }),
          tx.bodyTopUpRequest.findMany({
            where: { investorId },
            select: {
              amount: true,
              status: true,
              requestDate: true,
              decidedAt: true,
              createdAt: true,
            },
          }),
          tx.rateHistory.findMany({
            orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }],
            select: { effectiveDate: true, newRate: true },
          }),
        ]);

        if (invFull) {
          const newAccrued = computeInvestorAccruedEndFromLedger({
            activationDate: invFull.activationDate,
            body: invFull.body,
            rate: invFull.rate,
            isPrivate: invFull.isPrivate,
            payments: toWeeklyLedgerPayments(invFull.payments),
            bodyTopUpRows: topRows,
            rateHistory,
            now: new Date(),
          });
          const newPaid = computeInvestorPaidCompletedTotal(invFull.payments);
          await tx.investor.update({
            where: { id: investorId },
            data: { accrued: moneyRound2(newAccrued), paid: newPaid },
          });
          updated.accrued = moneyRound2(newAccrued);
          updated.paid = newPaid;
        }
      }

      return updated;
    }));

    // Логирование изменений
    try {
      await withDbRetry(() =>
        logAction({
          userId: decoded.userId,
          action: "UPDATE_INVESTOR",
          entityType: "Investor",
          entityId: investorId,
          oldValue: JSON.stringify(oldValues),
          newValue: JSON.stringify({
            name: updatedInvestor.name,
            body: updatedInvestor.body,
            rate: updatedInvestor.rate,
            accrued: updatedInvestor.accrued,
            paid: updatedInvestor.paid,
            entryDate: updatedInvestor.entryDate,
            activationDate: updatedInvestor.activationDate,
            status: updatedInvestor.status,
          }),
        })
      );
    } catch (auditError) {
      console.error("UPDATE INVESTOR AUDIT ERROR:", auditError);
    }

    // Запускаем полный пересчёт в фоне при изменении расчётных полей или ручных остатках.
    if (shouldRecalculateAccrued || updateData.accrued !== undefined || updateData.paid !== undefined) {
      scheduleBusinessRateRecalc();
    }

    return NextResponse.json({
      success: true,
      investor: updatedInvestor,
      message: "Данные инвестора успешно обновлены и проценты пересчитаны",
    });

  } catch (error) {
    console.error("PUT INVESTOR UPDATE ERROR:", error);
    if (isTransientDbError(error)) {
      return NextResponse.json({ error: "Временная ошибка БД, повторите операцию" }, { status: 503 });
    }
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
