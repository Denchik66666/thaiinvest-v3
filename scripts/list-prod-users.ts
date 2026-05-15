/**
 * Список пользователей в БД из .env (прод Supabase). Без .env.local.
 * npx tsx scripts/list-prod-users.ts
 */
import "./load-prod-env-only";
import { prisma } from "../lib/prisma";

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, role: true, isArchived: true },
    orderBy: [{ role: "asc" }, { id: "asc" }],
  });

  console.log("Все пользователи (прод, .env):");
  console.table(
    users.map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      archived: u.isArchived,
    }))
  );

  const supers = users.filter((u) => u.role === "SUPER_ADMIN");
  console.log("\nSUPER_ADMIN:");
  for (const u of supers) {
    console.log(`  id=${u.id}  username="${u.username}"  role=${u.role}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
