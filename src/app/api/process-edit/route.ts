export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const week = formData.get('week') as string
    const reportId = formData.get('report_id') as string

    if (!week || !reportId) {
      return NextResponse.json({ success: false, error: 'Faltan parámetros' })
    }

    const results: Record<string, any> = {}
    const warnings: Record<string, string> = {}
    const fileTypes = ['sales', 'labor', 'cogs', 'voids', 'discounts', 'waste', 'inventory', 'product_mix', 'menu_analysis', 'avt']

    let productMixData: any = null
    let menuAnalysisData: any = null

    for (const fileType of fileTypes) {
      const file = formData.get(fileType) as File | null
      if (!file) continue
      console.log(`Re-processing ${fileType}...`)
      try {
        const extracted = await extractWithClaude(file, fileType, week)
        results[fileType] = extracted
        if (extracted.date_warning) warnings[fileType] = extracted.date_warning

        if (fileType === 'product_mix') {
          productMixData = extracted
        } else if (fileType === 'menu_analysis') {
          menuAnalysisData = extracted
        } else {
          const tableMap: Record<string, string> = {
            sales: 'sales_data', labor: 'labor_data', cogs: 'cogs_data',
            voids: 'voids_data', discounts: 'discounts_data', waste: 'waste_data',
            inventory: 'inventory_data', avt: 'avt_data',
          }
          const table = tableMap[fileType]
          if (table) {
            await supabase.from(table).delete().eq('report_id', reportId)
            await saveToDatabase(reportId, fileType, extracted)
          }
        }
      } catch (err) {
        console.error(`Error re-processing ${fileType}:`, err)
        results[fileType] = { error: 'No se pudo procesar' }
      }
    }

    if (productMixData || menuAnalysisData) {
      await supabase.from('product_mix_data').delete().eq('report_id', reportId)
      await saveProductMixCombined(reportId, productMixData, menuAnalysisData)
    }

    return NextResponse.json({
      success: true, report_id: reportId, week,
      processed: Object.keys(results), warnings,
    })

  } catch (error: any) {
    console.error('API Error:', error)
    return NextResponse.json({ success: false, error: error.message })
  }
}