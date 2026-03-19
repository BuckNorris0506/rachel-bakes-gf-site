-- Rachel Bakes GF — Supabase schema (waitlist)
-- Only waitlist signup storage for the ordering-open notification list.

create table if not exists public.waitlist (
  id bigserial primary key,
  email text not null,
  name text,
  created_at timestamptz not null default now(),
  notified_at timestamptz null
);

-- Deduplicate logically by email (case-insensitive).
-- We store normalized lower-case emails in the API; this unique index ensures no duplicates.
create unique index if not exists waitlist_email_lower_unique
  on public.waitlist (lower(email));

