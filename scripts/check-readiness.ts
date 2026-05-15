import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });

const base = process.env.BASE_URL ?? "http://127.0.0.1:3000";

async function main() {
  const login = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "Den", password: "admin123" }),
  });
  const cookie = login.headers.get("set-cookie") ?? "";
  const m = /token=([^;]+)/.exec(cookie);
  if (!m) {
    console.error("login failed:", login.status, await login.text());
    process.exit(1);
  }
  const token = m[1];

  const res = await fetch(`${base}/api/system/readiness`, {
    headers: { Cookie: `token=${token}` },
  });
  console.log("readiness", res.status, await res.text());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

