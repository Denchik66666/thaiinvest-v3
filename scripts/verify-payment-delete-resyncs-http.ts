/**
 * Проверка пересчёта accrued/paid после удаления выплаты.
 *
 * 1) Всегда: Prisma — создать заявку `requested`, удалить строку, вызвать
 *    `syncSingleInvestorAccruedAndPaidFromLedger` (как после DELETE в API), сверка с compute*.
 *
 * 2) Опционально: HTTP к dev — если `POST /api/auth/login` с `admin`/`admin123` даёт 200,
 *    то же через `DELETE /api/payments/:id` (реальный обработчик).
 *
 *   npx tsx scripts/verify-payment-delete-resyncs-http.ts
 *   VERIFY_BASE_URL=http://127.0.0.1:3000 npx tsx scripts/verify-payment-delete-resyncs-http.ts
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import {
  computeInvestorAccruedEndFromLedger,
  computeInvestorPaidCompletedTotal,
  toWeeklyLedgerPayments,
} from "@/lib/investor-accrued-ledger";
import { syncSingleInvestorAccruedAndPaidFromLedger } from "@/lib/business-rate-accrual-recalc";

const BASE = process.env.VERIFY_BASE_URL ?? "http://127.0.0.1:3000";

function cookieHeaderFromResponse(res: Response): string {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  const list = typeof h.getSetCookie === "function" ? h.getSetCookie() : [];
  if (list.length) {
    return list.map((c) => c.split(";")[0]!.trim()).join("; ");
  }
  const single = res.headers.get("set-cookie");
  if (!single) return "";
  return single
    .split(/,(?=[^;]+?=)/)
    .map((p) => p.split(";")[0]!.trim())
    .join("; ");
}

async function loadCanon(investorId: number) {
  const inv = await prisma.investor.findUnique({
    where: { id: investorId },
    include: {
      payments: {
        where: { status: "completed" },
        orderBy: { createdAt: "asc" },
        select: {
          type: true,
          amount: true,
          status: true,
          createdAt: true,
          approvedAt: true,
          acceptedAt: true,
        },
      },
    },
  });
  if (!inv) throw new Error("investor missing");
  const topRows = await prisma.bodyTopUpRequest.findMany({
    where: { investorId },
    select: { amount: true, status: true, requestDate: true, decidedAt: true, createdAt: true },
  });
  const rateHistory = await prisma.rateHistory.findMany({
    orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }],
    select: { effectiveDate: true, newRate: true },
  });
  const paid = computeInvestorPaidCompletedTotal(inv.payments);
  const accrued = computeInvestorAccruedEndFromLedger({
    activationDate: inv.activationDate,
    body: inv.body,
    rate: inv.rate,
    isPrivate: inv.isPrivate,
    payments: toWeeklyLedgerPayments(inv.payments),
    bodyTopUpRows: topRows,
    rateHistory,
    now: new Date(),
  });
  return { accrued, paid };
}

async function assertDbMatchesCanon(investorId: number, label: string) {
  const inv = await prisma.investor.findUnique({
    where: { id: investorId },
    select: { accrued: true, paid: true },
  });
  const { accrued, paid } = await loadCanon(investorId);
  const okA = Math.abs((inv?.accrued ?? 0) - accrued) < 0.5;
  const okP = Math.abs((inv?.paid ?? 0) - paid) < 0.5;
  if (!okA || !okP) {
    console.error(label, { db: inv, canon: { accrued, paid } });
    throw new Error(`${label}: accrued/paid не совпали с каноном`);
  }
}

async function prismaPathDeleteThenSync(investorId: number) {
  const pm = await prisma.payment.create({
    data: {
      investorId,
      type: "interest",
      amount: 1,
      status: "requested",
      comment: "__SYNC_VERIFY_DELETE_PRISMA__",
    },
  });
  await prisma.payment.delete({ where: { id: pm.id } });
  await syncSingleInvestorAccruedAndPaidFromLedger(investorId);
  await assertDbMatchesCanon(investorId, "prisma delete + syncSingle");
}

async function httpPathDelete(investorId: number): Promise<boolean> {
  const user = process.env.VERIFY_HTTP_USERNAME ?? "Den";
  const pass = process.env.VERIFY_HTTP_PASSWORD ?? "admin123";
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: user, password: pass }),
  });
  if (!loginRes.ok) {
    console.log(
      `HTTP: логин ${user}/*** не прошёл — пропуск HTTP-проверки (задайте VERIFY_HTTP_USERNAME / VERIFY_HTTP_PASSWORD или admin с паролем из сида).`
    );
    return false;
  }
  const cookie = cookieHeaderFromResponse(loginRes);
  if (!cookie.includes("token=")) {
    console.log("HTTP: нет cookie token — пропуск.");
    return false;
  }

  const createRes = await fetch(`${BASE}/api/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      action: "request",
      investorId,
      type: "interest",
      amount: 1,
      comment: "__SYNC_VERIFY_DELETE_HTTP__",
    }),
  });
  const createJson = (await createRes.json()) as { payment?: { id: number }; error?: string };
  if (!createRes.ok || !createJson.payment?.id) {
    console.error("HTTP: создание заявки не удалось:", createRes.status, createJson);
    throw new Error("HTTP create failed");
  }
  const paymentId = createJson.payment.id;

  const delRes = await fetch(`${BASE}/api/payments/${paymentId}`, {
    method: "DELETE",
    headers: { Cookie: cookie },
  });
  if (!delRes.ok) {
    console.error("HTTP: DELETE не удалён:", delRes.status, await delRes.text());
    throw new Error("HTTP delete failed");
  }

  await assertDbMatchesCanon(investorId, "HTTP DELETE /api/payments");
  return true;
}

async function main() {
  const invRow = await prisma.investor.findFirst({
    where: { isSystemOwner: false },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  if (!invRow) {
    console.error("Нет инвестора в БД.");
    process.exit(1);
  }
  const investorId = invRow.id;

  await prismaPathDeleteThenSync(investorId);
  console.log("OK (Prisma): delete requested payment + syncSingle → accrued/paid = канон.");

  try {
    const httpOk = await httpPathDelete(investorId);
    if (httpOk) console.log("OK (HTTP): DELETE /api/payments → accrued/paid = канон.");
  } catch (e) {
    console.error("HTTP-проверка упала:", e);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
