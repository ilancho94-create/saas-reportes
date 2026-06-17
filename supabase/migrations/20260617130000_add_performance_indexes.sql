-- =====================================================================
-- Migration: add_performance_indexes
-- Purpose:   Índices compuestos para las queries más frecuentes.
--            IF NOT EXISTS para que sea idempotente y no falle si
--            Supabase ya creó alguno automáticamente.
--
-- Queries que aceleran:
--
--   1. reports per restaurante ordenados por semana (TODA la app):
--      SELECT ... FROM reports
--      WHERE restaurant_id = X ORDER BY week DESC LIMIT N
--      → idx_reports_restaurant_week (composite + DESC)
--
--   2. *_data tables embedded select (cuando se joinea con reports):
--      Cada *_data table tiene report_id como FK. Sin índice cada
--      embedded select hace SEQ SCAN.
--      → idx_<table>_report_id
--
--   3. user_restaurants lookup en cada page load:
--      SELECT ... FROM user_restaurants WHERE user_id = X
--      Y la query reverse de las policies RLS:
--      WHERE restaurant_id = X AND user_id = Y AND active = true
--      → idx_user_restaurants_user, idx_user_restaurants_restaurant_user
--
--   4. costo_uso_adjustments y skipped_inventory_weeks per restaurante:
--      → idx por restaurant_id
-- =====================================================================

-- 1) reports — el más usado, composite (restaurant_id, week DESC)
create index if not exists idx_reports_restaurant_week
  on public.reports (restaurant_id, week desc);

-- 2) *_data tables — report_id (para embedded selects + joins de RLS)
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'sales_data', 'cogs_data', 'inventory_data', 'product_mix_data',
      'discounts_data', 'waste_data', 'voids_data', 'labor_data',
      'avt_data', 'employee_performance_data', 'kitchen_performance_data',
      'receiving_data'
    ])
  loop
    execute format(
      'create index if not exists idx_%s_report_id on public.%I (report_id)',
      t, t
    );
  end loop;
end$$;

-- 3) user_restaurants — lookup por user_id (loadData, auth context)
create index if not exists idx_user_restaurants_user
  on public.user_restaurants (user_id);

-- Y composite para policies RLS que filtran por (restaurant_id, user_id, active)
create index if not exists idx_user_restaurants_rest_user
  on public.user_restaurants (restaurant_id, user_id, active);

-- 4) Per-restaurant tables (costo_uso_adjustments, skipped_inventory_weeks, mappings, etc)
create index if not exists idx_costo_uso_adjustments_restaurant
  on public.costo_uso_adjustments (restaurant_id);

create index if not exists idx_skipped_inventory_weeks_restaurant
  on public.skipped_inventory_weeks (restaurant_id);

create index if not exists idx_category_mappings_restaurant
  on public.category_mappings (restaurant_id);

create index if not exists idx_discount_mappings_restaurant
  on public.discount_mappings (restaurant_id);

create index if not exists idx_cost_targets_restaurant
  on public.cost_targets (restaurant_id);

-- 5) Forzar refresh del schema cache de PostgREST
notify pgrst, 'reload schema';
