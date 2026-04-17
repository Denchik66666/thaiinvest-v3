import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: './prisma/schema.prisma',
  migrations: {
    path: './prisma/migrations',
    seed: 'tsx ./prisma/seed.ts',
  },
  datasource: {
    // For Supabase/Vercel: DIRECT_URL is preferred for migrations/CLI.
    // Fallback to DATABASE_URL for local/simple setups.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
  },
})