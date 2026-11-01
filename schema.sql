-- MY SHOP 4.2.5.1 — Fondation cloud Supabase
-- À exécuter une seule fois dans Supabase > SQL Editor.
-- Cette version crée les tables cloud. Elle ne modifie pas les fichiers de l'application.
-- Les opérations passent par les API Vercel avec SUPABASE_SERVICE_ROLE_KEY côté serveur.

begin;

create extension if not exists pgcrypto;

-- 1) Boutiques et membres
create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 100),
  currency text not null default 'XAF',
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  plan text not null default 'free' check (plan in ('free','standard','pro')),
  subscription_status text not null default 'inactive' check (subscription_status in ('active','inactive','past_due','cancelled')),
  subscription_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_members (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'vendeur' check (role in ('patron','gerant','vendeur','personnalise')),
  status text not null default 'active' check (status in ('invited','active','suspended','removed')),
  ai_enabled boolean not null default false,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  unique (shop_id, user_id)
);
create index if not exists shop_members_user_status_idx on public.shop_members(user_id, status);
create index if not exists shop_members_shop_status_idx on public.shop_members(shop_id, status);

-- 2) Rôles personnalisés et permissions atomiques
create table if not exists public.shop_roles (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  description text,
  is_system boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, name),
  unique (id, shop_id)
);

create table if not exists public.shop_role_permissions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  role_id uuid not null,
  permission_key text not null check (permission_key ~ '^[a-z][a-z0-9_.:-]{1,99}$'),
  allowed boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  foreign key (role_id, shop_id) references public.shop_roles(id, shop_id) on delete cascade,
  unique (role_id, permission_key)
);

-- Lien entre un membre et un rôle personnalisé (si role_id est renseigné).
alter table public.shop_members add column if not exists role_id uuid;
alter table public.shop_members
  add constraint shop_members_role_shop_fk
  foreign key (role_id, shop_id) references public.shop_roles(id, shop_id) on delete restrict;

-- 3) Invitations et association d'appareils
create table if not exists public.shop_invitations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  role text not null default 'vendeur' check (role in ('gerant','vendeur','personnalise')),
  role_id uuid,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  expires_at timestamptz not null,
  invited_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  foreign key (role_id, shop_id) references public.shop_roles(id, shop_id) on delete set null
);
create index if not exists shop_invitations_shop_status_idx on public.shop_invitations(shop_id, status);

create table if not exists public.shop_devices (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  member_id uuid not null references public.shop_members(id) on delete cascade,
  device_key_hash text not null unique,
  device_label text not null default 'Appareil',
  status text not null default 'active' check (status in ('active','revoked')),
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists shop_devices_member_status_idx on public.shop_devices(member_id, status);

-- 4) File de synchronisation des données métier (ventes, clients, stock, paramètres, clôtures).
-- payload contient un enregistrement JSON ; les API doivent vérifier boutique, membre et permission avant écriture/lecture.
create table if not exists public.shop_sync_records (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  entity_type text not null check (entity_type in ('vente','client','stock','parametre','cloture','depense','autre')),
  entity_id text not null,
  operation text not null default 'upsert' check (operation in ('upsert','delete')),
  payload jsonb,
  revision bigint not null default 1,
  source_device_id uuid references public.shop_devices(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, entity_type, entity_id),
  check ((operation = 'delete') or payload is not null)
);
create index if not exists shop_sync_records_shop_updated_idx on public.shop_sync_records(shop_id, updated_at, id);
create index if not exists shop_sync_records_type_idx on public.shop_sync_records(shop_id, entity_type);

create table if not exists public.shop_sync_cursors (
  device_id uuid primary key references public.shop_devices(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  last_sync_at timestamptz,
  last_record_id uuid,
  updated_at timestamptz not null default now()
);

-- 5) Quotas IA (conservées dans cette version)
create table if not exists public.ai_plan_limits (
  plan text primary key check (plan in ('free','standard','pro')),
  monthly_messages integer not null check (monthly_messages >= 0),
  enabled boolean not null default false
);
insert into public.ai_plan_limits(plan, monthly_messages, enabled) values
  ('free', 0, false), ('standard', 40, true), ('pro', 250, true)
on conflict (plan) do nothing;

create table if not exists public.ai_usage_monthly (
  shop_id uuid not null references public.shops(id) on delete cascade,
  period date not null,
  messages_used integer not null default 0 check (messages_used >= 0),
  updated_at timestamptz not null default now(),
  primary key (shop_id, period)
);

create or replace function public.consume_ai_quota(p_shop_id uuid, p_period date, p_limit integer)
returns table(allowed boolean, used integer, remaining integer)
language plpgsql security definer set search_path = public
as $$
declare v_used integer;
begin
  insert into public.ai_usage_monthly(shop_id, period, messages_used)
  values (p_shop_id, p_period, 0) on conflict (shop_id, period) do nothing;
  select messages_used into v_used from public.ai_usage_monthly
   where shop_id = p_shop_id and period = p_period for update;
  if v_used >= p_limit then
    return query select false, v_used, 0; return;
  end if;
  update public.ai_usage_monthly set messages_used = messages_used + 1, updated_at = now()
   where shop_id = p_shop_id and period = p_period returning messages_used into v_used;
  return query select true, v_used, greatest(0, p_limit - v_used);
end;
$$;

-- 6) Sécurité : RLS activée et accès direct navigateur fermé.
-- Les fonctions/API serveur devront authentifier l'utilisateur et contrôler son appartenance
-- à la boutique ainsi que la permission demandée avant chaque opération.
do $$
declare t text;
begin
  foreach t in array array['shops','shop_members','shop_roles','shop_role_permissions','shop_invitations','shop_devices','shop_sync_records','shop_sync_cursors','ai_plan_limits','ai_usage_monthly'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

revoke all on function public.consume_ai_quota(uuid,date,integer) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid,date,integer) to service_role;

commit;
