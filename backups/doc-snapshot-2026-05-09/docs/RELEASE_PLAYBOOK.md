# Release Playbook

This playbook is the operational standard for shipping safely to production.

## Branching

- `main`: production branch
- `staging`: integration + QA branch
- `feature/*`: development work

## Environments

- **Preview**: Vercel preview deployment from PRs, uses non-production env values.
- **Production**: Vercel production deployment from `main`.

## Required Vercel Environment Variables

- `DATABASE_URL`
- `DIRECT_URL`
- `JWT_SECRET`
- `NEXT_PUBLIC_APP_URL`

All variables must be stored in Vercel env store, never committed to git.

## Release Procedure

1. Merge feature branches into `staging`.
2. Run QA against Vercel Preview URL.
3. Confirm checklist:
   - auth/login works
   - dashboard, finance, reports open correctly
   - payout request status flow works end-to-end
4. Merge `staging` into `main`.
5. Validate production:
   - open `/login`
   - sign in as investor
   - verify finance and reports pages

## Rollback

If production has regression:

1. Open Vercel project -> Deployments.
2. Promote previous healthy deployment to Production.
3. Create hotfix branch from `main`.
4. Apply fix and repeat release procedure.

## Security Rules

- Rotate `JWT_SECRET` when team access changes or after suspected leak.
- Use least privilege roles for real users.
- Never store secrets in `.env` in git or screenshots/chat history.
