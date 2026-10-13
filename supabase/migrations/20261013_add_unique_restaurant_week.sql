-- Migración: UNIQUE (restaurant_id, week) sobre public.reports
--
-- Contexto: /api/process ya devuelve 409 cuando se intenta re-subir una
-- semana. Esta restricción es la defensa a nivel de BD contra una race
-- condition entre dos requests simultáneos (dos pestañas del wizard
-- subiendo la misma semana al mismo tiempo).
--
-- Antes de aplicar: verificar que NO existan duplicados pendientes. La
-- primera query DEBE devolver cero filas; si devuelve algo, revisar
-- esos pares con el equipo antes de continuar (el ADD CONSTRAINT falla
-- si quedan duplicados).
--
--   select restaurant_id, week, count(*)
--   from public.reports
--   group by 1, 2
--   having count(*) > 1;
--
-- Luego aplicar manualmente (NO automatizado para no tocar la BD de
-- producción desde el repo):

alter table public.reports
  add constraint reports_restaurant_week_unique
  unique (restaurant_id, week);
