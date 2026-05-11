import "dotenv/config";
import { prisma } from "../../lib/prisma";

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, role: true, isArchived: true, isSystemOwner: true },
    orderBy: { id: "asc" },
  });
  console.table(users);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

