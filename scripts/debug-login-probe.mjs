const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const users = ["admin", "semen", "Sega_55RUS"];
const passwords = ["admin123", "18121985", "12345678", "password", "qwerty123"];

async function tryLogin(username, password, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      signal: controller.signal,
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

for (const user of users) {
  for (const password of passwords) {
    const result = await tryLogin(user, password);
    if (result.ok) {
      console.log(`OK ${user} ${password}`);
      process.exit(0);
    }
    console.log(`NO ${user} ${password} ${result.status}${result.error ? ` ${result.error}` : ""}`);
  }
}

process.exit(1);
