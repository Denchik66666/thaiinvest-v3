"use client";

import type { ReactNode } from "react";

/** Платежи из GET /api/investors?lean=1 (mapPaymentsToPayload). Статусы — как в app/api/payments/route.ts и prisma. */
export type WithdrawalRequestPayment = {
  id: number;
  type: string;
  amount: number;
  status: string;
  createdAt: string;
  approvedAt?: string | null;
  acceptedAt?: string | null;
};

function formatAmount(num: number) {
  if (!num) return "0";
  return Number(num).toLocaleString("ru-RU");
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const WITHDRAWAL_TYPES = new Set(["interest", "body", "close"]);

export function pickLatestWithdrawalRequest(
  investors: Array<{ payments?: WithdrawalRequestPayment[] | null }>
): WithdrawalRequestPayment | null {
  const candidates: WithdrawalRequestPayment[] = [];
  for (const inv of investors) {
    for (const p of inv.payments ?? []) {
      if (!WITHDRAWAL_TYPES.has(p.type)) continue;
      if (p.status !== "requested" && p.status !== "pending" && p.status !== "approved_waiting_accept" && p.status !== "rejected") {
        continue;
      }
      candidates.push(p);
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return candidates[0] ?? null;
}

/** Дата «обновления» для UI: в модели Payment нет updatedAt — для одобрения берём approvedAt. */
function displayDecisionDate(payment: WithdrawalRequestPayment) {
  return formatDate(payment.approvedAt ?? payment.createdAt);
}

export function getPaymentStatusBlock(payment: WithdrawalRequestPayment): ReactNode {
  const s = payment.status;
  if (s === "requested" || s === "pending") {
    return (
      <div
        style={{
          background: "var(--thai-color-pending-bg)",
          border: "1px solid var(--thai-color-card-border)",
          borderRadius: 12,
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "var(--thai-color-pending-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          ⏳
        </div>
        <div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--thai-color-due)",
              marginBottom: 3,
            }}
          >
            Заявка на рассмотрении
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--thai-color-text-secondary)",
            }}
          >
            {formatAmount(payment.amount)} ₿ · подана {formatDate(payment.createdAt)}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--thai-color-text-muted)",
              marginTop: 2,
            }}
          >
            Ожидает подтверждения владельца сети
          </div>
        </div>
      </div>
    );
  }

  if (s === "approved_waiting_accept") {
    return (
      <div
        style={{
          background: "var(--thai-color-approved-bg)",
          border: "1px solid var(--thai-color-card-border)",
          borderRadius: 12,
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "var(--thai-color-approved-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          ✅
        </div>
        <div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--thai-color-paid)",
              marginBottom: 3,
            }}
          >
            Заявка одобрена
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--thai-color-text-secondary)",
            }}
          >
            {formatAmount(payment.amount)} ₿ · одобрена {displayDecisionDate(payment)}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--thai-color-text-muted)",
              marginTop: 2,
            }}
          >
            Подтвердите получение средств
          </div>
        </div>
      </div>
    );
  }

  if (s === "rejected") {
    return (
      <div
        style={{
          background: "var(--thai-color-rejected-bg)",
          border: "1px solid var(--thai-color-card-border)",
          borderRadius: 12,
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "var(--thai-color-rejected-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          ❌
        </div>
        <div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--thai-color-rejected)",
              marginBottom: 3,
            }}
          >
            Заявка отклонена
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--thai-color-text-secondary)",
            }}
          >
            {formatAmount(payment.amount)} ₿ · {displayDecisionDate(payment)}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--thai-color-text-muted)",
              marginTop: 2,
            }}
          >
            Можно подать новую заявку
          </div>
        </div>
      </div>
    );
  }

  return null;
}
