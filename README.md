# THAIINVEST v3.1.0

Private investment operations platform with role-based access, weekly accrual logic, and approval workflow for payouts.

## Current Release

- Product line: `v3.x`
- Current technical version: `3.1.0`
- Status: `build` and `lint` are green

## Core Stack

- Next.js 16 (App Router)
- React 19 + TypeScript
- Prisma + PostgreSQL
- Zod validation
- React Query
- Tailwind CSS 4

## Access Model

- `OWNER` - business owner (Semen)
- `SUPER_ADMIN` - operational control and force-actions

## Main Screens

- `/login` - premium login, private access
- `/dashboard` - information-only overview
- `/dashboard/manage` - operational actions and calculation tools
- `/dashboard/profile` - account information and credentials update

## Key API Endpoints

- `/api/auth/login`, `/api/auth/me`, `/api/auth/account`, `/api/auth/logout`
- `/api/investors`
- `/api/investors/[id]/weekly-ledger`
- `/api/payments`
- `/api/system/business-rate`
- `/api/system/readiness`

## Environment

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

Required variables:

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | Runtime DB URL (recommended: Supabase pooler URL) |
| `DIRECT_URL` | Yes (recommended) | Direct DB URL for Prisma CLI and migrations |
| `JWT_SECRET` | Yes | JWT signing key |
| `NEXT_PUBLIC_APP_URL` | Yes | Public app URL |

After schema changes:

```bash
npx prisma migrate dev
```

For production migration:

```bash
npm run db:migrate:deploy
```

## App theme (localStorage)

Palette and light/dark mode are stored under `app-theme` and `app-dark-mode` and applied to `<html>`. Shared logic lives in `lib/app-theme.ts` so `/login` and dashboard `ThemeToggle` stay in sync.

## Local Run

1. Install dependencies:

```bash
npm install
```

2. Start dev server:

```bash
npm run dev
```

3. Open:

- Desktop: `http://localhost:3000/login`
- Phone in same LAN: `http://<your-local-ip>:3000/login`

> Important: disable VPN on phone/desktop for local network testing.

## Supabase + Vercel (production)

1. Create a Supabase project and collect 2 URLs:
   - pooler URL -> `DATABASE_URL`
   - direct URL -> `DIRECT_URL`
2. In Vercel project settings, add env vars:
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `JWT_SECRET`
   - `NEXT_PUBLIC_APP_URL`
3. Build command on Vercel:

```bash
npm run build:vercel
```

4. Deploy and verify:
   - `/login` works
   - investor can open `/dashboard`, `/dashboard/finance`, `/dashboard/reports`
   - create payout request and validate status flow

## Professional Delivery Flow (recommended)

Use this branch model:

- `main` - production only
- `staging` - pre-production testing
- `feature/*` - regular development branches

Recommended process:

1. Create `feature/*` branch and implement changes.
2. Open PR into `staging` and verify Vercel Preview + manual QA.
3. Merge `staging` -> `main` only when QA is green.
4. Production auto-deploys from `main`.

Vercel project setup:

- Production branch: `main`
- Preview deployments: enabled (default)
- Environment variables split by target:
  - `Production`: real DB/secrets
  - `Preview`: isolated staging DB/secrets

GitHub protection rules:

- Protect `main` and require PR (no direct pushes)
- Require CI checks to pass
- Optional: require 1 approving review

## Release Checklist (copy for every release)

- [ ] `npm run lint` is clean (or only accepted warnings)
- [ ] `npm run build` passes locally
- [ ] Critical flows tested:
  - [ ] login/logout
  - [ ] dashboard + finance + reports
  - [ ] payout request flow
  - [ ] investor card flow
- [ ] Preview URL tested on mobile
- [ ] `JWT_SECRET` and DB envs exist only in Vercel env store
- [ ] Merge to `main` and verify production `/login` = 200
- [ ] Smoke test with real user account

## Remote access (different cities, while still running on your PC)

If people are **not on the same Wi‑Fi**, the reliable “always on” setup is:

1. Install **Tailscale** on your PC (host) and on each remote device (Semen / investor phones/laptops).
2. Put all devices into the same Tailscale network (same Tailscale account / invited users).
3. On the host PC, run production mode (more stable than dev for long‑running remote use):

```bash
npm run build
npm run start:remote
```

4. On a remote device, open:

- `http://<tailscale-ip-of-host-pc>:3000/login`

Notes:

- Your host PC must stay awake (disable sleep on AC power) or remote access will “disappear”.
- `npm run start:remote` binds `next start` to `0.0.0.0:3000` so it is reachable from other Tailscale devices.
- Later, when you move to a cheap VPS, you keep the same app commands; only the machine changes.

## Quality and Build

```bash
npm run lint
npm run build
```

If the repo is on GitHub, push triggers **CI** (`.github/workflows/ci.yml`): `npm ci`, `lint`, and `build`.

## Cleanup (cache/artifacts)

```bash
npm run clean
```

Removes local build artifacts:

- `.next`
- `tsconfig.tsbuildinfo`

## Notes

- `node_modules` is the largest folder in local dev and this is expected.
- If `3000` is busy, stop stale `node.exe` processes and restart `npm run dev`.
