import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";

const candidates = ["admin123", "18121985", "12345678", "password", "qwerty123"];

try {
  const users = await prisma.user.findMany({
    where: { role: "SUPER_ADMIN", isArchived: false },
    select: { id: true, username: true, password: true },
  });
  for (const user of users) {
    const matches = candidates.filter((p) => bcrypt.compareSync(p, user.password));
    console.log(
      JSON.stringify({
        id: user.id,
        username: user.username,
        match: matches[0] ?? null,
      })
    );
  }
} finally {
  await prisma.$disconnect();
}
