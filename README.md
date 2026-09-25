# CivilBid 2.0 — Authenticated Starter
1
Civil construction estimating, bidding, field production, and cost intelligence platform.

## Included in this build

- Next.js 14 + TypeScript
- Supabase authentication using SSR cookie sessions
- Protected application routes through Next.js middleware
- Login and logout
- CivilBid profile / role lookup
- Role-aware navigation for Owner, Admin, Estimator, Project Manager, Foreman, and Read Only
- Existing CivilBid dashboard and module placeholders

## Required Vercel environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — use the Supabase publishable key already configured in Vercel

## Deployment

Upload/commit these files at the root of the existing `CivilBid-2.0` GitHub repository. Vercel should automatically redeploy from the commit. Do not upload this folder as an extra nested directory.

## Authentication test

1. Open the deployed site in a private/incognito window.
2. You should be redirected to `/login`.
3. Sign in with the Supabase Owner account created during setup.
4. You should be redirected to `/dashboard`.
5. The sidebar should show the user's CivilBid role and a Sign out button.
6. Sign out and verify the dashboard cannot be reopened without authentication.

## Security note

Application route protection improves the user experience and prevents unauthenticated access to the UI. Supabase Row Level Security remains the authoritative data-security boundary.

## Universal Items library
CivilBid uses a general `items` library rather than an NJDOT-only catalog. NJDOT is one source alongside county, municipal, utility, private, and company-custom items. Run `supabase/migrations/004_general_items.sql` after the initial database/security migrations on an existing CivilBid database.
