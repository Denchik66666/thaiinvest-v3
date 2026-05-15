/**
 * Пользователи с устаревшим avatarUrl (локальный /uploads/… после serverless).
 * Только `.env` (прод Supabase), без `.env.local`.
 *
 *   npm run db:list-stale-avatars:prod
 *   npm run db:list-stale-avatars:prod:apply
 */
import "./load-prod-env-only";
import { prisma } from "../lib/prisma";

function isStaleAvatarUrl(url: string | null | undefined): boolean {
  const u = url?.trim();
  if (!u) return false;
  if (u.startsWith("/uploads")) return true;
  if (u.includes("/uploads/avatars/")) return true;
  return false;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const users = await prisma.user.findMany({
    where: { avatarUrl: { not: null } },
    select: { id: true, username: true, role: true, avatarUrl: true },
    orderBy: { id: "asc" },
  });

  const stale = users.filter((u) => isStaleAvatarUrl(u.avatarUrl));
  if (stale.length === 0) {
    console.log("Устаревших avatarUrl не найдено.");
    return;
  }

  console.log(`Найдено ${stale.length} учёток с устаревшим путём:`);
  for (const u of stale) {
    console.log(`  id=${u.id} ${u.username} (${u.role}) → ${u.avatarUrl}`);
  }

  if (!apply) {
    console.log("\nDry-run. Чтобы обнулить поля: npm run db:list-stale-avatars:prod:apply");
    return;
  }

  if (process.env.STALE_AVATAR_RESET_CONFIRM !== "yes") {
    console.error("Для записи в прод задайте STALE_AVATAR_RESET_CONFIRM=yes в .env (только на время запуска).");
    process.exit(1);
  }

  const ids = stale.map((u) => u.id);
  const { count } = await prisma.user.updateMany({
    where: { id: { in: ids } },
    data: { avatarUrl: null },
  });
  console.log(`\nОбнулено avatarUrl: ${count}. Пользователи могут перезалить фото в профиле.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
