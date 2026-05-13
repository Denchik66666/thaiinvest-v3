import path from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

// Одноразовый файл (например `.env.vercel.pull`) — для `prisma migrate deploy` в облако без перезаписи из `.env.local`.
const migrateEnvFile = process.env.THAIINVEST_MIGRATE_ENV_FILE;
if (migrateEnvFile) {
  dotenv.config({ path: path.isAbsolute(migrateEnvFile) ? migrateEnvFile : path.join(process.cwd(), migrateEnvFile) });
} else {
  // Сначала `.env`, затем `.env.local` поверх — удобно: Supabase в `.env`, локальный Postgres в `.env.local`.
  dotenv.config({ path: ".env" });
  dotenv.config({ path: ".env.local", override: true });
}

export default defineConfig({
  schema: "./prisma/schema.prisma",
  migrations: {
    path: "./prisma/migrations",
    seed: "tsx ./prisma/seed.ts",
  },
  datasource: {
    // Для Supabase миграции лучше через DIRECT_URL (не pooler). Локально — обычный DATABASE_URL в `.env.local`.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
  },
});