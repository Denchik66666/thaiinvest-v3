/**
 * Одноразовая чистка User + перенумерация id (admin=1, semen=2, Sega_55RUS=3).
 * Запуск: npx tsx scripts/db-user-cleanup-renumber.ts
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";

const OFFSET = 900_000;

function assertInt(n: number, label: string) {
  if (!Number.isInteger(n) || n < 1) throw new Error(`Invalid id ${label}`);
}

async function main() {
  const admin = await prisma.user.findUnique({ where: { username: "admin" } });
  const semen = await prisma.user.findUnique({ where: { username: "semen" } });
  const sega = await prisma.user.findUnique({ where: { username: "Sega_55RUS" } });
  if (!admin || !semen || !sega) {
    throw new Error("Ожидаются пользователи admin, semen, Sega_55RUS в БД");
  }
  const ghost = await prisma.user.findUnique({ where: { id: 6 } });
  if (admin.id === 1 && semen.id === 2 && sega.id === 3 && !ghost) {
    console.log("Уже нормализовано (admin=1, semen=2, Sega_55RUS=3, Den/Sam нет). Пропуск.");
    const final = await prisma.user.findMany({
      select: { id: true, username: true, role: true, isArchived: true },
      orderBy: { id: "asc" },
    });
    console.log(JSON.stringify(final, null, 2));
    return;
  }
  assertInt(admin.id, "admin");
  assertInt(semen.id, "semen");
  assertInt(sega.id, "sega");

  const adminId = admin.id;
  const semenId = semen.id;
  const segaId = sega.id;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`UPDATE "Investor" SET "ownerId" = ${adminId} WHERE "ownerId" = 6`);
    await tx.$executeRawUnsafe(`UPDATE "Investor" SET "ownerId" = ${semenId} WHERE "ownerId" = 11`);

    await tx.$executeRawUnsafe(`UPDATE "Investor" SET "linkedUserId" = NULL WHERE "linkedUserId" IN (6, 11, 39)`);
    await tx.$executeRawUnsafe(`UPDATE "Investor" SET "investorUserId" = NULL WHERE "investorUserId" IN (6, 11, 39)`);

    await tx.$executeRawUnsafe(`UPDATE "BodyTopUpRequest" SET "createdById" = ${adminId} WHERE "createdById" IN (6, 11, 39)`);
    await tx.$executeRawUnsafe(`UPDATE "BodyTopUpRequest" SET "decidedById" = NULL WHERE "decidedById" IN (6, 11, 39)`);

    await tx.$executeRawUnsafe(`UPDATE "RateHistory" SET "changedBy" = ${adminId} WHERE "changedBy" IN (6, 11, 39)`);
    await tx.$executeRawUnsafe(`UPDATE "AuditLog" SET "userId" = ${adminId} WHERE "userId" IN (6, 11, 39)`);

    await tx.$executeRawUnsafe(`DELETE FROM "User" WHERE "id" IN (6, 11, 39)`);

    await tx.$executeRawUnsafe(`UPDATE "User" SET "id" = ${adminId + OFFSET} WHERE "id" = ${adminId}`);
    await tx.$executeRawUnsafe(`UPDATE "User" SET "id" = ${semenId + OFFSET} WHERE "id" = ${semenId}`);
    await tx.$executeRawUnsafe(`UPDATE "User" SET "id" = ${segaId + OFFSET} WHERE "id" = ${segaId}`);

    await tx.$executeRawUnsafe(`UPDATE "User" SET "id" = 1 WHERE "id" = ${adminId + OFFSET}`);
    await tx.$executeRawUnsafe(`UPDATE "User" SET "id" = 2 WHERE "id" = ${semenId + OFFSET}`);
    await tx.$executeRawUnsafe(`UPDATE "User" SET "id" = 3 WHERE "id" = ${segaId + OFFSET}`);

    await tx.$executeRawUnsafe(`
      SELECT setval(
        pg_get_serial_sequence('"User"', 'id'),
        (SELECT COALESCE(MAX("id"), 1) FROM "User")
      )
    `);
  });

  const final = await prisma.user.findMany({
    select: { id: true, username: true, role: true, isArchived: true },
    orderBy: { id: "asc" },
  });
  console.log(JSON.stringify(final, null, 2));

  const invCheck = await prisma.investor.findMany({
    select: {
      id: true,
      name: true,
      ownerId: true,
      investorUserId: true,
      linkedUserId: true,
    },
    orderBy: { id: "asc" },
  });
  console.log("Investors:", JSON.stringify(invCheck, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
