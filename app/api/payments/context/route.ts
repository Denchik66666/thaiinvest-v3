import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { isTransientDbError, withDbRetry } from "@/lib/db-retry";
import { moneyRound2 } from "@/lib/money-round";

const OPEN_STATUSES = ["requested", "approved_waiting_accept", "expired", "disputed", "pending"] as const;

function actionTimelineMeta(action: string): { kind: string; title: string } {
  const map: Record<string, { kind: string; title: string }> = {
    PAYMENT_REQUEST: { kind: "request", title: "Заявка" },
    PAYMENT_APPROVE: { kind: "owner_decision", title: "Одобрение" },
    PAYMENT_REJECT: { kind: "rejected", title: "Отклонение" },
    PAYMENT_ACCEPT: { kind: "completed", title: "Подтверждение" },
    PAYMENT_DISPUTE: { kind: "disputed", title: "Спор" },
    PAYMENT_FORCE_APPROVE: { kind: "force_completed", title: "Проведение (адм.)" },
    PAYMENT_FORCE_REJECT: { kind: "force_rejected", title: "Отклонение (адм.)" },
    PAYMENT_CORRECTION_PROPOSE: { kind: "correction_propose", title: "Запрос правки (админ.)" },
    PAYMENT_CORRECTION_APPROVE: { kind: "correction_approve", title: "Правка применена" },
    PAYMENT_CORRECTION_REJECT: { kind: "correction_reject", title: "Правка отклонена" },
  };
  return map[action] ?? { kind: "other", title: action };
}

type TimelineRow = {
  at: string;
  kind: string;
  title: string;
  actorUsername: string;
  source: "audit" | "reconstructed";
  /** Сумма из снимка в журнале на этом шаге (если есть в записи). */
  stepAmount: number | null;
};

function parseAmountFromAuditPayload(newValue: string | null): number | null {
  if (!newValue) return null;
  try {
    const j = JSON.parse(newValue) as { amount?: unknown };
    if (typeof j.amount === "number" && Number.isFinite(j.amount)) return moneyRound2(j.amount);
  } catch {
    return null;
  }
  return null;
}

function buildTimelineFromAudits(
  audits: Array<{ createdAt: Date; action: string; newValue: string | null; user: { username: string; role: string } }>
): TimelineRow[] {
  return audits.map((row) => {
    const meta = actionTimelineMeta(row.action);
    return {
      at: row.createdAt.toISOString(),
      kind: meta.kind,
      title: meta.title,
      actorUsername: row.user.username,
      source: "audit" as const,
      stepAmount: parseAmountFromAuditPayload(row.newValue),
    };
  });
}

type PaymentAmountStory = {
  finalRecorded: number;
  originalRequested: number | null;
  ownerApprovedAmount: number | null;
  investorConfirmedAmount: number | null;
  ownerApproverUsername: string | null;
  reconstructed: boolean;
};

function buildAmountStory(
  audits: Array<{ action: string; newValue: string | null; user: { username: string } }>,
  payment: { amount: number; approvedAt: Date | null; acceptedAt: Date | null }
): PaymentAmountStory {
  const finalRecorded = moneyRound2(payment.amount);

  if (!audits.length) {
    return {
      finalRecorded,
      originalRequested: finalRecorded,
      ownerApprovedAmount: payment.approvedAt ? finalRecorded : null,
      investorConfirmedAmount: payment.acceptedAt ? finalRecorded : null,
      ownerApproverUsername: null,
      reconstructed: true,
    };
  }

  let originalRequested: number | null = null;
  let ownerApprovedAmount: number | null = null;
  let investorConfirmedAmount: number | null = null;
  let ownerApproverUsername: string | null = null;

  for (const row of audits) {
    const amt = parseAmountFromAuditPayload(row.newValue);
    if (row.action === "PAYMENT_REQUEST" && amt != null) originalRequested = amt;
    if (row.action === "PAYMENT_APPROVE" && amt != null) {
      ownerApprovedAmount = amt;
      ownerApproverUsername = row.user.username;
    }
    if (
      (row.action === "PAYMENT_ACCEPT" || row.action === "PAYMENT_FORCE_APPROVE") &&
      amt != null
    ) {
      investorConfirmedAmount = amt;
    }
  }

  if (originalRequested == null) originalRequested = finalRecorded;
  if (ownerApprovedAmount == null && payment.approvedAt) ownerApprovedAmount = finalRecorded;
  if (investorConfirmedAmount == null && payment.acceptedAt) investorConfirmedAmount = finalRecorded;

  return {
    finalRecorded,
    originalRequested,
    ownerApprovedAmount,
    investorConfirmedAmount,
    ownerApproverUsername,
    reconstructed: false,
  };
}

function buildTimelineReconstructed(payment: {
  createdAt: Date;
  approvedAt: Date | null;
  acceptedAt: Date | null;
  status: string;
  investor: {
    owner: { username: string };
    investorUser: { username: string } | null;
    linkedUser: { username: string } | null;
  };
}): TimelineRow[] {
  const inv = payment.investor;
  const investorActor = inv.investorUser?.username ?? inv.linkedUser?.username ?? "—";
  const steps: TimelineRow[] = [
    {
      at: payment.createdAt.toISOString(),
      kind: "request",
      title: "Заявка",
      actorUsername: investorActor,
      source: "reconstructed",
      stepAmount: null,
    },
  ];

  if (payment.approvedAt) {
    steps.push({
      at: payment.approvedAt.toISOString(),
      kind: "owner_decision",
      title: "Одобрение",
      actorUsername: inv.owner.username,
      source: "reconstructed",
      stepAmount: null,
    });
  }

  if (payment.acceptedAt) {
    steps.push({
      at: payment.acceptedAt.toISOString(),
      kind: "completed",
      title: "Подтверждение",
      actorUsername: investorActor,
      source: "reconstructed",
      stepAmount: null,
    });
  }

  return steps;
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });

    const paymentIdRaw = request.nextUrl.searchParams.get("paymentId");
    const paymentId = paymentIdRaw ? Number(paymentIdRaw) : NaN;
    if (!Number.isFinite(paymentId) || paymentId <= 0 || !Number.isInteger(paymentId)) {
      return NextResponse.json({ error: "Некорректный paymentId" }, { status: 400 });
    }

    const payment = await withDbRetry(() =>
      prisma.payment.findUnique({
        where: { id: paymentId },
        include: {
          investor: {
            include: {
              owner: { select: { username: true } },
              investorUser: { select: { username: true } },
              linkedUser: { select: { username: true } },
            },
          },
        },
      })
    );
    if (!payment) return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });

    // Доступ: OWNER только к своим, INVESTOR/SA как в /api/payments
    if (decoded.role === "OWNER" && payment.investor.ownerId !== decoded.userId) {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }
    const canSeeAsInvestor =
      (payment.investor.linkedUserId === decoded.userId && !payment.investor.isPrivate) ||
      (payment.investor.ownerId === decoded.userId && payment.investor.isPrivate) ||
      payment.investor.investorUserId === decoded.userId;
    if (decoded.role === "INVESTOR" && !canSeeAsInvestor) {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const pending = await withDbRetry(() =>
      prisma.payment.findMany({
        where: {
          investorId: payment.investorId,
          status: { in: OPEN_STATUSES as any },
        },
        select: { id: true, type: true, amount: true, status: true },
      })
    );

    const other = pending.filter((p) => p.id !== payment.id);
    const pendingInterest = other.filter((p) => p.type === "interest").reduce((s, p) => s + p.amount, 0);
    const pendingBody = other.filter((p) => p.type === "body").reduce((s, p) => s + p.amount, 0);
    const hasPendingClose = other.some((p) => p.type === "close");

    const availableInterest = Math.max(payment.investor.accrued - pendingInterest, 0);
    const availableBody = Math.max(payment.investor.body - pendingBody, 0);

    let availableNow = 0;
    if (payment.type === "interest") availableNow = availableInterest;
    else if (payment.type === "body") availableNow = availableBody;
    else availableNow = payment.investor.accrued + payment.investor.body;

    // Вариант “профессионально”: OWNER может одобрить меньше (<= requested) и не выше доступного.
    const maxApprove = moneyRound2(Math.max(0, Math.min(payment.amount, availableNow)));

    const audits = await withDbRetry(() =>
      prisma.auditLog.findMany({
        where: { entityType: "Payment", entityId: payment.id },
        orderBy: { createdAt: "asc" },
        include: { user: { select: { username: true, role: true } } },
      })
    );

    const timeline =
      audits.length > 0 ? buildTimelineFromAudits(audits) : buildTimelineReconstructed(payment);

    const amountStory = buildAmountStory(audits, payment);

    return NextResponse.json({
      payment: {
        id: payment.id,
        investorId: payment.investorId,
        type: payment.type,
        status: payment.status,
        requestedAmount: moneyRound2(payment.amount),
        createdAt: payment.createdAt.toISOString(),
        approvedAt: payment.approvedAt?.toISOString() ?? null,
        acceptedAt: payment.acceptedAt?.toISOString() ?? null,
      },
      position: {
        body: payment.investor.body,
        accrued: payment.investor.accrued,
        status: payment.investor.status,
      },
      limits: {
        availableNow: moneyRound2(availableNow),
        maxApprove,
        pendingInterest,
        pendingBody,
        hasPendingClose,
      },
      timeline,
      amountStory,
    });
  } catch (error) {
    console.error("PAYMENT_CONTEXT_ERROR:", error);
    if (isTransientDbError(error)) {
      return NextResponse.json({ error: "Временная ошибка БД, повторите запрос" }, { status: 503 });
    }
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

