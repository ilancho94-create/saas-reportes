-- Migración: agregar columnas de horas NO pagadas a labor_data.
--
-- Contexto: parse-labor antes descartaba filas sin Hourly Rate (asalariados
-- y usuarios placeholder). Resultado: el total_hours de la app no cuadraba
-- con el total que reporta Toast. Ahora el parser separa pagadas vs no
-- pagadas; estas columnas guardan el bucket "no pagadas" aparte para
-- que las métricas de nómina (total_pay / hr) no se contaminen y a la
-- vez el total de horas pueda cuadrarse contra el export de Toast.
--
-- Aditiva y nullable: histórico queda null.

alter table public.labor_data
  add column if not exists hours_unpaid_regular numeric,
  add column if not exists hours_unpaid_ot      numeric,
  add column if not exists by_employee_unpaid   jsonb;
