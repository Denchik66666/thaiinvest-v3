import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });

async function main() {
  const { prisma } = await import("@/lib/prisma");
  const rows = await prisma.bodyTopUpRequest.findMany({
    take: 10,
    orderBy: { id: "asc" },
    select: {
      id: true,
      investorId: true,
      amount: true,
      status: true,
      requestDate: true,
      createdAt: true,
    },
  });
  console.log(JSON.stringify(rows, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
