/**
 * Одна заявка Payment для повторного прогона бенчмарка / e2e (модалка удаления).
 * Статус pending — DELETE не трогает body/accrued, только строку в БД.
 *
 * BENCH_INVESTOR_ID — опционально; иначе первая позиция по id.
 * Запуск: npx tsx scripts/seed-benchmark-payment-5000-may5.ts
 */
import "dotenv/config";

import { prisma } from "../lib/prisma";

const MAY5 = new Date("2026-05-05T12:00:00.000Z");
const AMOUNT = 5000;

async function main() {
  const raw = process.env.BENCH_INVESTOR_ID;
  const investorId =
    raw != null && raw !== ""
      ? Number(raw)
      : (
          await prisma.investor.findFirst({
            where: { isPrivate: false },
            orderBy: { id: "asc" },
            select: { id: true },
          })
        )?.id ??
        (await prisma.investor.findFirst({ orderBy: { id: "asc" }, select: { id: true } }))?.id;

  if (investorId == null || !Number.isFinite(investorId) || investorId <= 0) {
    console.error("Нет валидного investorId (задайте BENCH_INVESTOR_ID или создайте позицию через seed).");
    process.exit(1);
  }

  const exists = await prisma.investor.findUnique({
    where: { id: investorId },
    select: { id: true, name: true },
  });
  if (!exists) {
    console.error("Инвестор не найден:", investorId);
    process.exit(1);
  }

  const p = await prisma.payment.create({
    data: {
      investorId,
      type: "body",
      amount: AMOUNT,
      status: "pending",
      comment: "seed benchmark delete/modal",
      createdAt: MAY5,
    },
    select: { id: true, investorId: true, amount: true, status: true, createdAt: true },
  });

  console.log("Создана заявка для бенчмарка:", p, "позиция:", exists.name);
  console.log(`URL финансов: /dashboard/finance?investor=${p.investorId}&payment=${p.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
