/**
 * Создать заявку на пополнение тела от имени OWNER Sam для позиции Sega (investorUser).
 * Дата заявки (календарь): 2026-03-04. Сумма: 100 000.
 *
 * npx tsx scripts/dev/sam-create-sega-body-topup.ts
 */
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });

async function main() {
  const { parseCalendarDateOnlyYmd } = await import("@/lib/calendar-request-date");
  const { createBodyTopUpRequestWithDateCompat } = await import("@/lib/body-topup-request-date-compat");
  const { prisma } = await import("@/lib/prisma");

  const sam = await prisma.user.findFirst({
    where: { username: { equals: "Sam", mode: "insensitive" }, role: "OWNER", isArchived: false },
    select: { id: true },
  });
  if (!sam) throw new Error("OWNER Sam не найден");

  const segaUser = await prisma.user.findFirst({
    where: { username: { equals: "Sega_55RUS", mode: "insensitive" }, isArchived: false },
    select: { id: true },
  });
  if (!segaUser) throw new Error("Пользователь Sega_55RUS не найден");

  const investor = await prisma.investor.findFirst({
    where: {
      ownerId: sam.id,
      isPrivate: false,
      investorUserId: segaUser.id,
    },
    select: { id: true, name: true, linkedUserId: true, investorUserId: true },
  });
  if (!investor) {
    throw new Error("Позиция Sega в общей сети у Sam не найдена (investorUserId)");
  }

  const pending = await prisma.bodyTopUpRequest.count({
    where: { investorId: investor.id, status: "pending_investor" },
  });
  if (pending > 0) {
    await prisma.bodyTopUpRequest.deleteMany({
      where: { investorId: investor.id, status: "pending_investor" },
    });
    console.log("Удалены старые pending заявки для этой позиции");
  }

  const requestCalendarAt = parseCalendarDateOnlyYmd("2026-03-04");
  if (!requestCalendarAt) throw new Error("Дата 2026-03-04");

  const row = await createBodyTopUpRequestWithDateCompat(
    {
      investorId: investor.id,
      amount: 100_000,
      status: "pending_investor",
      comment: null,
      createdById: sam.id,
    },
    requestCalendarAt
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        bodyTopUpRequestId: row.id,
        investorId: investor.id,
        investorName: investor.name,
        amount: 100_000,
        requestDate: "2026-03-04",
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
