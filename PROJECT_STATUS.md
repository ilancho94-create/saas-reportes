# Restaurant X-Ray — Estado del Proyecto
Última actualización: 2026-03-27

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
