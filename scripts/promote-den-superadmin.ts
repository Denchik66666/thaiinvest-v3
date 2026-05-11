import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  const user =
    (await prisma.user.findUnique({ where: { username: "admin" }, select: { id: true, username: true, role: true } })) ??
    (await prisma.user.findUnique({ where: { username: "Den" }, select: { id: true, username: true, role: true } }));
  if (!user) throw new Error('User "admin" (или legacy "Den") не найден');
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { role: "SUPER_ADMIN" },
    select: { id: true, username: true, role: true },
  });
  console.log("Updated:", updated);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

