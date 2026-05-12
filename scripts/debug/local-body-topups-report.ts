/**
 * Та же загрузка env, что и в `scripts/ensure-local-db.mjs`: `.env`, затем `.env.local` (override).
 * Потом Prisma — чтобы не смотреть «другую» базу из-за только `--env-file=.env`.
 *
 * npx tsx scripts/debug/local-body-topups-report.ts
 */
import path from "node:path";
import process from "node:process";

import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });

function dbFingerprint(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) return "DATABASE_URL missing";
  try {
    const normalized = raw.startsWith("prisma+") ? raw.slice("prisma+".length) : raw;
    const u = new URL(normalized);
    const db = u.pathname?.replace(/^\//, "") ?? "";
    return `${u.hostname}:${u.port || "5432"}/${db.split("?")[0]}`;
  } catch {
    return "DATABASE_URL (unparseable)";
  }
}

async function main() {
  const { prisma } = await import("@/lib/prisma");

  const allTopups = await prisma.bodyTopUpRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      investorId: true,
      amount: true,
      status: true,
      comment: true,
      createdAt: true,
      decidedAt: true,
      createdById: true,
      createdBy: { select: { username: true } },
      investor: { select: { id: true, name: true, handle: true, ownerId: true } },
    },
  });

  const denLike = await prisma.investor.findMany({
    where: {
      OR: [
        { name: { contains: "Den", mode: "insensitive" } },
        { name: { contains: "Ден", mode: "insensitive" } },
        { handle: { contains: "den", mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, handle: true, body: true, ownerId: true },
  });

  console.log(
    JSON.stringify(
      {
        db_fingerprint_no_secrets: dbFingerprint(),
        bodyTopUpRequest_count: allTopups.length,
        bodyTopUpRequests: allTopups,
        investors_den_like: denLike,
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
