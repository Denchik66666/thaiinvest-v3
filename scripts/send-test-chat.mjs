import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!url) {
  console.error("NO_ENV_DB: задайте DATABASE_URL или DIRECT_URL в .env");
  process.exit(1);
}

const prisma = new PrismaClient(
  url.startsWith("prisma+") ? { accelerateUrl: url } : { adapter: new PrismaPg(url) }
);

function parseArgs(argv) {
  let fromUsername = process.env.CHAT_FROM ?? "Sega";
  let toUsername = process.env.CHAT_TO ?? null;
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--from" && argv[i + 1]) {
      fromUsername = argv[++i];
      continue;
    }
    if (a === "--to" && argv[i + 1]) {
      toUsername = argv[++i];
      continue;
    }
    rest.push(a);
  }
  return { fromUsername, toUsername, rest };
}

const defaultBody = () =>
  `Тест ${new Date().toLocaleString("ru-RU")}: открой любую страницу кабинета — тост и звук (если включены в профиле).`;

async function main() {
  const argv = process.argv.slice(2);
  const { fromUsername, toUsername, rest } = parseArgs(argv);
  const body = rest.join(" ").trim() || defaultBody();

  const sender = await prisma.user.findFirst({
    where: { isArchived: false, username: { equals: fromUsername, mode: "insensitive" } },
    select: { id: true, username: true, role: true },
  });

  if (!sender) {
    console.error(
      `NO_SENDER: пользователь «${fromUsername}» не найден. Выполни: npx prisma db seed`
    );
    process.exit(1);
  }

  let recipient = null;
  if (toUsername) {
    recipient = await prisma.user.findFirst({
      where: {
        isArchived: false,
        username: { equals: toUsername, mode: "insensitive" },
        id: { not: sender.id },
      },
      select: { id: true, username: true, role: true },
    });
    if (!recipient) {
      console.error(`NO_RECIPIENT: пользователь «${toUsername}» не найден или совпадает с отправителем.`);
      process.exit(1);
    }
  } else {
    const preferRecipients = ["Denchik", "denchik", "admin", "semen", "Sam"];
    const recipients = await prisma.user.findMany({
      where: {
        isArchived: false,
        id: { not: sender.id },
        username: { in: preferRecipients, mode: "insensitive" },
      },
      select: { id: true, username: true, role: true },
    });
    if (!recipients.length) {
      const any = await prisma.user.findMany({
        where: { isArchived: false, id: { not: sender.id } },
        select: { id: true, username: true, role: true },
        take: 12,
        orderBy: { id: "asc" },
      });
      console.error("NO_MATCH_RECIPIENT: задай получателя: npm run chat:test-send -- --to ИМЯ \"текст\"");
      console.error("Пользователи в базе:", JSON.stringify(any, null, 2));
      process.exit(1);
    }
    recipient =
      recipients.find((u) => u.username.toLowerCase() === "denchik") ??
      recipients.find((u) => u.username.toLowerCase() === "admin") ??
      recipients.find((u) => u.username.toLowerCase() === "semen") ??
      recipients[0];
  }

  const msg = await prisma.chatMessage.create({
    data: {
      senderId: sender.id,
      recipientId: recipient.id,
      body,
    },
    select: { id: true, createdAt: true },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        messageId: msg.id,
        from: sender.username,
        to: recipient.username,
        preview: body.slice(0, 120),
        hint: "На телефоне: залогинься как получатель, оставь вкладку открытой (кабинет). Опрос чата ~4–10 с. Звук на iOS часто только после тапа по странице.",
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    if (e?.code === "P2021") {
      console.error(
        "Нет таблицы чата в этой БД. Примените миграции:\n  npx prisma migrate deploy\nЗатем снова: npm run chat:test-send"
      );
    } else {
      console.error(e);
    }
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
