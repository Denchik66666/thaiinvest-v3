import { NextRequest, NextResponse } from "next/server";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { getNextMonday } from "@/lib/weekly";

type PaymentType = "interest" | "body" | "close";
type PaymentAction =
  | "request"
  | "owner_approve"
  | "owner_reject"
  | "investor_accept"
  | "investor_dispute"
  | "force_approve"
  | "force_reject";
type PaymentTxClient = Pick<PrismaClient, "investor" | "payment">;

type PaymentRequestBody =
  | {
      action: "request";
      investorId: number;
      type: PaymentType;
      amount?: number;
      comment?: string;
      requestDate?: string;
    }
  | {
      action:
        | "owner_approve"
        | "owner_reject"
        | "investor_accept"
        | "investor_dispute"
        | "force_approve"
        | "force_reject";
      paymentId: number;
      comment?: string;
    };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPaymentType(value: unknown): value is PaymentType {
  return value === "interest" || value === "body" || value === "close";
}

function isPaymentAction(value: unknown): value is PaymentAction {
  return (
    value === "request" ||
    value === "owner_approve" ||
    value === "owner_reject" ||
    value === "investor_accept" ||
    value === "investor_dispute" ||
    value === "force_approve" ||
    value === "force_reject"
  );
}

function parsePaymentBody(raw: unknown): PaymentRequestBody | null {
  if (!isObject(raw) || !isPaymentAction(raw.action)) {
    return null;
  }

  if (raw.action === "request") {
    if (typeof raw.investorId !== "number" || !isPaymentType(raw.type)) {
      return null;
    }
    if (raw.amount !== undefined && typeof raw.amount !== "number") {
      return null;
    }
    if (raw.comment !== undefined && typeof raw.comment !== "string") {
      return null;
    }
    if (raw.requestDate !== undefined && typeof raw.requestDate !== "string") {
      return null;
    }

    return {
      action: "request",
      investorId: raw.investorId,
      type: raw.type,
      amount: raw.amount,
      comment: raw.comment,
      requestDate: raw.requestDate,
    };
  }

  if (typeof raw.paymentId !== "number") return null;
  if (raw.comment !== undefined && typeof raw.comment !== "string") return null;

  return {
    action: raw.action,
    paymentId: raw.paymentId,
    comment: raw.comment,
  };
}

function mergeComment(existing: string | null, extra?: string) {
  if (!extra) return existing ?? null;
  if (!existing) return extra;
  return `${existing}\n${extra}`;
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });

    const parsed = parsePaymentBody(await request.json());
    if (!parsed) {
      return NextResponse.json({ error: "Некорректные данные запроса" }, { status: 400 });
    }

    if (parsed.action === "request") {
      const investor = await prisma.investor.findUnique({
        where: { id: parsed.investorId },
      });
      if (!investor) return NextResponse.json({ error: "Инвестор не найден" }, { status: 404 });

      // Request can be created only by investor side:
      // - SUPER_ADMIN for linked common investor
      // - owner of private investor in personal network
      const canRequestAsInvestor =
        (decoded.role === "SUPER_ADMIN" && investor.linkedUserId === decoded.userId && !investor.isPrivate) ||
        (decoded.role === "SUPER_ADMIN" && investor.ownerId === decoded.userId && investor.isPrivate) ||
        (decoded.role === "INVESTOR" && investor.investorUserId === decoded.userId);
      if (!canRequestAsInvestor) {
        return NextResponse.json({ error: "Недостаточно прав для запроса вывода" }, { status: 403 });
      }

      const pending = await prisma.payment.findMany({
        where: {
          investorId: parsed.investorId,
          status: { in: ["requested", "approved_waiting_accept"] },
        },
      });

      const pendingInterest = pending.filter((p) => p.type === "interest").reduce((sum, p) => sum + p.amount, 0);
      const pendingBody = pending.filter((p) => p.type === "body").reduce((sum, p) => sum + p.amount, 0);
      const hasPendingClose = pending.some((p) => p.type === "close");

      if (hasPendingClose) {
        return NextResponse.json(
          { error: "У инвестора уже есть заявка на полное закрытие в ожидании" },
          { status: 400 }
        );
      }

      let amount = parsed.amount ?? 0;
      if (parsed.type === "close") {
        if (pending.length > 0) {
          return NextResponse.json(
            { error: "Перед заявкой на закрытие завершите/отклоните другие заявки" },
            { status: 400 }
          );
        }
        amount = investor.accrued + investor.body;
      }

      if (parsed.type !== "close" && amount <= 0) {
        return NextResponse.json({ error: "Сумма должна быть больше 0" }, { status: 400 });
      }

      if (parsed.type === "interest") {
        const available = Math.max(investor.accrued - pendingInterest, 0);
        if (amount > available) {
          return NextResponse.json({ error: `Сумма превышает доступные проценты (${available})` }, { status: 400 });
        }
      }

      if (parsed.type === "body") {
        const available = Math.max(investor.body - pendingBody, 0);
        if (amount > available) {
          return NextResponse.json({ error: `Сумма превышает доступное тело (${available})` }, { status: 400 });
        }
      }

      const payment = await prisma.payment.create({
        data: {
          investorId: parsed.investorId,
          type: parsed.type,
          amount,
          status: "requested",
          comment: parsed.comment ?? null,
          createdAt: parsed.requestDate ? new Date(parsed.requestDate) : undefined,
        },
      });

      await logAction({
        userId: decoded.userId,
        action: "PAYMENT_REQUEST",
        entityType: "Payment",
        entityId: payment.id,
        newValue: JSON.stringify(payment),
      });

      return NextResponse.json({ success: true, payment });
    }

    const payment = await prisma.payment.findUnique({
      where: { id: parsed.paymentId },
      include: { investor: true },
    });
    if (!payment) return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });

    const isManager = decoded.role === "OWNER" || decoded.role === "SUPER_ADMIN";
    const isSuperAdmin = decoded.role === "SUPER_ADMIN";

    if (parsed.action === "owner_approve" || parsed.action === "owner_reject") {
      if (!isManager) return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
      if (decoded.role === "OWNER" && payment.investor.ownerId !== decoded.userId) {
        return NextResponse.json({ error: "OWNER не может обрабатывать чужого инвестора" }, { status: 403 });
      }
      if (payment.status !== "requested") {
        return NextResponse.json({ error: "Заявка уже обработана" }, { status: 400 });
      }

      const nextStatus = parsed.action === "owner_approve" ? "approved_waiting_accept" : "rejected";
      const updated = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: nextStatus,
          approvedAt: parsed.action === "owner_approve" ? new Date() : null,
          comment: mergeComment(payment.comment, parsed.comment),
        },
      });

      await logAction({
        userId: decoded.userId,
        action: parsed.action === "owner_approve" ? "PAYMENT_APPROVE" : "PAYMENT_REJECT",
        entityType: "Payment",
        entityId: payment.id,
        newValue: JSON.stringify(updated),
      });
      return NextResponse.json({ success: true, payment: updated });
    }

    if (parsed.action === "investor_dispute") {
      const canDispute =
        (payment.investor.linkedUserId === decoded.userId && !payment.investor.isPrivate) ||
        (payment.investor.ownerId === decoded.userId && payment.investor.isPrivate) ||
        payment.investor.investorUserId === decoded.userId;
      if (!canDispute) {
        return NextResponse.json({ error: "Недостаточно прав для этого действия" }, { status: 403 });
      }
      if (payment.status !== "approved_waiting_accept") {
        return NextResponse.json({ error: "Заявка не в статусе ожидания подтверждения" }, { status: 400 });
      }

      const updated = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "disputed",
          comment: mergeComment(payment.comment, parsed.comment ?? "Инвестор не согласен"),
        },
      });

      await logAction({
        userId: decoded.userId,
        action: "PAYMENT_DISPUTE",
        entityType: "Payment",
        entityId: payment.id,
        newValue: JSON.stringify(updated),
      });
      return NextResponse.json({ success: true, payment: updated });
    }

    const approvedAt = payment.approvedAt;
    const deadline = approvedAt ? getNextMonday(approvedAt) : null;
    const now = new Date();
    const isExpired =
      payment.status === "approved_waiting_accept" && deadline ? now.getTime() >= deadline.getTime() : false;

    if (parsed.action === "investor_accept") {
      const canAccept =
        (payment.investor.linkedUserId === decoded.userId && !payment.investor.isPrivate) ||
        (payment.investor.ownerId === decoded.userId && payment.investor.isPrivate) ||
        payment.investor.investorUserId === decoded.userId;
      if (!canAccept) {
        return NextResponse.json({ error: "Недостаточно прав для подтверждения выплаты" }, { status: 403 });
      }
      if (payment.status !== "approved_waiting_accept") {
        return NextResponse.json({ error: "Заявка не в статусе ожидания подтверждения" }, { status: 400 });
      }
      if (isExpired) {
        await prisma.payment.update({ where: { id: payment.id }, data: { status: "expired" } });
        return NextResponse.json(
          { error: "Срок подтверждения истек. Требуется принудительное решение SUPER_ADMIN." },
          { status: 400 }
        );
      }

      const updated = await prisma.$transaction(async (tx: PaymentTxClient) => {
        const freshInvestor = await tx.investor.findUnique({ where: { id: payment.investorId } });
        if (!freshInvestor) throw new Error("INVESTOR_NOT_FOUND");

        if (payment.type === "interest") {
          if (payment.amount > freshInvestor.accrued) throw new Error("INSUFFICIENT_ACCRUED");
          await tx.investor.update({
            where: { id: freshInvestor.id },
            data: { accrued: freshInvestor.accrued - payment.amount },
          });
        } else if (payment.type === "body") {
          if (payment.amount > freshInvestor.body) throw new Error("INSUFFICIENT_BODY");
          const newBody = freshInvestor.body - payment.amount;
          await tx.investor.update({
            where: { id: freshInvestor.id },
            data: {
              body: newBody,
              status: newBody === 0 ? "closed" : freshInvestor.status,
            },
          });
        } else if (payment.type === "close") {
          await tx.investor.update({
            where: { id: freshInvestor.id },
            data: { accrued: 0, body: 0, status: "closed" },
          });
        }

        return tx.payment.update({
          where: { id: payment.id },
          data: {
            status: "completed",
            acceptedAt: new Date(),
            comment: mergeComment(payment.comment, parsed.comment),
          },
        });
      });

      await logAction({
        userId: decoded.userId,
        action: "PAYMENT_ACCEPT",
        entityType: "Payment",
        entityId: payment.id,
        newValue: JSON.stringify(updated),
      });
      return NextResponse.json({ success: true, payment: updated });
    }

    if (parsed.action === "force_approve" || parsed.action === "force_reject") {
      if (!isSuperAdmin) {
        return NextResponse.json({ error: "Только SUPER_ADMIN может принудительно завершать заявки" }, { status: 403 });
      }
      if (!["approved_waiting_accept", "requested", "expired", "disputed"].includes(payment.status)) {
        return NextResponse.json({ error: "Заявка уже финализирована" }, { status: 400 });
      }

      if (parsed.action === "force_reject") {
        const updated = await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: "rejected",
            comment: mergeComment(payment.comment, parsed.comment ?? "Force reject by SUPER_ADMIN"),
          },
        });
        await logAction({
          userId: decoded.userId,
          action: "PAYMENT_FORCE_REJECT",
          entityType: "Payment",
          entityId: payment.id,
          newValue: JSON.stringify(updated),
        });
        return NextResponse.json({ success: true, payment: updated });
      }

      const updated = await prisma.$transaction(async (tx: PaymentTxClient) => {
        const freshInvestor = await tx.investor.findUnique({ where: { id: payment.investorId } });
        if (!freshInvestor) throw new Error("INVESTOR_NOT_FOUND");

        if (payment.type === "interest") {
          if (payment.amount > freshInvestor.accrued) throw new Error("INSUFFICIENT_ACCRUED");
          await tx.investor.update({
            where: { id: freshInvestor.id },
            data: { accrued: freshInvestor.accrued - payment.amount },
          });
        } else if (payment.type === "body") {
          if (payment.amount > freshInvestor.body) throw new Error("INSUFFICIENT_BODY");
          const newBody = freshInvestor.body - payment.amount;
          await tx.investor.update({
            where: { id: freshInvestor.id },
            data: { body: newBody, status: newBody === 0 ? "closed" : freshInvestor.status },
          });
        } else if (payment.type === "close") {
          await tx.investor.update({
            where: { id: freshInvestor.id },
            data: { accrued: 0, body: 0, status: "closed" },
          });
        }

        return tx.payment.update({
          where: { id: payment.id },
          data: {
            status: "completed",
            acceptedAt: new Date(),
            comment: mergeComment(payment.comment, parsed.comment ?? "Force approve by SUPER_ADMIN"),
          },
        });
      });

      await logAction({
        userId: decoded.userId,
        action: "PAYMENT_FORCE_APPROVE",
        entityType: "Payment",
        entityId: payment.id,
        newValue: JSON.stringify(updated),
      });
      return NextResponse.json({ success: true, payment: updated });
    }

    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  } catch (err) {
    console.error("PAYMENT API ERROR:", err);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
