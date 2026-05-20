-- =====================================================================
-- Migration: skipped_inventory_weeks
-- Purpose: Permite marcar semanas sin inventario; el cálculo de costo
--          de uso consolida ventas/compras del rango y usa los inventarios
--          inicial (última semana con inv) y final (semana actual).
-- Modules affected: Costo de Uso, Actual vs Teórico (AVT)
-- =====================================================================

-- 1) Tabla principal
CREATE TABLE IF NOT EXISTS public.skipped_inventory_weeks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  week         text NOT NULL,                  -- formato '2026-W17' (igual que reports.week)
  week_start   date,                           -- opcional, para queries por fecha
  reason       text NOT NULL CHECK (length(trim(reason)) > 0),
  created_by   text,                           -- email o user id (mismo patrón que costo_uso_adjustments)
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT skipped_inventory_weeks_unique UNIQUE (restaurant_id, week)
);

-- 2) Índice para queries por restaurant + week
CREATE INDEX IF NOT EXISTS idx_skipped_inv_weeks_restaurant_week
  ON public.skipped_inventory_weeks (restaurant_id, week);

-- 3) Habilitar RLS
ALTER TABLE public.skipped_inventory_weeks ENABLE ROW LEVEL SECURITY;

-- 4) Helpers de permisos (reutilizables, idempotentes)
CREATE OR REPLACE FUNCTION public.is_superadmin(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_superadmin FROM public.profiles WHERE id = uid), false);
$$;

CREATE OR REPLACE FUNCTION public.has_restaurant_role(uid uuid, rid uuid, roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_restaurants
    WHERE user_id = uid
      AND restaurant_id = rid
      AND active = true
      AND role = ANY(roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.has_restaurant_access(uid uuid, rid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_restaurants
    WHERE user_id = uid AND restaurant_id = rid AND active = true
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = uid AND restaurant_id = rid
  );
$$;

-- 5) Políticas RLS

-- SELECT: cualquiera con acceso al restaurant, o Super Admin
DROP POLICY IF EXISTS "skipped_inv_select" ON public.skipped_inventory_weeks;
CREATE POLICY "skipped_inv_select"
  ON public.skipped_inventory_weeks
  FOR SELECT
  USING (
    public.is_superadmin(auth.uid())
    OR public.has_restaurant_access(auth.uid(), restaurant_id)
  );

-- INSERT: solo owner/admin del restaurant, o Super Admin
DROP POLICY IF EXISTS "skipped_inv_insert" ON public.skipped_inventory_weeks;
CREATE POLICY "skipped_inv_insert"
  ON public.skipped_inventory_weeks
  FOR INSERT
  WITH CHECK (
    public.is_superadmin(auth.uid())
    OR public.has_restaurant_role(auth.uid(), restaurant_id, ARRAY['owner','admin'])
  );

-- DELETE: mismo criterio que INSERT (para deshacer)
DROP POLICY IF EXISTS "skipped_inv_delete" ON public.skipped_inventory_weeks;
CREATE POLICY "skipped_inv_delete"
  ON public.skipped_inventory_weeks
  FOR DELETE
  USING (
    public.is_superadmin(auth.uid())
    OR public.has_restaurant_role(auth.uid(), restaurant_id, ARRAY['owner','admin'])
  );

-- UPDATE: no permitido (las correcciones se hacen borrando + insertando)
DROP POLICY IF EXISTS "skipped_inv_update" ON public.skipped_inventory_weeks;
CREATE POLICY "skipped_inv_update"
  ON public.skipped_inventory_weeks
  FOR UPDATE
  USING (false);

-- 6) Comentarios para documentación
COMMENT ON TABLE  public.skipped_inventory_weeks IS 'Semanas marcadas explícitamente sin inventario. Permite consolidar el cálculo de costo de uso en la siguiente semana con inventario real.';
COMMENT ON COLUMN public.skipped_inventory_weeks.week IS 'Formato ISO de semana, ej: 2026-W17. Debe coincidir con reports.week.';
COMMENT ON COLUMN public.skipped_inventory_weeks.reason IS 'Motivo de por qué no se hizo inventario esa semana.';
