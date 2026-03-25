-- Rachel Bakes GF — Supabase schema (preorders)
-- Extends the minimal `preorders` table created for ordering-status.

-- Add structured fields needed for real preorder submissions and daily cap enforcement.

alter table if exists public.preorders
  add column if not exists name text,
  add column if not exists contact text,
  add column if not exists order_details text,
  add column if not exists pickup_date text,
  add column if not exists pickup_window text,
  add column if not exists notes text;

-- Basic guardrails (optional; keep minimal for now)
alter table public.preorders
  alter column amount_cents set not null;

