-- Fuori Rotta — schema Supabase (versione senza push in background: dato
-- che l'uso reale è PC + iPad + iPhone, non tutti installati come app in
-- standalone, il push su iOS non sarebbe comunque affidabile — vedi
-- DEPLOY.md. Il radar di prossimità resta quello della PWA, attivo ad app
-- aperta, sincronizzato su tutti i device tramite queste tabelle.
--
-- Incolla ed esegui nel SQL editor di Supabase (Project → SQL Editor → New query).

create extension if not exists "pgcrypto";

-- ---------- Luoghi ----------
create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  lat double precision not null,
  lng double precision not null,
  category text not null default 'other',
  accessibility text not null default 'unknown',
  source text not null default 'manual',
  notes text default '',
  tags text[] default '{}',
  visited boolean not null default false,
  visit_count integer not null default 0,
  last_visited timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists places_user_idx on public.places (user_id);

alter table public.places enable row level security;

create policy "places_select_own" on public.places
  for select using (auth.uid() = user_id);
create policy "places_insert_own" on public.places
  for insert with check (auth.uid() = user_id);
create policy "places_update_own" on public.places
  for update using (auth.uid() = user_id);
create policy "places_delete_own" on public.places
  for delete using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_places_updated_at on public.places;
create trigger trg_places_updated_at
  before update on public.places
  for each row execute function public.set_updated_at();

-- ---------- Impostazioni utente ----------
-- Sincronizza raggio radar, velocità media e punto "Casa" tra PC/iPad/iPhone
-- (prima vivevano solo nel localStorage del singolo device).
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  radius_km integer not null default 10,
  travel_speed_kmh integer not null default 45,
  home_lat double precision,
  home_lng double precision
);

alter table public.user_settings enable row level security;

create policy "settings_all_own" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
