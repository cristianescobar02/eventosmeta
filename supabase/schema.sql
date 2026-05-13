-- ============================================================
-- PresupuestosObra · Supabase Schema
-- Ejecuta este script en: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── Extensiones ──────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── Tipos ────────────────────────────────────────────────────
create type plan_type as enum ('free', 'basic', 'pro');
create type user_role as enum ('admin', 'client');

-- ── Tabla: profiles ──────────────────────────────────────────
-- Extensión de auth.users con rol, plan y estado de suscripción
create table public.profiles (
  id              uuid references auth.users(id) on delete cascade primary key,
  email           text not null,
  full_name       text,
  role            user_role not null default 'client',
  plan            plan_type not null default 'free',
  plan_expires_at timestamptz,
  wompi_reference text,          -- referencia del último pago Wompi
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Trigger: crear perfil automáticamente al registrarse
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trigger: actualizar updated_at
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- ── Tabla: activities ────────────────────────────────────────
create table public.activities (
  id          bigserial primary key,
  code        text not null,
  chapter     text not null default 'GENERAL',
  description text not null,
  unit        text not null default '',
  unit_price  numeric(14,2) not null default 0,
  updated_at  timestamptz not null default now()
);

create index activities_code_idx on public.activities(code);
create index activities_chapter_idx on public.activities(chapter);
create index activities_description_idx on public.activities using gin(to_tsvector('spanish', description));

-- ── Tabla: apus ──────────────────────────────────────────────
create table public.apus (
  id               bigserial primary key,
  activity_code    text not null,
  materials        jsonb not null default '[]',
  labor            jsonb not null default '[]',
  equipment        jsonb not null default '[]',
  total_materials  numeric(14,2) not null default 0,
  total_labor      numeric(14,2) not null default 0,
  total_equipment  numeric(14,2) not null default 0,
  total_direct     numeric(14,2) not null default 0,
  updated_at       timestamptz not null default now()
);

create index apus_activity_code_idx on public.apus(activity_code);

-- ── Tabla: aux_apus ──────────────────────────────────────────
create table public.aux_apus (
  id          bigserial primary key,
  code        text not null,
  description text not null,
  unit        text not null default '',
  items       jsonb not null default '[]',
  total       numeric(14,2) not null default 0,
  updated_at  timestamptz not null default now()
);

-- ── Tabla: materials ─────────────────────────────────────────
create table public.materials (
  id          bigserial primary key,
  description text not null,
  unit        text not null default '',
  unit_price  numeric(14,2) not null default 0,
  category    text not null default 'GENERAL',
  updated_at  timestamptz not null default now()
);

create index materials_description_idx on public.materials using gin(to_tsvector('spanish', description));

-- ── Tabla: labor_prices ──────────────────────────────────────
create table public.labor_prices (
  id          bigserial primary key,
  description text not null,
  unit        text not null default 'Día',
  unit_price  numeric(14,2) not null default 0,
  category    text not null default 'GENERAL',
  updated_at  timestamptz not null default now()
);

-- ── Tabla: projects ──────────────────────────────────────────
create table public.projects (
  id          bigserial primary key,
  user_id     uuid references auth.users(id) on delete cascade not null,
  name        text not null,
  client      text not null default '',
  location    text not null default '',
  department  text not null default '',
  date        date,
  description text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index projects_user_id_idx on public.projects(user_id);

create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.handle_updated_at();

-- ── Tabla: budgets ───────────────────────────────────────────
create table public.budgets (
  id          bigserial primary key,
  project_id  bigint references public.projects(id) on delete cascade not null,
  user_id     uuid references auth.users(id) on delete cascade not null,
  name        text not null,
  items       jsonb not null default '[]',
  aiu         jsonb not null default '{"admin":10,"unforeseen":5,"utility":5}',
  subtotal    numeric(14,2) not null default 0,
  aiu_amount  numeric(14,2) not null default 0,
  total       numeric(14,2) not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index budgets_project_id_idx on public.budgets(project_id);
create index budgets_user_id_idx on public.budgets(user_id);

create trigger budgets_updated_at
  before update on public.budgets
  for each row execute function public.handle_updated_at();

-- ── Tabla: subscriptions_log ─────────────────────────────────
create table public.subscriptions_log (
  id               bigserial primary key,
  user_id          uuid references auth.users(id) on delete cascade,
  plan             plan_type not null,
  amount_cop       integer not null,
  wompi_reference  text not null unique,
  wompi_tx_id      text,
  status           text not null default 'pending', -- pending | approved | declined
  created_at       timestamptz not null default now()
);

-- ── Row Level Security (RLS) ─────────────────────────────────

alter table public.profiles         enable row level security;
alter table public.activities        enable row level security;
alter table public.apus              enable row level security;
alter table public.aux_apus          enable row level security;
alter table public.materials         enable row level security;
alter table public.labor_prices      enable row level security;
alter table public.projects          enable row level security;
alter table public.budgets           enable row level security;
alter table public.subscriptions_log enable row level security;

-- profiles: cada usuario ve/edita solo su perfil; admin ve todos
create policy "profiles_self" on public.profiles
  for all using (auth.uid() = id);

create policy "profiles_admin_all" on public.profiles
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- activities, apus, aux_apus: lectura pública (cualquier usuario autenticado)
-- escritura solo admin
create policy "activities_read" on public.activities
  for select using (auth.role() = 'authenticated');

create policy "activities_admin_write" on public.activities
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "apus_read" on public.apus
  for select using (auth.role() = 'authenticated');

create policy "apus_admin_write" on public.apus
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "aux_apus_read" on public.aux_apus
  for select using (auth.role() = 'authenticated');

create policy "aux_apus_admin_write" on public.aux_apus
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- materials y labor: solo plan pro puede leer
create policy "materials_pro" on public.materials
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
      and (p.role = 'admin' or p.plan = 'pro')
    )
  );

create policy "materials_admin_write" on public.materials
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "labor_read" on public.labor_prices
  for select using (auth.role() = 'authenticated');

create policy "labor_admin_write" on public.labor_prices
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- projects: solo el dueño
create policy "projects_owner" on public.projects
  for all using (auth.uid() = user_id);

-- budgets: solo el dueño
create policy "budgets_owner" on public.budgets
  for all using (auth.uid() = user_id);

-- subscriptions_log: solo el dueño y admin
create policy "subs_log_owner" on public.subscriptions_log
  for select using (auth.uid() = user_id);

create policy "subs_log_admin" on public.subscriptions_log
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ── Realtime ─────────────────────────────────────────────────
-- Habilitar realtime en tablas que cambia el admin
alter publication supabase_realtime add table public.activities;
alter publication supabase_realtime add table public.apus;
alter publication supabase_realtime add table public.materials;
alter publication supabase_realtime add table public.labor_prices;
alter publication supabase_realtime add table public.profiles;
