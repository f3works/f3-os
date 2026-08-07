# F3 OS

Agency operating system for F3 Strategy.

Current production milestone: real Supabase authentication, separate staff/client permissions, per-client password or magic-link login configuration, private proof uploads, client comments, revision requests, final version sign-off and client requests.

## Deploy
Netlify is configured by `netlify.toml`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Netlify environment variables. The build creates `env.js` at deploy time.

## Database
Run `supabase/setup.sql` once in a new Supabase project. Then follow `SETUP-NEXT.md`.

## Client workspace
`/?workspace=<client-slug>`

Initial test workspace: `/?workspace=suenos-tequila`
