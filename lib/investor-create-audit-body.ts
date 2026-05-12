import { bodyTopUpRequestCountedAsInflow } from "@/lib/body-topup-inflow";
import { moneyRound2 } from "@/lib/money-round";

/**
 * Тело при создании позиции — только из аудита `CREATE_INVESTOR` (`newValue` = JSON инвестора).
 * Нельзя подставлять текущий `Investor.body`: после пополнений он меняется и «начальное тело» в ленте/сводке
 * ошибочно вырастает вместе с балансом.
 */
export function parseInitialBodyFromCreateInvestorAudit(newValue: string | null | undefined): number | null {
  if (newValue == null || !String(newValue).trim()) return null;
  try {
    const j = JSON.parse(newValue) as { body?: unknown };
    const b = j.body;
    if (typeof b === "number" && Number.isFinite(b)) return moneyRound2(b);
    if (typeof b === "string") {
      const n = Number(String(b).replace(",", ".").trim());
      if (Number.isFinite(n)) return moneyRound2(n);
    }
    return null;
  } catch {
    return null;
  }
}

export type BodyTopUpRowForInitialResolve = { amount: number; status: string };

/**
 * Тело на момент активации: сначала разбор аудита `CREATE_INVESTOR`.
 * Если аудит пустой/нечитаемый (старые данные, другой формат JSON) — оценка
 * `текущее тело − сумма принятых пополнений по заявкам`, чтобы в ленте оставалась строка «при создании»
 * и не возвращалась ошибка «тело 200k, в истории только +100k».
 */
export function resolveInitialBodyAtCreation(params: {
  createInvestorAuditNewValue: string | null | undefined;
  currentBody: number;
  acceptedBodyTopUpRequests: readonly BodyTopUpRowForInitialResolve[];
}): number | null {
  const fromAudit = parseInitialBodyFromCreateInvestorAudit(params.createInvestorAuditNewValue);
  if (fromAudit != null) return fromAudit;

  const acceptedSum = params.acceptedBodyTopUpRequests.reduce(
    (s, t) => (bodyTopUpRequestCountedAsInflow(t.status) ? moneyRound2(s + t.amount) : s),
    0
  );
  const rest = moneyRound2(moneyRound2(params.currentBody) - acceptedSum);
  if (rest <= 0) return null;
  return rest;
}
