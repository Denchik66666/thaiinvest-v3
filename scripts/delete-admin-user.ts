import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  const admin = await prisma.user.findUnique({
    where: { username: "admin" },
    select: { id: true, username: true, isArchived: true },
  });

  if (!admin) {
    console.log("ℹ️ user 'admin' not found");
    return;
  }

  await prisma.user.delete({ where: { id: admin.id } });
  console.log("✅ deleted user 'admin' (id:", admin.id + ")");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

