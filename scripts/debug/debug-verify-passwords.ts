import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });
import bcrypt from "bcryptjs";

const expected: Record<string, string> = {
  admin: "admin123",
  Sam: "admin123",
  Sega_55RUS: "qwerty123",
};

async function main() {
  const { prisma } = await import("../../lib/prisma");
  const users = await prisma.user.findMany({
    where: { isArchived: false },
    select: { id: true, username: true, role: true, password: true },
    orderBy: { id: "asc" },
  });

  for (const u of users) {
    const pw = expected[u.username];
    const ok = pw ? bcrypt.compareSync(pw, u.password) : null;
    console.log({ id: u.id, username: u.username, role: u.role, hasExpected: Boolean(pw), bcryptOk: ok });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      const { prisma } = await import("../../lib/prisma");
      await prisma.$disconnect();
    } catch {
      // ignore
    }
  });

