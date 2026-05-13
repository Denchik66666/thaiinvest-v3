/**
 * Только `.env` из корня репозитория (без `.env.local`), чтобы Prisma/скрипты ходили в прод (Supabase).
 * Импортируйте первой строкой скрипта: `import "./load-prod-env-only";`
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
if (fs.existsSync(envPath)) {
  const parsed = dotenv.parse(fs.readFileSync(envPath, "utf8"));
  for (const [k, v] of Object.entries(parsed)) {
    process.env[k] = v;
  }
}
