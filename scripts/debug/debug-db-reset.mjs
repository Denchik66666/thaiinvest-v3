const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const USERNAME = process.env.RESET_USER || "Den";
const PASSWORD = process.env.RESET_USER_PASSWORD || "admin123";
const RESET_PASSWORD = process.env.RESET_PASSWORD || "18121985";

async function login(username, password) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  const rawCookie = res.headers.get("set-cookie") || "";
  const tokenPair = rawCookie.split(";").find((p) => p.trim().startsWith("token="));
  return { ok: res.ok, status: res.status, data, cookie: tokenPair?.trim() ?? "" };
}

async function api(path, cookie, method = "GET", body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Cookie: cookie,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

function printStep(name, result) {
  console.log(`\n=== ${name} ===`);
  console.log("ok:", result.ok, "status:", result.status);
  console.log("data:", JSON.stringify(result.data, null, 2));
}

async function run() {
  const auth = await login(USERNAME, PASSWORD);
  printStep("login", auth);
  if (!auth.ok || !auth.cookie) {
    process.exit(1);
  }

  const before = await api("/api/admin/database-reset/status", auth.cookie);
  printStep("status_before", before);

  const save = await api("/api/admin/database-reset/password", auth.cookie, "POST", { password: RESET_PASSWORD });
  printStep("save_password", save);

  const after = await api("/api/admin/database-reset/status", auth.cookie);
  printStep("status_after", after);

  const execute = await api("/api/admin/database-reset/execute", auth.cookie, "POST", {
    password: RESET_PASSWORD,
    confirmPhrase: "УДАЛИТЬ",
  });
  printStep("execute", execute);
}

run().catch((e) => {
  console.error("debug-db-reset failed", e);
  process.exit(1);
});
