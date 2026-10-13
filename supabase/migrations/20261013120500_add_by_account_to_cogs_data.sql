-- Migración: agregar `by_account` jsonb a cogs_data.
--
-- Contexto: parse-cogs ya devuelve by_account (los envelopes " E" con
-- su importe). Antes se descartaba al guardar. Esta columna permite el
-- flujo futuro de Settings > Mapeo COGS (cada envelope de R365 mapeado
-- a una categoría canónica).
--
-- Es aditiva y nullable: cualquier reporte histórico sin by_account
-- queda null y nada rompe.

alter table public.cogs_data
  add column if not exists by_account jsonb;
