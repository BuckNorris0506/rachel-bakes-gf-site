-- Rachel Bakes GF — Supabase schema (minimum)
-- Ordering status slice only (config + today's preorder totals)

-- Config table (single row model)
create table if not exists public.config (
  id integer primary key,
  preorder_open boolean not null default false,
  custom_orders_open boolean not null default false,
  daily_cap_cents integer not null default 0,
  status_message text not null default '',
  updated_at timestamptz not null default now()
);

-- Seed single config row (id = 1)
insert into public.config (id, preorder_open, custom_orders_open, daily_cap_cents, status_message, updated_at)
values (
  1,
  false,
  false,
  100000,
  'Ordering is currently closed. Rachel Bakes GF opens for summer bakes and select holiday preorders.',
  now()
)
on conflict (id) do update set
  preorder_open = excluded.preorder_open,
  custom_orders_open = excluded.custom_orders_open,
  daily_cap_cents = excluded.daily_cap_cents,
  status_message = excluded.status_message,
  updated_at = excluded.updated_at;

-- Preorders table (only to compute "today's total" for the cap)
create table if not exists public.preorders (
  id bigserial primary key,
  amount_cents integer not null,
  created_at timestamptz not null default now()
);

