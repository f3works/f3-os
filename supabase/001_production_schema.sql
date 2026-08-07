-- F3 OS production schema
-- Intended for a NEW Supabase project.
-- Run once in Supabase SQL Editor, then create/invite the two initial Auth users.

create extension if not exists pgcrypto;

create type public.f3_user_type as enum ('staff', 'client');
create type public.client_status as enum ('prospect', 'onboarding', 'active', 'paused', 'closed');
create type public.client_auth_method as enum ('password', 'magic_link', 'both');
create type public.project_status as enum ('briefing', 'production', 'client_review', 'ready', 'complete', 'archived');
create type public.approval_status as enum ('draft', 'waiting', 'changes_requested', 'approved');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  user_type public.f3_user_type not null default 'client',
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status public.client_status not null default 'onboarding',
  auth_method public.client_auth_method not null default 'both',
  primary_contact_name text,
  primary_contact_email text,
  monthly_value numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Public-safe login configuration only. No emails or client data live here.
create table public.workspace_login (
  client_id uuid primary key references public.clients(id) on delete cascade,
  slug text not null unique,
  display_name text not null,
  auth_method public.client_auth_method not null default 'both',
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.client_members (
  client_id uuid not null references public.clients(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  can_approve boolean not null default false,
  is_billing_contact boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (client_id, user_id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  brief text,
  status public.project_status not null default 'briefing',
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.creative_assets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.creative_versions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.creative_assets(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  storage_path text not null,
  mime_type text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(asset_id, version_number)
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  creative_version_id uuid not null references public.creative_versions(id) on delete cascade,
  status public.approval_status not null default 'draft',
  requested_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  feedback text,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  unique(creative_version_id)
);

create table public.approval_comments (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid not null references public.approvals(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.client_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  details text not null,
  desired_date date,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  platform text not null,
  platform_campaign_id text,
  media_budget numeric(12,2) not null default 0,
  management_fee numeric(12,2) not null default 0,
  spend numeric(12,2) not null default 0,
  results_count integer not null default 0,
  status text not null default 'planning',
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  invoice_number text not null unique,
  amount numeric(12,2) not null,
  status text not null default 'draft',
  due_date date,
  external_accounting_id text,
  created_at timestamptz not null default now()
);

create table public.platform_connections (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  platform text not null,
  account_name text,
  external_account_id text,
  connection_status text not null default 'not_connected',
  native_dashboard_url text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

-- Used only to map invited Auth users into F3/client permissions automatically.
create table public.pending_access (
  email text primary key,
  full_name text,
  user_type public.f3_user_type not null,
  client_id uuid references public.clients(id) on delete cascade,
  can_approve boolean not null default false,
  is_billing_contact boolean not null default false,
  created_at timestamptz not null default now()
);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.user_type = 'staff'
  );
$$;

create or replace function private.is_client_member(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.client_members cm
    where cm.client_id = target_client_id and cm.user_id = (select auth.uid())
  );
$$;

create or replace function private.can_approve(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.client_members cm
    where cm.client_id = target_client_id
      and cm.user_id = (select auth.uid())
      and cm.can_approve = true
  );
$$;

revoke all on function private.is_staff() from public;
revoke all on function private.is_client_member(uuid) from public;
revoke all on function private.can_approve(uuid) from public;
grant execute on function private.is_staff() to authenticated;
grant execute on function private.is_client_member(uuid) to authenticated;
grant execute on function private.can_approve(uuid) to authenticated;

-- New Auth users are given a profile and any pre-authorized F3/client access.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending public.pending_access%rowtype;
begin
  select * into pending
  from public.pending_access
  where lower(email) = lower(new.email)
  limit 1;

  insert into public.profiles (id, email, full_name, user_type)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(pending.full_name, new.raw_user_meta_data ->> 'full_name'),
    coalesce(pending.user_type, 'client'::public.f3_user_type)
  )
  on conflict (id) do nothing;

  if pending.client_id is not null then
    insert into public.client_members (client_id, user_id, can_approve, is_billing_contact)
    values (pending.client_id, new.id, pending.can_approve, pending.is_billing_contact)
    on conflict (client_id, user_id) do update
      set can_approve = excluded.can_approve,
          is_billing_contact = excluded.is_billing_contact;
  end if;

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure private.handle_new_user();

-- Keep public-safe workspace settings synchronized with client settings.
create or replace function private.sync_workspace_login()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workspace_login (client_id, slug, display_name, auth_method, active, updated_at)
  values (new.id, new.slug, new.name, new.auth_method, new.status not in ('closed','paused'), now())
  on conflict (client_id) do update set
    slug = excluded.slug,
    display_name = excluded.display_name,
    auth_method = excluded.auth_method,
    active = excluded.active,
    updated_at = now();
  return new;
end;
$$;

revoke all on function private.sync_workspace_login() from public, anon, authenticated;

create trigger sync_workspace_login_after_client
after insert or update of name, slug, auth_method, status on public.clients
for each row execute procedure private.sync_workspace_login();

-- Any new creative version makes previous approvals for the same asset historical.
create or replace function private.supersede_prior_approvals()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.approvals a
  set superseded_at = now()
  from public.creative_versions oldv
  where a.creative_version_id = oldv.id
    and oldv.asset_id = new.asset_id
    and oldv.id <> new.id
    and a.superseded_at is null;
  return new;
end;
$$;

create trigger supersede_prior_approvals_after_version
after insert on public.creative_versions
for each row execute procedure private.supersede_prior_approvals();

-- Approval actions are intentionally narrow RPCs so clients cannot edit arbitrary approval columns.
create or replace function public.approve_proof(target_approval_id uuid, feedback_text text default null)
returns public.approvals
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data public.approvals;
begin
  select * into row_data from public.approvals where id = target_approval_id and superseded_at is null;
  if row_data.id is null then raise exception 'Approval not found or superseded'; end if;
  if not private.can_approve(row_data.client_id) then raise exception 'Not authorized to approve this client'; end if;

  update public.approvals
  set status = 'approved', decided_at = now(), decided_by = (select auth.uid()), feedback = feedback_text
  where id = target_approval_id
  returning * into row_data;

  if nullif(trim(feedback_text), '') is not null then
    insert into public.approval_comments (approval_id, author_id, body, is_internal)
    values (target_approval_id, (select auth.uid()), feedback_text, false);
  end if;
  return row_data;
end;
$$;

create or replace function public.request_proof_changes(target_approval_id uuid, feedback_text text)
returns public.approvals
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data public.approvals;
begin
  if nullif(trim(feedback_text), '') is null then raise exception 'Feedback is required'; end if;
  select * into row_data from public.approvals where id = target_approval_id and superseded_at is null;
  if row_data.id is null then raise exception 'Approval not found or superseded'; end if;
  if not private.is_client_member(row_data.client_id) and not private.is_staff() then raise exception 'Not authorized'; end if;

  update public.approvals
  set status = 'changes_requested', decided_at = now(), decided_by = (select auth.uid()), feedback = feedback_text
  where id = target_approval_id
  returning * into row_data;

  insert into public.approval_comments (approval_id, author_id, body, is_internal)
  values (target_approval_id, (select auth.uid()), feedback_text, false);
  return row_data;
end;
$$;

revoke all on function public.approve_proof(uuid, text) from public, anon;
revoke all on function public.request_proof_changes(uuid, text) from public, anon;
grant execute on function public.approve_proof(uuid, text) to authenticated;
grant execute on function public.request_proof_changes(uuid, text) to authenticated;

-- RLS
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.workspace_login enable row level security;
alter table public.client_members enable row level security;
alter table public.projects enable row level security;
alter table public.creative_assets enable row level security;
alter table public.creative_versions enable row level security;
alter table public.approvals enable row level security;
alter table public.approval_comments enable row level security;
alter table public.client_requests enable row level security;
alter table public.campaigns enable row level security;
alter table public.invoices enable row level security;
alter table public.platform_connections enable row level security;
alter table public.pending_access enable row level security;

create policy "workspace settings public read" on public.workspace_login
for select to anon, authenticated using (active = true);
create policy "workspace settings staff manage" on public.workspace_login
for all to authenticated using (private.is_staff()) with check (private.is_staff());

create policy "profile self or staff read" on public.profiles
for select to authenticated using (id = (select auth.uid()) or private.is_staff());

create policy "clients visible to staff or members" on public.clients
for select to authenticated using (private.is_staff() or private.is_client_member(id));
create policy "staff manage clients" on public.clients
for all to authenticated using (private.is_staff()) with check (private.is_staff());

create policy "memberships self or staff read" on public.client_members
for select to authenticated using (user_id = (select auth.uid()) or private.is_staff());
create policy "staff manage memberships" on public.client_members
for all to authenticated using (private.is_staff()) with check (private.is_staff());

create policy "projects staff or client read" on public.projects
for select to authenticated using (private.is_staff() or private.is_client_member(client_id));
create policy "staff manage projects" on public.projects
for all to authenticated using (private.is_staff()) with check (private.is_staff());

create policy "assets staff or client read" on public.creative_assets
for select to authenticated using (private.is_staff() or private.is_client_member(client_id));
create policy "staff manage assets" on public.creative_assets
for all to authenticated using (private.is_staff()) with check (private.is_staff());

create policy "versions staff or client read" on public.creative_versions
for select to authenticated using (
  private.is_staff() or exists (
    select 1 from public.creative_assets ca
    where ca.id = creative_versions.asset_id and private.is_client_member(ca.client_id)
  )
);
create policy "staff manage versions" on public.creative_versions
for all to authenticated using (private.is_staff()) with check (private.is_staff());

create policy "approvals staff or client read" on public.approvals
for select to authenticated using (private.is_staff() or private.is_client_member(client_id));
create policy "staff manage approvals" on public.approvals
for all to authenticated using (private.is_staff()) with check (private.is_staff());

create policy "comments staff or client read" on public.approval_comments
for select to authenticated using (
  private.is_staff() or exists (
    select 1 from public.approvals a
    where a.id = approval_comments.approval_id
      and private.is_client_member(a.client_id)
      and approval_comments.is_internal = false
  )
);
create policy "members add public comments" on public.approval_comments
for insert to authenticated with check (
  author_id = (select auth.uid()) and
  ((private.is_staff()) or (
    is_internal = false and exists (
      select 1 from public.approvals a
      where a.id = approval_comments.approval_id and private.is_client_member(a.client_id)
    )
  ))
);

create policy "requests staff or client read" on public.client_requests
for select to authenticated using (private.is_staff() or private.is_client_member(client_id));
create policy "clients create requests" on public.client_requests
for insert to authenticated with check (
  submitted_by = (select auth.uid()) and (private.is_staff() or private.is_client_member(client_id))
);
create policy "staff manage requests" on public.client_requests
for update to authenticated using (private.is_staff()) with check (private.is_staff());

create policy "campaigns staff or client read" on public.campaigns
for select to authenticated using (private.is_staff() or private.is_client_member(client_id));
create policy "staff manage campaigns" on public.campaigns
for all to authenticated using (private.is_staff()) with check (private.is_staff());

create policy "invoices staff or client read" on public.invoices
for select to authenticated using (private.is_staff() or private.is_client_member(client_id));
create policy "staff manage invoices" on public.invoices
for all to authenticated using (private.is_staff()) with check (private.is_staff());

create policy "connections staff or client read" on public.platform_connections
for select to authenticated using (private.is_staff() or private.is_client_member(client_id));
create policy "staff manage connections" on public.platform_connections
for all to authenticated using (private.is_staff()) with check (private.is_staff());

create policy "pending access staff only" on public.pending_access
for all to authenticated using (private.is_staff()) with check (private.is_staff());

-- Data API grants. RLS above remains the authorization boundary.
grant select on public.workspace_login to anon, authenticated;
grant select on public.profiles, public.clients, public.client_members, public.projects,
  public.creative_assets, public.creative_versions, public.approvals, public.approval_comments,
  public.client_requests, public.campaigns, public.invoices, public.platform_connections to authenticated;
grant insert, update, delete on public.clients, public.client_members, public.projects,
  public.creative_assets, public.creative_versions, public.approvals, public.campaigns,
  public.invoices, public.platform_connections, public.pending_access to authenticated;
grant insert on public.approval_comments, public.client_requests to authenticated;
grant update on public.client_requests to authenticated;

-- Private storage buckets.
insert into storage.buckets (id, name, public)
values ('creative-proofs', 'creative-proofs', false), ('client-uploads', 'client-uploads', false)
on conflict (id) do update set public = excluded.public;

create policy "proof files readable by staff or client" on storage.objects
for select to authenticated using (
  bucket_id = 'creative-proofs' and (
    private.is_staff() or exists (
      select 1 from public.client_members cm
      where cm.user_id = (select auth.uid())
        and cm.client_id::text = (storage.foldername(name))[1]
    )
  )
);
create policy "staff upload proof files" on storage.objects
for insert to authenticated with check (bucket_id = 'creative-proofs' and private.is_staff());
create policy "staff update proof files" on storage.objects
for update to authenticated using (bucket_id = 'creative-proofs' and private.is_staff()) with check (bucket_id = 'creative-proofs' and private.is_staff());
create policy "staff delete proof files" on storage.objects
for delete to authenticated using (bucket_id = 'creative-proofs' and private.is_staff());

create policy "client uploads readable by related users" on storage.objects
for select to authenticated using (
  bucket_id = 'client-uploads' and (
    private.is_staff() or exists (
      select 1 from public.client_members cm
      where cm.user_id = (select auth.uid())
        and cm.client_id::text = (storage.foldername(name))[1]
    )
  )
);
create policy "client upload own workspace files" on storage.objects
for insert to authenticated with check (
  bucket_id = 'client-uploads' and (
    private.is_staff() or exists (
      select 1 from public.client_members cm
      where cm.user_id = (select auth.uid())
        and cm.client_id::text = (storage.foldername(name))[1]
    )
  )
);

-- Initial F3 + Sueños workspace.
insert into public.clients (name, slug, status, auth_method, primary_contact_name, primary_contact_email, monthly_value)
values ('Sueños Tequila', 'suenos-tequila', 'active', 'both', 'Jason', 'jasontexasranger@gmail.com', 0)
on conflict (slug) do update set auth_method = excluded.auth_method, status = excluded.status;

insert into public.pending_access (email, full_name, user_type, client_id, can_approve, is_billing_contact)
select 'jason@f3works.com', 'Jason', 'staff', null, false, false
on conflict (email) do update set user_type = 'staff', full_name = 'Jason';

insert into public.pending_access (email, full_name, user_type, client_id, can_approve, is_billing_contact)
select 'jasontexasranger@gmail.com', 'Jason', 'client', id, true, true
from public.clients where slug = 'suenos-tequila'
on conflict (email) do update set client_id = excluded.client_id, can_approve = true, user_type = 'client';

-- Backfill profiles/memberships if either Auth user already exists.
insert into public.profiles (id, email, full_name, user_type)
select u.id, coalesce(u.email,''), pa.full_name, pa.user_type
from auth.users u
join public.pending_access pa on lower(pa.email) = lower(u.email)
on conflict (id) do update set email = excluded.email, full_name = excluded.full_name, user_type = excluded.user_type;

insert into public.client_members (client_id, user_id, can_approve, is_billing_contact)
select pa.client_id, u.id, pa.can_approve, pa.is_billing_contact
from auth.users u
join public.pending_access pa on lower(pa.email) = lower(u.email)
where pa.client_id is not null
on conflict (client_id, user_id) do update set can_approve = excluded.can_approve, is_billing_contact = excluded.is_billing_contact;
