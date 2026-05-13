import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  const admin = await prisma.user.findUnique({
    where: { username: "admin" },
    select: { id: true, username: true, role: true, isArchived: true },
  });

  if (!admin) {
    console.log("ℹ️ user 'admin' not found");
    return;
  }

  if (admin.isArchived) {
    console.log("ℹ️ user 'admin' already archived");
    return;
  }

  const updated = await prisma.user.update({
    where: { id: admin.id },
    data: { isArchived: true, archivedAt: new Date() },
    select: { id: true, username: true, role: true, isArchived: true },
  });

  console.log("✅ archived:", updated);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

