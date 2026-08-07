deployment refresh

# F3 OS

A portable starter for F3 Works' external-client operating system.

## Included in this first build

- Dashboard
- Client CRM cards
- Project kanban
- Creative approval register
- Campaign register
- Billing dashboard
- Connected-account tracker
- Add-client, add-project, add-proof and add-campaign forms
- Initial Supabase schema with RLS enabled
- Netlify configuration and security headers

The current UI uses in-browser demo data. Nothing is sent to any existing account.

## Run locally

Because this starter has no build dependencies, open `index.html` in a browser or run any static server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Deploy to your separate Netlify account

1. Create a new GitHub repository in the account you want to use.
2. Upload this folder or push it with Git.
3. In the correct Netlify account, choose **Add new site → Import an existing project**.
4. Select the repository.
5. Leave the build command blank and set the publish directory to `.`.

## Connect your separate Supabase project

1. Create a new Supabase project in the correct account.
2. Review and run `supabase/migrations/001_initial_schema.sql` in the SQL editor.
3. Add your project URL and publishable key to Netlify environment variables.
4. The next build phase will replace demo arrays in `app.js` with authenticated Supabase queries.

## Important security note

The schema enables RLS. Only the initial policies are included. Do not expose real client data until policies have been completed and tested for every table.

## Planned next phase

- Supabase authentication
- Real client CRUD
- Organization setup
- Team and client roles
- File uploads
- Proof links and approval audit trail

## Client portal prototype

The starter now opens with a role selector so both sides can be tested:

- **F3 Team** opens the internal agency control room.
- **Client** opens a branded client portal with proofs, comments, revision requests, approval, work status, results, files and a work-request form.

This selector is demo-only. When Supabase is connected it should be replaced by Supabase Auth and role routing based on `organization_members` and `client_members`.

Apply migrations in order. Migration `002_client_portal.sql` adds client memberships, proof comments, client requests, private creative storage and row-level access policies. Test all RLS policies in a staging project before using real client files.
