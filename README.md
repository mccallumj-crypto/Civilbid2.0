# CivilBid Cloud v1

Cloud/PWA client for the Supabase schema already installed in your CivilBid project.

## What this build already does
- Supabase email/password login
- Loads only projects allowed by Row Level Security
- Foreman daily reports
- Production by estimate/pay item
- Labor hours by employee + pay item
- Equipment hours by machine + pay item
- Private photo/PDF/ticket uploads
- Submit report for manager review
- Installable PWA shell (Add to Home Screen)

## 1. Apply Storage RLS
Open Supabase > SQL Editor and run `storage_policies.sql` once.

## 2. Find your two browser-safe Supabase values
Supabase Dashboard > Project Settings / API (or Connect):
- Project URL
- Publishable key (or legacy anon public key)

DO NOT use the service_role key in this app.

## 3. Local test
Copy `.env.example` to `.env.local` and fill in:

VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...

Then:

npm install
npm run dev

Open the URL Vite prints.

## 4. Deploy on Vercel
Recommended flow:
1. Create a private GitHub repository and put these project files in it.
2. In Vercel choose New Project and import that repository.
3. Vercel should detect Vite automatically.
4. Add environment variables:
   - VITE_SUPABASE_URL
   - VITE_SUPABASE_ANON_KEY
5. Deploy.

Vite variables must start with `VITE_` to be available in the browser build. The Supabase publishable/anon key is intended for browser use when RLS is enabled. Never add a Supabase service_role key to a VITE_ variable.

## 5. Crew accounts
For this first cloud build, create crew Auth accounts in Supabase Authentication. Then add each user to `company_memberships` and assign foremen to projects in `project_assignments`.

The next CivilBid build should add an admin invitation screen backed by a Supabase Edge Function, so you never need to manage foremen manually in the Supabase dashboard.

## Notes
- This is an early production-transition build. Test it with a small group before relying on it as the sole record system.
- The PWA service worker caches the application shell only. Full offline report synchronization is the next field reliability feature.
