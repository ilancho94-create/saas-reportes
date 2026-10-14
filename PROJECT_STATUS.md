# Restaurant X-Ray — Estado del Proyecto
Última actualización: 2026-10-13

## Fixes de auditoría 12-oct (aplicados 2026-10-13 — commits locales, SIN push)
Rama: costo-uso-validation-2026-09-06

1. costo-uso: el "skip semanal" ignora el inventario que ya existe
   (engine.findAnchorBefore y buildPeriodSeries respetan
   skippedWeekSet). Alert loop usa la ÚLTIMA semana con inventario,
   no la anterior del arreglo; modal avisa cuando la semana ya tiene
   conteo cargado.
2. avt + compras: no se muestra avt_data de una semana saltada; el
   banner de "consolidación" se corrigió — R365 solo calcula AvT de
   la semana con conteo, las semanas saltadas no están cubiertas;
   eliminado el fallback hardcodeado del restaurant_id
   "00000000-0000-0000-0000-000000000001" en ambos.
3. CEO dashboard: cruzar la semana latest contra skipped_inventory_weeks
   y no mostrar net_variance; en su lugar "📭 Semana saltada".
4. /api/process: 409 (code: REPORT_WEEK_EXISTS) si ya existe un
   reporte para (restaurant_id, week); también convierte un 23505 del
   INSERT en 409 por race condition. Migración
   supabase/migrations/20261013_add_unique_restaurant_week.sql con
   el UNIQUE a nivel BD (NO ejecutada desde este repo — Ilan la aplica).
5. /api/process: saveToDatabase y los .insert directos propagan error.
   sales o labor fallando → success:false status 500 con el detalle.
6. /api/process getWeekStartISO: const dow = jan4.getDay() || 7 — ya
   no corre W1 7 días cuando el 4-ene cae en domingo.
7. food-cost: quitado el fallback \`|| netSales\` por categoría. La
   fracción A&B es Σcostos A&B / Σventas A&B reales.
8. costo-uso + food-cost: la query de reports usa ascending:false +
   limit(52) + reverse() → últimas 52, no las 52 más viejas.
9. engine.getMappedSales/Gross y food-cost.getMappedSales filtran
   \`m.source_system === 'toast'\`. Aviso nuevo "Categoría de ventas
   sin mapear: X" en costo-uso y food-cost.
10. costo-uso engine: quitado Math.max(uso, 0). El uso negativo se
    publica tal cual; UI (tabla y mobile card) lo pinta en naranja
    con badge "⚠️ uso negativo, revisar conteo/compras". Diagnostic
    negative_gross_consumption: clampedTo pasa a null.
11. parse-cogs: by_vendor acepta celda "" (SheetJS las lee vacías así,
    no como null). by_account se persiste en cogs_data.by_account.
    Migración 20261013_add_by_account_to_cogs_data.
12. parse-labor: ya no descarta filas sin Hourly Rate; se publican
    aparte (hours_unpaid_regular/ot + by_employee_unpaid) para cuadrar
    con Toast. Migración 20261013_add_hours_unpaid_to_labor_data.
    labor/page.tsx: order by week desc en lugar de created_at.
13. parse-sales: warning cuando guests/orders > 8. buildSalesDateWarning
    acepta que el inicio sea el martes posterior al cierre (Mula cierra
    lunes). parse-inventory: warnings de cuenta con current=0 cuando
    previous>500 y de count_date fuera del lunes.
14. "Este mes" en costo-uso, food-cost y kitchen compara por string
    'YYYY-MM' en vez de \`new Date(week_start)\` (evita bug UTC);
    parse-kitchen-details construye dateStr con getFullYear/
    getMonth/getDate local, no toISOString; helper
    src/lib/week-label.ts (shortWeek) reemplaza los
    \`.replace('2026-', '')\` dispersos en 10 pantallas.

Pendiente del lado de Ilan: aplicar las 3 migraciones SQL contra
Supabase antes del próximo despliegue (SIN push por ahora).

Última actualización previa: 2026-03-27

## Stack
Next.js + Supabase + Vercel
URL: saas-reportes.vercel.app
Repo: github.com/ilancho94-create/saas-reportes
Supabase: bboikwhfusptkqvdukzc

## IDs Clave
- Restaurant ID Mula Cantina: 00000000-0000-0000-0000-000000000001
- Org ID Grupo Mercurio: 00000000-0000-0000-0000-000000000001
- User ID Ilan: c50d7d8c-296f-4f89-98c9-a96cb125aa52

## Fixes Aplicados Hoy (2026-03-27)
1. CEO dashboard — avt_data agregado al fetch + Sobrantes visible
2. Labor comparativa — respeta semana seleccionada + trim() en nombres
3. Costo de Uso — Food bar Inventory mapeado a liquor en ACCOUNT_MAP
4. Parser COGS — columnas corregidas (5,15,17,20,22,27)
5. Settings — nueva pestaña Mapeo COGS con tabla cogs_account_mappings

## Pendiente
- Verificar W09, W10, W12 en Costo de Uso contra cédulas actualizadas
- Bug nuevo que Ilan encontró (por confirmar)
- PPTX export mejorado
- AI Insights
- Dominio propio

## Notas Parser COGS
Columnas correctas del Excel R365 COGS Analysis by Vendor:
- col 5 = Food E
- col 15 = N/A Beverage E  
- col 17 = Liquor E
- col 20 = Beer E
- col 22 = General E
- col 27 = Total
