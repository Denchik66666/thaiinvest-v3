/**
 * Проверка / сброс пароля SUPER_ADMIN (`admin`) на проде (только `.env`, без `.env.local`).
 *
 *   npm run db:reset-admin-password:prod
 *   ADMIN_PASSWORD_RESET_NEW='ваш_пароль' ADMIN_PASSWORD_RESET_CONFIRM=yes npm run db:reset-admin-password:prod:apply
 *
 * По умолчанию при --apply хешируется admin123 (как seed), если ADMIN_PASSWORD_RESET_NEW не задан.
 */
import "./load-prod-env-only";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";

const USERNAME = process.env.ADMIN_PASSWORD_RESET_USERNAME?.trim() || "admin";

async function main() {
  const apply = process.argv.includes("--apply");
  const candidate =
    process.env.ADMIN_PASSWORD_RESET_NEW?.trim() ||
    process.env.PLAYWRIGHT_SUPERADMIN_PASSWORD?.trim() ||
    "admin123";

  const user = await prisma.user.findFirst({
    where: { username: { equals: USERNAME, mode: "insensitive" } },
    select: { id: true, username: true, role: true, password: true },
  });

  if (!user) {
    console.error(`Пользователь "${USERNAME}" не найден в БД из .env`);
    process.exit(1);
  }

  console.log(`Учётка: id=${user.id} username=${user.username} role=${user.role}`);
  const matches = bcrypt.compareSync(candidate, user.password);
  console.log(`Проверка пароля (${apply ? "новый будет записан" : "кандидат из env или admin123"}): ${matches ? "OK" : "не совпадает"}`);

  if (!apply) {
    if (!matches) {
      console.log(
        "\nДля e2e на проде задайте PLAYWRIGHT_SUPERADMIN_PASSWORD в .env.local или сбросьте пароль:\n" +
          "  ADMIN_PASSWORD_RESET_CONFIRM=yes npm run db:reset-admin-password:prod:apply"
      );
    }
    return;
  }

  if (process.env.ADMIN_PASSWORD_RESET_CONFIRM !== "yes") {
    console.error("Для записи в прод: ADMIN_PASSWORD_RESET_CONFIRM=yes");
    process.exit(1);
  }

  const hash = bcrypt.hashSync(candidate, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hash, isArchived: false, archivedAt: null },
  });
  console.log(`Пароль для "${user.username}" обновлён (длина нового: ${candidate.length} символов).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
