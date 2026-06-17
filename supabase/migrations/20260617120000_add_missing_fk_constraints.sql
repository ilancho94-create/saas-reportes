-- =====================================================================
-- Migration: add_missing_fk_constraints
-- Purpose:   Agregar constraints FOREIGN KEY que faltaban en
--            kitchen_performance_data y employee_performance_data.
--
-- Background: cuando refactorizamos /dashboard/kitchen y /dashboard/employee
-- a embedded select de PostgREST, las queries fallaron silenciosamente
-- con PGRST200 ("Could not find a relationship") porque estas dos tablas
-- tienen la columna report_id pero NUNCA se les creó la FK. Las demás
-- *_data tables sí la tienen.
--
-- Síntoma reportado: "employee productivity y kitchen aparecen sin
-- ningún reporte cargado previamente" — el embed devuelve null y el
-- .filter(w => w.kp) deja la lista vacía.
--
-- Side effect bonus: con la FK, ahora un DELETE en reports también
-- borrará las filas relacionadas (ON DELETE CASCADE), evitando huérfanos.
-- =====================================================================

-- Limpieza preventiva: si hay rows con report_id que ya no existe en
-- reports, las borramos para que la FK se pueda crear sin fallar.
delete from public.kitchen_performance_data
  where report_id is not null
    and not exists (select 1 from public.reports r where r.id = kitchen_performance_data.report_id);

delete from public.employee_performance_data
  where report_id is not null
    and not exists (select 1 from public.reports r where r.id = employee_performance_data.report_id);

-- FK constraints
alter table public.kitchen_performance_data
  add constraint kitchen_performance_data_report_id_fkey
  foreign key (report_id)
  references public.reports(id)
  on delete cascade;

alter table public.employee_performance_data
  add constraint employee_performance_data_report_id_fkey
  foreign key (report_id)
  references public.reports(id)
  on delete cascade;

-- Forzar refresh del schema cache de PostgREST para que el embedded
-- select tome efecto inmediato sin esperar el ciclo de notify normal.
notify pgrst, 'reload schema';
