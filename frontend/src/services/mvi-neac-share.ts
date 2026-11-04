import { count, filterReportRows, scopeLabel, selectReportRows, type ReportDataset, type ReportScope } from './report-model'

export function buildMviNeacWhatsapp(data: ReportDataset, scope: ReportScope, issued = new Date()): string {
  const rows = selectReportRows(filterReportRows(data.rows, scope), 'mvi-neac')
  const top = (entries: [string, number][], limit: number) => entries.slice(0, limit)
    .map(([label, total]) => `• ${label}: ${total}`).join('\n') || '• Sem registros no recorte'
  const months = count(rows, row => row.date.slice(0, 7)).sort((left, right) => left[0].localeCompare(right[0]))
  const validHours = rows.filter(row => row.hour !== null).length
  return [
    '*10º BPM / PMAL · MVI NEAC*',
    `*Informe ao Comando · ${issued.toLocaleDateString('pt-BR')}*`,
    scopeLabel(scope),
    '',
    `*Vítimas elegíveis: ${rows.length}*`,
    `Municípios com registros: ${new Set(rows.map(row => row.city)).size}`,
    '',
    '*Evolução mensal (últimos meses do recorte)*',
    top(months.slice(-3).map(([period, total]) => [`${period.slice(5)}/${period.slice(0, 4)}`, total]), 3),
    '',
    '*Municípios com mais vítimas*',
    top(count(rows, row => row.city), 5),
    '',
    '*Classificações mais frequentes*',
    top(count(rows, row => row.category || row.nature), 3),
    '',
    `Horário informado: ${validHours} de ${rows.length} vítimas.`,
    rows.length ? '' : 'Sem vítimas no recorte; confira se a base NEAC foi importada e se os filtros estão corretos.',
    'Fonte: NEAC, somente vítimas elegíveis. CAD e NEAC são fontes independentes e não devem ser somados.',
    'Resumo agregado, sem identificação de vítimas. Confira o PDF antes do encaminhamento.',
  ].filter((line, index, lines) => line || lines[index - 1] !== '').join('\n').trim()
}
