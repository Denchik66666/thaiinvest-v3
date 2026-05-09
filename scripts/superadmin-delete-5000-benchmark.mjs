/**
 * Вход SUPER_ADMIN → поиск payment 5000 с датой 05.05 (создания заявки) → DELETE → замер.
 * Запуск: node scripts/superadmin-delete-5000-benchmark.mjs
 * Env: BASE_URL (default http://127.0.0.1:3000), SUPERADMIN_PASSWORD (пробуются den123, admin123, $env)
 */
import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

const base = process.env.BASE_URL ?? "http://127.0.0.1:3000";

const passwordCandidates = [
  process.env.SUPERADMIN_PASSWORD,
  process.env.PLAYWRIGHT_SUPERADMIN_PASSWORD,
  process.env.PLAYWRIGHT_LOGIN_PASSWORD,
  "den123",
  "admin123",
].filter(Boolean);

const userCandidates = [process.env.SUPERADMIN_USER ?? "Den", "admin", "Den"];

function parseCookie(setCookie, name) {
  if (!setCookie) return null;
  const parts = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const p of parts) {
    const m = new RegExp(`^${name}=([^;]+)`).exec(p);
    if (m) return decodeURIComponent(m[1]);
  }
  return null;
}

function moneyEq(a, b) {
  return Math.round(Number(a) * 100) === Math.round(Number(b) * 100);
}

/** sortAt / createdAt ISO содержит 5 мая (05-05 в ISO) */
function isMay5(iso) {
  if (!iso || typeof iso !== "string") return false;
  return iso.includes("-05-05") || iso.includes(".05.05"); // на всякий случай
}

async function login(username, password) {
  const t0 = Date.now();
  const r = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const ms = Date.now() - t0;
  const token = parseCookie(r.headers.get("set-cookie"), "token");
  const body = await r.text();
  return { ok: r.ok, status: r.status, ms, token, body: body.slice(0, 200) };
}

async function api(path, token, opts = {}) {
  const t0 = Date.now();
  const r = await fetch(`${base}${path}`, {
    ...opts,
    headers: {
      Cookie: `token=${token}`,
      ...(opts.headers || {}),
    },
  });
  const ms = Date.now() - t0;
  const text = await r.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { ok: r.ok, status: r.status, ms, json, text: text.slice(0, 300) };
}

async function main() {
  const totalStart = Date.now();
  let token = null;
  let usedUser = null;
  let usedPass = null;

  outer: for (const u of userCandidates) {
    for (const p of passwordCandidates) {
      const L = await login(u, p);
      if (L.ok && L.token) {
        const me = await api("/api/auth/me", L.token);
        if (me.ok && me.json?.user?.role === "SUPER_ADMIN") {
          token = L.token;
          usedUser = u;
          usedPass = p;
          console.log(`Вход SUPER_ADMIN: ${u} (${L.ms}ms)`);
          break outer;
        }
      }
    }
  }

  if (!token) {
    console.error("Не удалось войти как SUPER_ADMIN. Задайте SUPERADMIN_PASSWORD или проверьте Den/den123, admin/admin123.");
    process.exit(1);
  }

  const histPaths = [
    "/api/investors/operations-history?network=all",
    "/api/investors/operations-history?network=common",
    "/api/investors/operations-history",
  ];

  let items = [];
  let histMs = 0;
  for (const path of histPaths) {
    const h = await api(path, token);
    histMs += h.ms;
    if (h.ok && h.json?.items?.length) {
      items = h.json.items;
      console.log(`История: ${path} (${h.ms}ms, строк: ${items.length})`);
      break;
    }
  }

  const payments = items.filter((i) => i.kind === "payment" && moneyEq(i.amount, 5000));
  const onMay5 = payments.filter((i) => isMay5(i.sortAt) || isMay5(i.createdAt));
  const pick = onMay5[0] ?? payments.sort((a, b) => (a.sortAt < b.sortAt ? 1 : -1))[0];

  if (!pick) {
    console.error("Нет payment с суммой 5000 в ленте SUPER_ADMIN. Найдено payment всего:", payments.length);
    process.exit(2);
  }

  if (!onMay5.length) {
    console.warn("Нет payment 5000 именно с датой 05.05 в sortAt/createdAt — удаляю последний payment на 5000 из выборки.");
  }

  const { paymentId, investorId } = pick;
  console.log("Цель:", { paymentId, investorId, amount: pick.amount, sortAt: pick.sortAt, createdAt: pick.createdAt });

  const delT0 = Date.now();
  let del = await fetch(`${base}/api/payments/${paymentId}`, {
    method: "DELETE",
    headers: { Cookie: `token=${token}` },
  });
  let delBody = await del.text();
  if (del.status === 503) {
    console.warn("DELETE 503 — пауза 2s и повтор (часто EMAXCONN/пул)");
    await new Promise((r) => setTimeout(r, 2000));
    del = await fetch(`${base}/api/payments/${paymentId}`, {
      method: "DELETE",
      headers: { Cookie: `token=${token}` },
    });
    delBody = await del.text();
  }
  const delMs = Date.now() - delT0;
  console.log(`DELETE /api/payments/${paymentId}:`, del.status, delMs + "ms", delBody.slice(0, 160));

  if (!del.ok) process.exit(3);

  const appliedAt = Date.now();
  let verifyMs = 0;
  let after = null;
  let still = true;
  for (let attempt = 1; attempt <= 5 && still; attempt += 1) {
    const verifyT0 = Date.now();
    after = await api(`/api/investors/operations-history?investorId=${investorId}`, token);
    verifyMs += Date.now() - verifyT0;
    if (!after.ok) {
      console.warn(
        `GET operations-history?investorId=${investorId}: попытка ${attempt}`,
        after.status,
        after.text?.slice(0, 120)
      );
      if (attempt < 5) await new Promise((r) => setTimeout(r, 2500));
      continue;
    }
    still = after.json?.items?.some((i) => i.kind === "payment" && i.paymentId === paymentId);
    console.log(`GET operations-history?investorId=${investorId}:`, after.status, "запись есть?", Boolean(still));
    if (still && attempt < 5) await new Promise((r) => setTimeout(r, 1500));
  }

  const confirmMs = Date.now() - appliedAt;
  const totalMs = Date.now() - totalStart;
  console.log("\n=== Итог замера ===");
  console.log(`Ответ DELETE (применилось на сервере): ${delMs}ms`);
  console.log(`До подтверждения в истории (GET 200, записи нет): ${confirmMs}ms (~${(confirmMs / 1000).toFixed(2)}s)`);
  console.log(`Суммарно запросы проверки: ${verifyMs}ms`);
  console.log(`Всего скрипт: ${totalMs}ms (~${(totalMs / 1000).toFixed(2)}s)`);
  if (still) {
    console.error("Проверка: payment всё ещё в истории или история недоступна");
    process.exit(4);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(9);
});
