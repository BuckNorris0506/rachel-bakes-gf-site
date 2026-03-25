-- Rachel Bakes GF — Supabase schema (custom orders)

create table if not exists public.custom_orders (
  id bigserial primary key,
  name text not null,
  contact text not null,
  event_date text,
  pickup_date text,
  item_type text,
  servings text,
  flavor text,
  design_notes text,
  inspiration_link text,
  allergy_notes text,
  extra_details text,
  created_at timestamptz not null default now()
);

