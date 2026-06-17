-- =====================================================================
-- Migration: enable_rls_all_tables
-- Purpose:   Habilitar Row Level Security en TODAS las tablas del schema
--            public y crear policies multi-tenant basadas en
--            user_restaurants.
--
-- CRÍTICO:   Antes de esta migración, el anon-key (público, en bundle del
--            cliente) podía leer TODA la data de TODOS los restaurantes
--            sin autenticación. La auditoría de 2026-06-16 confirmó
--            empíricamente que se podía leer:
--              - 24 reports + 24 sales_data + 24 cogs_data
--              - El user_id del super admin (chain exploit con
--                /api/admin/create-user que toma requesterId del body)
--              - Roles y permisos de los 10 usuarios
--
-- Modelo:    Acceso por membresía en user_restaurants. Una semana de
--            reporte de un restaurante solo es visible para usuarios con
--            active=true en ese restaurante.
-- =====================================================================

-- ── 1) Helper functions (SECURITY DEFINER) ───────────────────────────────
-- Estas funciones bypassean RLS internamente para hacer el lookup, así no
-- creamos recursión cuando una policy necesita consultar user_restaurants.

create or replace function public.user_has_restaurant_access(rest_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_restaurants
    where user_id = (select auth.uid())
      and restaurant_id = rest_id
      and active = true
  );
$$;

create or replace function public.user_is_restaurant_admin(rest_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_restaurants
    where user_id = (select auth.uid())
      and restaurant_id = rest_id
      and active = true
      and role in ('owner', 'admin')
  );
$$;

create or replace function public.report_belongs_to_user(rep_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.reports r
    join public.user_restaurants ur
      on ur.restaurant_id = r.restaurant_id
    where r.id = rep_id
      and ur.user_id = (select auth.uid())
      and ur.active = true
  );
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select coalesce((
    select is_superadmin
    from public.profiles
    where id = (select auth.uid())
    limit 1
  ), false);
$$;

-- ── 2) Profiles ──────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

drop policy if exists "users see own profile" on public.profiles;
create policy "users see own profile"
  on public.profiles for select
  using (id = (select auth.uid()) or public.is_superadmin());

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update
  using (id = (select auth.uid()))
  with check (
    -- No te puedes auto-promover a superadmin
    id = (select auth.uid())
    and (is_superadmin = (select p.is_superadmin from public.profiles p where p.id = (select auth.uid())))
  );

-- ── 3) Organizations ─────────────────────────────────────────────────────
alter table public.organizations enable row level security;
-- Sin policies = solo service_role accede. Si el código del cliente
-- necesita leer organizations, agregamos policies después con tu input.

-- ── 4) Restaurants ───────────────────────────────────────────────────────
alter table public.restaurants enable row level security;

drop policy if exists "members read restaurant" on public.restaurants;
create policy "members read restaurant"
  on public.restaurants for select
  using (public.user_has_restaurant_access(id) or public.is_superadmin());

drop policy if exists "admins update restaurant" on public.restaurants;
create policy "admins update restaurant"
  on public.restaurants for update
  using (public.user_is_restaurant_admin(id) or public.is_superadmin());

-- INSERT/DELETE solo via service_role (admin create-user / superadmin tools).

-- ── 5) User_restaurants (membresía) ──────────────────────────────────────
alter table public.user_restaurants enable row level security;

drop policy if exists "user sees own memberships" on public.user_restaurants;
create policy "user sees own memberships"
  on public.user_restaurants for select
  using (
    user_id = (select auth.uid())
    or public.user_is_restaurant_admin(restaurant_id)
    or public.is_superadmin()
  );

drop policy if exists "admins manage memberships" on public.user_restaurants;
create policy "admins manage memberships"
  on public.user_restaurants for all
  using (public.user_is_restaurant_admin(restaurant_id) or public.is_superadmin())
  with check (public.user_is_restaurant_admin(restaurant_id) or public.is_superadmin());

-- ── 6) User_invitations ──────────────────────────────────────────────────
alter table public.user_invitations enable row level security;
-- Sin policies por default. Si la UI las lista por restaurant agregamos
-- una policy "admins see invitations" similar a user_restaurants.

-- ── 7) Roles (catálogo) ──────────────────────────────────────────────────
alter table public.roles enable row level security;

drop policy if exists "authenticated reads roles" on public.roles;
create policy "authenticated reads roles"
  on public.roles for select
  to authenticated
  using (true);

-- ── 8) Reports (parent de toda la data semanal) ──────────────────────────
alter table public.reports enable row level security;

drop policy if exists "members read reports" on public.reports;
create policy "members read reports"
  on public.reports for select
  using (public.user_has_restaurant_access(restaurant_id) or public.is_superadmin());

drop policy if exists "members write reports" on public.reports;
create policy "members write reports"
  on public.reports for insert
  with check (public.user_has_restaurant_access(restaurant_id));

drop policy if exists "members update reports" on public.reports;
create policy "members update reports"
  on public.reports for update
  using (public.user_has_restaurant_access(restaurant_id));

drop policy if exists "admins delete reports" on public.reports;
create policy "admins delete reports"
  on public.reports for delete
  using (public.user_is_restaurant_admin(restaurant_id) or public.is_superadmin());

-- ── 9) *_data tables linked by report_id ─────────────────────────────────
-- Patrón uniforme: acceso si el reporte padre te pertenece.

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'sales_data',
      'cogs_data',
      'inventory_data',
      'product_mix_data',
      'discounts_data',
      'waste_data',
      'voids_data',
      'labor_data',
      'avt_data',
      'employee_performance_data',
      'kitchen_performance_data',
      'receiving_data'
    ])
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "access via report" on public.%I', t);
    execute format(
      'create policy "access via report" on public.%I for all
       using (public.report_belongs_to_user(report_id) or public.is_superadmin())
       with check (public.report_belongs_to_user(report_id))',
      t
    );
  end loop;
end$$;

-- ── 10) Per-restaurant config tables ─────────────────────────────────────
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'category_mappings',
      'cogs_account_mappings',
      'cost_targets',
      'discount_mappings',
      'avt_categories',
      'kitchen_station_config',
      'waste_notes',
      'waste_reasons',
      'export_templates'
    ])
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "access via restaurant" on public.%I', t);
    execute format(
      'create policy "access via restaurant" on public.%I for all
       using (public.user_has_restaurant_access(restaurant_id) or public.is_superadmin())
       with check (public.user_has_restaurant_access(restaurant_id))',
      t
    );
  end loop;
end$$;

-- ── 11) costo_uso_adjustments y skipped_inventory_weeks ──────────────────
-- Estas tienen restaurant_id directo + week reference. Patrón estándar.
alter table public.costo_uso_adjustments enable row level security;
drop policy if exists "access via restaurant" on public.costo_uso_adjustments;
create policy "access via restaurant"
  on public.costo_uso_adjustments for all
  using (public.user_has_restaurant_access(restaurant_id) or public.is_superadmin())
  with check (public.user_has_restaurant_access(restaurant_id));

alter table public.skipped_inventory_weeks enable row level security;
drop policy if exists "access via restaurant" on public.skipped_inventory_weeks;
create policy "access via restaurant"
  on public.skipped_inventory_weeks for all
  using (public.user_has_restaurant_access(restaurant_id) or public.is_superadmin())
  with check (public.user_has_restaurant_access(restaurant_id));

-- ── 12) avt_tracking ─────────────────────────────────────────────────────
-- Estructura no auditada todavía. RLS encendido, sin policies → solo
-- service_role lo puede tocar hasta que confirmemos columna pivot.
alter table public.avt_tracking enable row level security;

-- ── 13) Smoke test al final (informativo, no falla la migración) ─────────
-- Verifica que TODAS las tablas del schema public quedaron con RLS on.
do $$
declare
  pending_table text;
  pending_count int := 0;
begin
  for pending_table in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename not like 'pg_%'
      and rowsecurity = false
  loop
    raise warning 'RLS NO está habilitada en public.%', pending_table;
    pending_count := pending_count + 1;
  end loop;
  if pending_count > 0 then
    raise warning '%s tablas sin RLS — revisar manualmente', pending_count;
  else
    raise notice 'OK: todas las tablas de public tienen RLS habilitada';
  end if;
end$$;
