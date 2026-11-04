import { count, filterReportRows, scopeLabel, selectReportRows, type ReportDataset, type ReportScope } from './report-model'
import { formatNeacImportDate, mviNeacComparison } from './mvi-neac-comparison'

export function buildMviNeacWhatsapp(data: ReportDataset, scope: ReportScope, issued = new Date()): string {
  const rows = selectReportRows(filterReportRows(data.rows, scope), 'mvi-neac')
  const top = (entries: [string, number][], limit: number) => entries.slice(0, limit)
    .map(([label, total]) => `• ${label}: ${total}`).join('\n') || '• Sem registros no recorte'
  const annual = mviNeacComparison(data, scope, issued)
  const validHours = rows.filter(row => row.hour !== null).length
  return [
    '📊 *10º BPM / PMAL · MVI NEAC*',
    `📅 *Informe ao Comando · ${issued.toLocaleDateString('pt-BR')}*`,
    scopeLabel(scope),
    `🗂️ *Planilha NEAC · última importação:* ${formatNeacImportDate(data)}`,
    '',
    `👥 *Vítimas elegíveis: ${rows.length}*`,
    `Municípios com registros: ${new Set(rows.map(row => row.city)).size}`,
    '',
    annual ? `📈 *Mesmo período · ${annual.year - 1} × ${annual.year}*` : '📈 *Comparativo anual*',
    annual ? `${annual.year - 1}: ${annual.previous} vítima(s) · ${annual.previousStart} a ${annual.previousEnd}` : 'Informe datas do mesmo ano para comparar.',
    annual ? `${annual.year}: ${annual.current} vítima(s) · ${annual.currentStart} a ${annual.currentEnd}` : '',
    annual ? `Diferença: ${annual.difference > 0 ? '+' : ''}${annual.difference} · Variação: ${annual.variationPercent === null ? 'sem base percentual' : `${annual.variationPercent > 0 ? '+' : ''}${annual.variationPercent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}` : '',
    '',
    annual ? `📆 *Mês a mês · ${annual.year - 1} × ${annual.year}*` : '',
    annual ? annual.months.map(item => `• ${String(item.month).padStart(2, '0')}: ${annual.year - 1} ${item.previous} | ${annual.year} ${item.current}`).join('\n') : '',
    '',
    '🏙️ *Municípios com mais vítimas*',
    top(count(rows, row => row.city), 5),
    '',
    '📌 *Classificações mais frequentes*',
    top(count(rows, row => row.category || row.nature), 3),
    '',
    `🕒 Horário informado: ${validHours} de ${rows.length} vítimas.`,
    rows.length ? '' : 'Sem vítimas no recorte; confira se a base NEAC foi importada e se os filtros estão corretos.',
    'ℹ️ Fonte: NEAC, somente vítimas elegíveis. CAD e NEAC são fontes independentes e não devem ser somados.',
    'Meses sem registro aparecem como zero; isso não confirma cobertura completa da planilha.',
    'Resumo agregado, sem identificação de vítimas. Confira o PDF antes do encaminhamento.',
  ].filter((line, index, lines) => line || lines[index - 1] !== '').join('\n').trim()
}
