import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { findBodyTopUpRequestForContext } from "@/lib/body-topup-request-date-compat";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { isTransientDbError, withDbRetry } from "@/lib/db-retry";
import { moneyRound2 } from "@/lib/money-round";

type TimelineRow = {
  at: string;
  kind: string;
  title: string;
  actorUsername: string;
  source: "audit" | "reconstructed";
  stepAmount: number | null;
};

function actionTimelineMeta(action: string): { kind: string; title: string } {
  const map: Record<string, { kind: string; title: string }> = {
    BODY_TOPUP_REQUEST_CREATE: { kind: "request", title: "Заявка" },
    BODY_TOPUP_REQUEST_ACCEPT: { kind: "completed", title: "Подтверждение" },
    BODY_TOPUP_REQUEST_REJECT: { kind: "rejected", title: "Отклонение" },
    BODY_TOPUP_REQUEST_CANCEL: { kind: "rejected", title: "Отзыв владельцем" },
  };
  return map[action] ?? { kind: "other", title: action };
}

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
  audits: Array<{ createdAt: Date; action: string; newValue: string | null; user: { username: string } }>
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

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ error: "Неверный токен" }, { status: 401 });

    const raw = request.nextUrl.searchParams.get("requestId");
    const requestId = raw ? Number(raw) : NaN;
    if (!Number.isFinite(requestId) || requestId <= 0 || !Number.isInteger(requestId)) {
      return NextResponse.json({ error: "Некорректный requestId" }, { status: 400 });
    }

    const row = await withDbRetry(() => findBodyTopUpRequestForContext(requestId));
    if (!row) return NextResponse.json({ error: "Запрос не найден" }, { status: 404 });

    const inv = row.investor;
    if (decoded.role === "OWNER" && inv.ownerId !== decoded.userId) {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }
    const canSeeAsInvestor =
      (inv.linkedUserId === decoded.userId && !inv.isPrivate) ||
      (inv.ownerId === decoded.userId && inv.isPrivate) ||
      inv.investorUserId === decoded.userId;
    if (decoded.role === "INVESTOR" && !canSeeAsInvestor) {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const audits = await withDbRetry(() =>
      prisma.auditLog.findMany({
        where: { entityType: "BodyTopUpRequest", entityId: row.id },
        orderBy: { createdAt: "asc" },
        include: { user: { select: { username: true, role: true } } },
      })
    );

    const investorActor = inv.investorUser?.username ?? inv.linkedUser?.username ?? "—";
    const requestAtIso = (row.requestDate ?? row.createdAt).toISOString();
    const reconstructed: TimelineRow[] = [
      {
        at: requestAtIso,
        kind: "request",
        title: "Заявка",
        actorUsername: row.createdBy.username,
        source: "reconstructed",
        stepAmount: moneyRound2(row.amount),
      },
    ];
    if (row.decidedAt) {
      reconstructed.push({
        at: row.decidedAt.toISOString(),
        kind: row.status === "accepted_by_investor" ? "completed" : "rejected",
        title: row.status === "accepted_by_investor" ? "Подтверждение" : "Решение",
        actorUsername: investorActor,
        source: "reconstructed",
        stepAmount: moneyRound2(row.amount),
      });
    }

    let timeline: TimelineRow[] = audits.length > 0 ? buildTimelineFromAudits(audits) : reconstructed;
    if (timeline.length > 0 && timeline[0].kind === "request") {
      timeline = [{ ...timeline[0], at: requestAtIso }, ...timeline.slice(1)];
    }

    const body = moneyRound2(inv.body);
    const accrued = moneyRound2(inv.accrued);
    const reqAmt = moneyRound2(row.amount);

    return NextResponse.json({
      request: {
        id: row.id,
        investorId: row.investorId,
        status: row.status,
        requestedAmount: reqAmt,
        createdAt: row.createdAt.toISOString(),
        requestDate: row.requestDate?.toISOString() ?? null,
        decidedAt: row.decidedAt?.toISOString() ?? null,
      },
      position: {
        body,
        accrued,
        status: inv.status,
      },
      limits: {
        /** Как «Доступно» у выплаты: текущее тело позиции до зачисления. */
        availableNow: body,
        maxApprove: reqAmt,
        pendingInterest: 0,
        pendingBody: 0,
        hasPendingClose: false,
      },
      timeline,
    });
  } catch (error) {
    console.error("BODY_TOPUP_CONTEXT_ERROR:", error);
    if (isTransientDbError(error)) {
      return NextResponse.json({ error: "Временная ошибка БД, повторите запрос" }, { status: 503 });
    }
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
