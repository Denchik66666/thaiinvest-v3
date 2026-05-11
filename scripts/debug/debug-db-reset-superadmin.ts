import { prisma } from "@/lib/prisma";
import { generateToken } from "@/lib/auth";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const RESET_PASSWORD = process.env.RESET_PASSWORD || "18121985";

async function api(path: string, token: string, method = "GET", body?: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Cookie: `token=${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

function printStep(name: string, result: { ok: boolean; status: number; data: unknown }) {
  console.log(`\n=== ${name} ===`);
  console.log("ok:", result.ok, "status:", result.status);
  console.log("data:", JSON.stringify(result.data, null, 2));
}

async function run() {
  const superAdmin = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN", isArchived: false },
    select: { id: true, username: true, role: true },
  });
  if (!superAdmin) {
    throw new Error("SUPER_ADMIN user not found");
  }

  const token = generateToken({
    userId: superAdmin.id,
    username: superAdmin.username,
    role: superAdmin.role,
  });

  console.log("acting as:", superAdmin.username, `#${superAdmin.id}`);

  const before = await api("/api/admin/database-reset/status", token);
  printStep("status_before", before);

  const save = await api("/api/admin/database-reset/password", token, "POST", {
    password: RESET_PASSWORD,
  });
  printStep("save_password", save);

  const afterSave = await api("/api/admin/database-reset/status", token);
  printStep("status_after_save", afterSave);

  const execute = await api("/api/admin/database-reset/execute", token, "POST", {
    password: RESET_PASSWORD,
    confirmPhrase: "УДАЛИТЬ",
  });
  printStep("execute", execute);
}

run()
  .catch((e) => {
    console.error("debug-db-reset-superadmin failed", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
