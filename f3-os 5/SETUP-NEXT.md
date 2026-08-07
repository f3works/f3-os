# F3 OS — Production Auth Setup

## 1. Run the database setup
In the separate Supabase project, open **SQL Editor → New query** and paste/run:

`supabase/setup.sql`

This creates the F3/client permissions, Sueños workspace, proofing tables, private file buckets and approval functions.

## 2. Configure Auth URLs
In **Supabase → Authentication → URL Configuration**:

- Site URL: `https://f3-os.netlify.app`
- Redirect URL: `https://f3-os.netlify.app/**`

## 3. Create the first two Auth users
In **Supabase → Authentication → Users** create or invite:

- `jason@f3works.com`
- `jasontexasranger@gmail.com`

The SQL has already pre-authorized these emails. The Auth trigger automatically makes the first user F3 staff and the second user the Sueños client approver.

For password login, use **Invite user** and let the user set a password. Sueños also allows Magic Link because its client `auth_method` is `both`.

## 4. Netlify environment variables
Already expected on the Netlify site:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (or `VITE_SUPABASE_PUBLISHABLE_KEY`)

The Netlify build runs `node scripts/build-config.mjs` and writes a browser-safe `env.js` during deployment.

## 5. Client login URL
Sueños workspace:

`https://f3-os.netlify.app/?workspace=suenos-tequila`

The workspace setting controls which sign-in choices the client sees: password, magic link, or both.

## 6. First real workflow
Sign in as F3 → **Proofs → Send proof** → choose Sueños → upload image/PDF → client signs in → comments / requests changes / approves.

A new creative version supersedes the previous approval record as the current sign-off, while preserving the historical decision.
