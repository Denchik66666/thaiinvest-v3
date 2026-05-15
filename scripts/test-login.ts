import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function test() {
  const user =
    (await prisma.user.findUnique({ where: { username: "Den" }, select: { username: true, password: true } })) ??
    (await prisma.user.findUnique({ where: { username: "admin" }, select: { username: true, password: true } }));

  if (!user) {
    console.log("❌ SUPER_ADMIN user (Den/admin) not found");
    return;
  }

  console.log("✅ user found:", user.username);

  const ok = bcrypt.compareSync("admin123", user.password);
  console.log("bcrypt compare result:", ok);
}

(async () => {
  try {
    await test();
  } catch (e) {
    console.error("❌ error:", e);
  } finally {
    await prisma.$disconnect();
  }
})();
