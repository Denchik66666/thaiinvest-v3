import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, role: true, isArchived: true, password: true },
    orderBy: { id: "asc" },
  });
  console.log(
    users.map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      isArchived: u.isArchived,
      passwordPrefix: u.password.slice(0, 12),
    }))
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

