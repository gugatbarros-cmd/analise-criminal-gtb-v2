import { count, filterReportRows, scopeLabel, selectReportRows, type ReportDataset, type ReportScope } from './report-model'
import { formatNeacImportDate, mviNeacComparison } from './mvi-neac-comparison'

const icon = {
  shield: '\u{1F6E1}\uFE0F', chart: '\u{1F4CA}', calendar: '\u{1F4C5}', folder: '\u{1F5C2}\uFE0F',
  people: '\u{1F465}', compare: '\u{1F4C8}', months: '\u{1F5D3}\uFE0F', pin: '\u{1F4CD}',
  tag: '\u{1F3F7}\uFE0F', clock: '\u{1F552}', info: '\u2139\uFE0F', up: '\u2197\uFE0F',
  down: '\u2198\uFE0F', equal: '\u27A1\uFE0F', bullet: '\u25AB\uFE0F',
}
const divider = '━━━━━━━━━━━━━━━━━━'
const monthName = (month: number) => ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'][month - 1]
const top = (entries: [string, number][], limit: number) => entries.slice(0, limit)
  .map(([label, total]) => `${icon.bullet} ${label}: *${total}*`).join('\n') || `${icon.bullet} Sem registros no recorte`

export function whatsappShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`
}

export function buildMviNeacWhatsapp(data: ReportDataset, scope: ReportScope, issued = new Date()): string {
  const rows = selectReportRows(filterReportRows(data.rows, scope), 'mvi-neac')
  const annual = mviNeacComparison(data, scope, issued)
  const validHours = rows.filter(row => row.hour !== null).length
  const direction = annual ? annual.difference > 0 ? icon.up : annual.difference < 0 ? icon.down : icon.equal : icon.equal
  const difference = annual ? `${annual.difference > 0 ? '+' : ''}${annual.difference}` : ''
  const variation = annual?.variationPercent === null || annual === null ? 'sem base percentual'
    : `${annual.variationPercent > 0 ? '+' : ''}${annual.variationPercent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
  const lines = [
    `${icon.shield} *10º BPM | PMAL*`,
    `${icon.chart} *MVI NEAC · INFORME AO COMANDO*`,
    `${icon.calendar} Emissão: ${issued.toLocaleDateString('pt-BR')}`,
    `${icon.pin} Área: ${scope.city || '10º BPM'}`,
    `${icon.folder} Planilha NEAC importada em: ${formatNeacImportDate(data)}`,
    divider,
    `${icon.people} *PANORAMA DO RECORTE*`,
    `*Vítimas elegíveis: ${rows.length}* · ${new Set(rows.map(row => row.city)).size} município(s)`,
    `${icon.info} Filtros: ${scopeLabel(scope)}`,
    '',
    `${icon.compare} *COMPARATIVO COM O ANO ANTERIOR*`,
    annual ? `${icon.bullet} ${annual.year - 1}: *${annual.previous}* vítima(s) · ${annual.previousStart} a ${annual.previousEnd}` : 'Informe datas dentro do mesmo ano para comparar.',
    annual ? `${icon.bullet} ${annual.year}: *${annual.current}* vítima(s) · ${annual.currentStart} a ${annual.currentEnd}` : '',
    annual ? `${direction} Diferença: *${difference}* · Variação: *${variation}*` : '',
    '',
    annual ? `${icon.months} *MÊS A MÊS · ${annual.year - 1} → ${annual.year}*` : '',
    annual ? annual.months.map(item => `${icon.bullet} ${monthName(item.month)}: ${item.previous} → ${item.current}`).join('\n') : '',
    '',
    `${icon.pin} *MUNICÍPIOS COM MAIS VÍTIMAS*`,
    top(count(rows, row => row.city), 5),
    '',
    `${icon.tag} *CLASSIFICAÇÕES MAIS FREQUENTES*`,
    top(count(rows, row => row.category || row.nature), 3),
    '',
    `${icon.clock} Horário informado: ${validHours} de ${rows.length} vítima(s).`,
    rows.length ? '' : 'Sem vítimas no recorte. Confira a importação NEAC e os filtros.',
    divider,
    `${icon.info} *Fonte:* NEAC, apenas vítimas elegíveis. CAD e NEAC não devem ser somados. Zero em um mês não confirma cobertura completa da planilha.`,
    '_Resumo agregado, sem nomes de vítimas ou números de ocorrência._',
  ]
  return lines.filter((line, index) => line || lines[index - 1] !== '').join('\n').trim()
}
