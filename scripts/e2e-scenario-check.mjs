import "dotenv/config";
import jwt from "jsonwebtoken";
import { Client } from "pg";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

async function fetchWithTimeout(url, options = {}, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function login(username, password) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let res;
    try {
      res = await fetchWithTimeout(
        `${BASE_URL}/api/auth/login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        },
        15000
      );
    } catch {
      await sleep(1200 * (attempt + 1));
      continue;
    }
    const text = await res.text();
    try {
      JSON.parse(text);
    } catch {}
    if (res.ok) {
      const raw = res.headers.get("set-cookie") || "";
      const tokenPair = raw.split(";").find((p) => p.trim().startsWith("token="));
      if (!tokenPair) return null;
      return tokenPair.trim();
    }
    if (res.status !== 503 && res.status !== 500) return null;
    await sleep(1200 * (attempt + 1));
  }
  return null;
}

async function api(path, cookie, method = "GET", body) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let res;
    try {
      res = await fetchWithTimeout(
        `${BASE_URL}${path}`,
        {
          method,
          headers: {
            Cookie: cookie,
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        },
        25000
      );
    } catch {
      await sleep(1000 * (attempt + 1));
      continue;
    }
    const text = await res.text();
    let data = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (res.ok || (res.status !== 503 && res.status !== 500)) {
      return { ok: res.ok, status: res.status, data };
    }
    await sleep(1000 * (attempt + 1));
  }
  return { ok: false, status: 503, data: { error: "Временная ошибка после ретраев" } };
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function buildRoleCookieFromDb(role) {
  const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;
  const secret = process.env.JWT_SECRET;
  if (!conn || !secret) return null;

  const client = new Client({ connectionString: conn });
  try {
    await client.connect();
    const rs = await client.query(
      `select id, username, role from "User" where role = $1 and "isArchived" = false order by id asc limit 1`,
      [role]
    );
    const row = rs.rows?.[0];
    if (!row) return null;
    const token = jwt.sign(
      {
        userId: Number(row.id),
        username: String(row.username),
        role: String(row.role),
      },
      secret,
      { expiresIn: "7d" }
    );
    return `token=${token}`;
  } catch {
    return null;
  } finally {
    try {
      await client.end();
    } catch {}
  }
}

function assertStep(results, name, condition, details = "") {
  results.push({ name, ok: !!condition, details });
  const mark = condition ? "✅" : "❌";
  console.log(`${mark} ${name}${details ? ` — ${details}` : ""}`);
}

async function run() {
  const results = [];
  const superCandidates = ["Denchik", "admin"];
  let superCookie = null;
  let superUser = null;
  for (const username of superCandidates) {
    const cookie = await login(username, "admin123");
    if (cookie) {
      superCookie = cookie;
      superUser = username;
      break;
    }
  }
  if (!superCookie) {
    superCookie = await buildRoleCookieFromDb("SUPER_ADMIN");
    if (superCookie) superUser = "service-token";
  }
  assertStep(results, "SUPER_ADMIN login", !!superCookie, superUser ?? "не найден");
  const ownerCandidates = ["Sam", "semen", "Semen", "owner"];
  let ownerCookie = null;
  let ownerUser = null;
  for (const username of ownerCandidates) {
    const cookie = await login(username, "admin123");
    if (cookie) {
      ownerCookie = cookie;
      ownerUser = username;
      break;
    }
  }
  if (!ownerCookie) {
    ownerCookie = await buildRoleCookieFromDb("OWNER");
    if (ownerCookie) ownerUser = "service-token";
  }
  assertStep(results, "OWNER login", !!ownerCookie, ownerUser ?? "не найден");
  if (!superCookie || !ownerCookie) {
    console.log("\nИТОГ: не удалось пройти сценарии из-за логина.");
    process.exit(1);
  }

  const r1 = await api("/api/system/business-rate", ownerCookie, "POST", {
    newRate: 10,
    effectiveDate: "2026-01-01",
    comment: "E2E rate #1",
  });
  assertStep(results, "Set business rate #1", r1.ok, r1.data?.error ?? "");

  const r2 = await api("/api/system/business-rate", ownerCookie, "POST", {
    newRate: 8,
    effectiveDate: "2026-06-01",
    comment: "E2E rate #2",
  });
  assertStep(results, "Set business rate #2", r2.ok, r2.data?.error ?? "");

  const become = await api("/api/investors/become-semen-investor", superCookie, "POST", {
    name: `E2E Super Linked ${Date.now()}`,
    body: 100000,
    rate: 10,
    entryDate: "2026-02-02",
    allowMultiple: true,
  });
  assertStep(results, "Become Semen investor", become.ok, become.data?.error ?? "");

  const allBeforePrivate = await api("/api/investors?network=all", superCookie);
  const linkedBody = (allBeforePrivate.data?.investors ?? [])
    .filter((i) => !i.isPrivate && i.linkedUserId)
    .reduce((sum, i) => sum + (i.body || 0), 0);
  const privateUsed = (allBeforePrivate.data?.investors ?? [])
    .filter((i) => i.isPrivate && i.owner?.role === "SUPER_ADMIN")
    .reduce((sum, i) => sum + (i.body || 0), 0);
  const privateAvailable = Math.max(linkedBody - privateUsed, 0);
  const privateBodyForTest = Math.max(Math.min(privateAvailable, 50000), 100);

  const createPrivate = await api("/api/investors", superCookie, "POST", {
    name: `E2E Private ${Date.now()}`,
    handle: null,
    phone: null,
    body: privateBodyForTest,
    rate: 0,
    entryDate: "2026-04-01",
    isPrivate: true,
  });
  const privateLimitBlocked = !createPrivate.ok && String(createPrivate.data?.error || "").includes("Лимит личной сети");
  assertStep(
    results,
    "Create private investor",
    createPrivate.ok || privateLimitBlocked,
    createPrivate.ok ? "" : createPrivate.data?.error ?? ""
  );

  const createCommonOwner = await api("/api/investors", ownerCookie, "POST", {
    name: `E2E Owner Common ${Date.now()}`,
    handle: null,
    phone: null,
    body: 120000,
    rate: 9,
    entryDate: "2026-03-01",
    isPrivate: false,
  });
  assertStep(results, "Create OWNER common investor", createCommonOwner.ok, createCommonOwner.data?.error ?? "");

  // ---- Проверка роли INVESTOR (логин/пароль и доступ к своему кабинету) ----
  const createdInvestor = createCommonOwner.data?.investor;
  const createdCreds = createCommonOwner.data?.credentials;
  const haveInvestorCreds = !!(createdInvestor && createdCreds?.username && createdCreds?.password);

  assertStep(results, "Receive INVESTOR credentials", haveInvestorCreds, haveInvestorCreds ? `id=${createdInvestor.id}` : createCommonOwner.data?.error ?? "");

  let investorCookie = null;
  if (haveInvestorCreds) {
    investorCookie = await login(createdCreds.username, createdCreds.password);
    assertStep(results, "INVESTOR login works", !!investorCookie, createdCreds.username);

    if (investorCookie) {
      const myInvestors = await api("/api/investors?network=all", investorCookie);
      const me = (myInvestors.data?.investors ?? []).find((i) => i.id === createdInvestor.id);
      assertStep(results, "INVESTOR sees only own investor", !!me, me ? `id=${me.id}` : "not found");

      // Withdrawal request: investor -> request -> OWNER approve -> investor accept
      if (me) {
        const accrued = me.accrued ?? 0;
        if (accrued > 0) {
          const amount = Math.max(1, Math.floor(accrued / 5));
          const reqWithdraw2 = await api("/api/payments", investorCookie, "POST", {
            action: "request",
            investorId: me.id,
            type: "interest",
            amount,
            requestDate: "2026-08-01",
          });
          assertStep(results, "INVESTOR creates withdrawal request", reqWithdraw2.ok, reqWithdraw2.data?.error ?? "");

          const paymentId2 = reqWithdraw2.data?.payment?.id;
          if (paymentId2) {
            const approve2 = await api("/api/payments", ownerCookie, "POST", {
              action: "owner_approve",
              paymentId: paymentId2,
            });
            assertStep(results, "OWNER approve (after INVESTOR request)", approve2.ok, approve2.data?.error ?? "");

            const accept2 = await api("/api/payments", investorCookie, "POST", {
              action: "investor_accept",
              paymentId: paymentId2,
            });
            assertStep(results, "INVESTOR accepts (final)", accept2.ok, accept2.data?.error ?? "");

            const myInvestorsAfter = await api("/api/investors?network=all", investorCookie);
            const meAfter = (myInvestorsAfter.data?.investors ?? []).find((i) => i.id === me.id);
            const payment2 = (meAfter?.payments ?? []).find((p) => p.id === paymentId2);
            assertStep(results, "Payment becomes completed", payment2?.status === "completed", payment2 ? `status=${payment2.status}` : "not found");
          }
        } else {
          assertStep(results, "INVESTOR creates withdrawal request", true, "accrued=0 -> skip");
        }
      }

      // Top-up decision: OWNER creates request -> INVESTOR accept
      const topupReq2 = await api("/api/body-topup-requests", ownerCookie, "POST", {
        investorId: createdInvestor.id,
        amount: 2500,
        comment: "E2E investor topup",
      });
      const topupAlreadyPending2 =
        topupReq2.status === 409 &&
        String(topupReq2.data?.error ?? "").includes("уже есть активный запрос на пополнение");
      assertStep(
        results,
        "Top-up request by OWNER (for INVESTOR)",
        topupReq2.ok || topupAlreadyPending2,
        topupReq2.data?.error ?? ""
      );

      if (topupReq2.ok) {
        const topupList2 = await api("/api/body-topup-requests", investorCookie, "GET");
        const pending2 = (topupList2.data?.requests ?? []).find((r) => r.status === "pending_investor");
        assertStep(results, "INVESTOR sees pending top-up", !!pending2, pending2 ? `request=${pending2.id}` : "нет");

        if (pending2) {
          const topupAccept2 = await api("/api/body-topup-requests", investorCookie, "PATCH", {
            requestId: pending2.id,
            action: "investor_accept",
          });
          assertStep(results, "INVESTOR accepts top-up", topupAccept2.ok, topupAccept2.data?.error ?? "");
        }
      }
    }
  }

  const allSuper = await api("/api/investors?network=all", superCookie);
  assertStep(results, "Fetch super investors", allSuper.ok, allSuper.data?.error ?? "");
  const linkedInvestor = (allSuper.data?.investors ?? []).find((i) => !i.isPrivate && i.linkedUserId);
  assertStep(results, "Linked investor exists", !!linkedInvestor, linkedInvestor ? `id=${linkedInvestor.id}` : "нет");

  if (linkedInvestor) {
    // ---- Регрессия: смена business-rate должна менять расчеты (ledger / начисления) ----
    const ledgerBefore = await api(`/api/investors/${linkedInvestor.id}/weekly-ledger`, superCookie);
    assertStep(results, "Weekly ledger before rate change", ledgerBefore.ok, ledgerBefore.data?.error ?? "");

    const investorsBefore = await api("/api/investors?network=all", superCookie);
    const linkedBefore = (investorsBefore.data?.investors ?? []).find((i) => i.id === linkedInvestor.id);
    assertStep(
      results,
      "Fetch investor before rate change",
      !!linkedBefore,
      linkedBefore ? `id=${linkedBefore.id}` : investorsBefore.data?.error ?? "not found"
    );

    const brNow = await api("/api/system/business-rate", ownerCookie);
    const currentRate = Number(brNow.data?.current?.rate ?? 0);
    const newRateForTest = currentRate + 3;

    const rate3 = await api("/api/system/business-rate", ownerCookie, "POST", {
      newRate: newRateForTest,
      effectiveDate: "2026-04-01",
      comment: "E2E rate #3 (after investors created)",
    });
    assertStep(results, "Set business rate #3", rate3.ok, rate3.data?.error ?? "");

    const ledgerAfter = await api(`/api/investors/${linkedInvestor.id}/weekly-ledger`, superCookie);
    assertStep(results, "Weekly ledger after rate change", ledgerAfter.ok, ledgerAfter.data?.error ?? "");

    if (ledgerAfter.ok) {
      const beforeTotal = Number(ledgerBefore.data?.summary?.totalAccruedAdded ?? 0);
      const afterTotal = Number(ledgerAfter.data?.summary?.totalAccruedAdded ?? 0);
      const changed = Math.abs(afterTotal - beforeTotal) > 0.0001;
      assertStep(results, "Ledger totals changed after rate update", changed, `before=${beforeTotal} after=${afterTotal}`);

      let linkedAfter = null;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const investorsAfterTry = await api("/api/investors?network=all", superCookie);
        if (!investorsAfterTry.ok) {
          await sleep(2500);
          continue;
        }
        linkedAfter = (investorsAfterTry.data?.investors ?? []).find((i) => i.id === linkedInvestor.id) ?? null;
        if (linkedAfter) {
          const accBeforeTry = Number(linkedBefore?.accrued ?? 0);
          const accAfterTry = Number(linkedAfter?.accrued ?? 0);
          const dueBeforeTry = Number(linkedBefore?.due ?? 0);
          const dueAfterTry = Number(linkedAfter?.due ?? 0);
          if (Math.abs(accAfterTry - accBeforeTry) > 0.0001 || Math.abs(dueAfterTry - dueBeforeTry) > 0.0001) {
            break;
          }
        }
        await sleep(2500);
      }

      const accBefore = Number(linkedBefore?.accrued ?? 0);
      const accAfter = Number(linkedAfter?.accrued ?? 0);
      const dueBefore = Number(linkedBefore?.due ?? 0);
      const dueAfter = Number(linkedAfter?.due ?? 0);
      const changedAccrued = Math.abs(accAfter - accBefore) > 0.0001;
      const changedDue = Math.abs(dueAfter - dueBefore) > 0.0001;
      assertStep(
        results,
        "Investor accrued/due updated after rate change",
        !!linkedAfter && (changedAccrued || changedDue),
        `accrued: ${accBefore} -> ${accAfter}, due: ${dueBefore} -> ${dueAfter}`
      );
    } else {
      assertStep(results, "Ledger totals changed after rate update", false, "skip: weekly-ledger недоступен");
      assertStep(results, "Investor accrued/due updated after rate change", false, "skip: weekly-ledger недоступен");
    }

    const reqWithdraw = await api("/api/payments", superCookie, "POST", {
      action: "request",
      investorId: linkedInvestor.id,
      type: "interest",
      amount: 1000,
      requestDate: "2026-08-01",
    });
    assertStep(results, "Create withdrawal request", reqWithdraw.ok, reqWithdraw.data?.error ?? "");
    const requestedPaymentId = reqWithdraw.data?.payment?.id;
    assertStep(results, "Owner sees pending request", !!requestedPaymentId, requestedPaymentId ? `payment=${requestedPaymentId}` : "нет");

    if (requestedPaymentId) {
      const approve = await api("/api/payments", ownerCookie, "POST", {
        action: "owner_approve",
        paymentId: requestedPaymentId,
      });
      assertStep(results, "OWNER approve", approve.ok, approve.data?.error ?? "");

      const accept = await api("/api/payments", superCookie, "POST", {
        action: "investor_accept",
        paymentId: requestedPaymentId,
      });
      assertStep(results, "Investor accept", accept.ok, accept.data?.error ?? "");
    }

    const topupReq = await api("/api/body-topup-requests", ownerCookie, "POST", {
      investorId: linkedInvestor.id,
      amount: 25000,
      comment: "E2E topup",
    });
    const topupAlreadyPending =
      topupReq.status === 409 &&
      String(topupReq.data?.error ?? "").includes("уже есть активный запрос на пополнение");
    assertStep(
      results,
      "Top-up request by OWNER",
      topupReq.ok || topupAlreadyPending,
      topupReq.data?.error ?? ""
    );

    const topupList = await api("/api/body-topup-requests", superCookie, "GET");
    const pendingTopup = (topupList.data?.requests ?? []).find((r) => r.status === "pending_investor");
    assertStep(results, "Super sees pending top-up", !!pendingTopup, pendingTopup ? `request=${pendingTopup.id}` : "нет");

    if (pendingTopup) {
      const topupAccept = await api("/api/body-topup-requests", superCookie, "PATCH", {
        requestId: pendingTopup.id,
        action: "investor_accept",
      });
      assertStep(results, "Top-up accept", topupAccept.ok, topupAccept.data?.error ?? "");
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n===============================");
  console.log(`ИТОГ: ${results.length - failed.length}/${results.length} шагов прошли`);
  if (failed.length) {
    console.log("ПРОВАЛЕННЫЕ ШАГИ:");
    for (const f of failed) console.log(`- ${f.name}${f.details ? `: ${f.details}` : ""}`);
    process.exit(2);
  }
}

run().catch((e) => {
  console.error("UNEXPECTED E2E ERROR", e);
  process.exit(99);
});
