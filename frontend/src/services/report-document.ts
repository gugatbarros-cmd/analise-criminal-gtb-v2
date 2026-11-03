import { ageBand, bpmCities, comparisonScopes, count, filterReportRows, fold, hourBand, reportCatalog, scopeLabel, selectReportRows, weekday, type Entry, type ReportDataset, type ReportId, type ReportOptions, type ReportRow, type ReportScope } from './report-model'

import { mviConferences } from './report-spreadsheet'

export const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
const n = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
const asset = (name: string) => new URL(`${import.meta.env.BASE_URL}assets/reports/${name}`, location.origin).href
const table = (headers: string[], rows: unknown[][]) => rows.length ? `<table><thead><tr>${headers.map(v => `<th>${escapeHtml(v)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(value => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p class="empty">Sem registros no recorte.</p>'
function distribution(title: string, entries: Entry[], unit = 'registros'): string {
  const maximum = Math.max(1, ...entries.map(item => item[1]))
  const total = entries.reduce((sum, item) => sum + item[1], 0)
  const temporal = entries.length > 0 && entries.every(([label]) => /^\d{4}(?:-\d{2})?$/.test(label))
  const chartEntries = temporal ? entries : entries.slice(0, 8)
  const chart = entries.length ? `<div class="bar-chart" aria-label="${escapeHtml(title)}">${chartEntries.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><svg viewBox="0 0 200 16" preserveAspectRatio="none" aria-hidden="true"><rect width="200" height="16" rx="5" fill="#e8eef7"/><rect width="${200 * value / maximum}" height="16" rx="5" fill="#215b98"/></svg><b>${n(value)}</b></div>`).join('')}</div>` : ''
  return `<section class="distribution"><h3>${escapeHtml(title)}</h3>${chart}${!temporal && entries.length > 8 ? '<p class="note">Gráfico: oito maiores categorias. A tabela abaixo contém todas.</p>' : ''}${table(['Categoria', unit, 'Participação'], entries.map(([label, value]) => [label, n(value), total ? `${n(100 * value / total)}%` : '—']))}</section>`
}
const page = (title: string, content: string, subtitle = '') => `<section class="report-page"><h2>${escapeHtml(title)}</h2>${subtitle ? `<p class="subheading">${escapeHtml(subtitle)}</p>` : ''}${content}</section>`
const kpis = (values: [string, string | number][]) => `<div class="kpis">${values.map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${typeof value === 'number' ? n(value) : escapeHtml(value)}</strong></article>`).join('')}</div>`
function comparison(data: ReportDataset, id: ReportId, scope: ReportScope): string {
  const periods = comparisonScopes(data.rows, scope)
  if (!periods) return '<p class="empty">Sem data válida no ano selecionado para comparar períodos.</p>'
  const now = selectReportRows(filterReportRows(data.rows, periods.current), id)
  const before = selectReportRows(filterReportRows(data.rows, periods.previous), id)
  const measure = (rows: ReportRow[]) => id === 'armas' ? rows.filter(row => row.seized).reduce((sum, row) => sum + row.quantity, 0) : rows.length
  const previous = measure(before), current = measure(now)
  const variation = previous ? `${n(100 * (current - previous) / previous)}%` : 'Sem base comparável'
  return `<h3>Períodos equivalentes · ${periods.year - 1} × ${periods.year}</h3><p>Anterior: ${escapeHtml(periods.previous.start)} a ${escapeHtml(periods.previous.end)}. Atual: ${escapeHtml(periods.current.start)} a ${escapeHtml(periods.current.end)}.</p>${kpis([[String(periods.year - 1), previous], [String(periods.year), current], ['Variação', variation]])}<p class="note">A data de corte usa o limite final informado ou a última data disponível no recorte do ano. Zero no período anterior não produz percentual infinito. Ausência de registros não confirma cobertura completa.</p>`
}
function auditRows(rows: ReportRow[], id: ReportId): string {
  const mvi = id.startsWith('mvi-')
  return `<h3>${mvi ? 'Relação individual de vítimas elegíveis' : 'Relação auditável'}</h3>${table(['Data', 'Município', 'Ocorrência', ...(mvi ? ['Vítima'] : []), 'Natureza / classificação', ...(id === 'armas' ? ['Unidades', 'Calibre', 'Situação'] : id === 'drogas' ? ['Peso · g', 'Peso · kg'] : [])], rows.map(row => [row.date, row.city, row.occurrence || 'Sem identificador', ...(mvi ? [row.victim] : []), row.category || row.nature || 'Não informado', ...(id === 'armas' ? [row.quantity, row.caliber, row.situation] : id === 'drogas' ? [row.grams === null ? 'Não informado' : n(row.grams), row.grams === null ? 'Não informado' : n(row.grams / 1000)] : [])]))}`
}
function timeContent(rows: ReportRow[]): string {
  const valid = rows.filter(row => row.hour !== null)
  return kpis([['Horário válido', valid.length], ['Sem horário informado', rows.length - valid.length]])
    + distribution('Faixas estimadas de duas horas', count(valid, hourBand))
    + distribution('Dias da semana', count(rows, weekday))
    + table(['Município', 'Registros', 'Horários válidos', 'Faixa crítica', 'Ocorrências na faixa'], count(rows, row => row.city).map(([city, total]) => {
      const cityRows = valid.filter(row => row.city === city), bands = count(cityRows, hourBand), top = bands[0]
      return [city, total, cityRows.length, top ? top[0] + (bands[1]?.[1] === top[1] ? ' (empate)' : '') : 'Sem horário válido', top?.[1] ?? '—']
    }))
}
function domesticContent(all: ReportRow[], rows: ReportRow[]): string {
  const triage = all.filter(row => row.source === 'ocorrencias' && row.eligible)
  const totals = ['pending', 'excluded', 'outside'].map(status => triage.filter(row => row.indicators.includes(`Doméstica:${status}`)).length)
  return kpis([['Reconhecidas', rows.length], ['Pendentes', totals[0]], ['Não configuradas', totals[1]], ['Fora do recorte feminino', totals[2]]])
    + '<p>Somente ocorrências reconhecidas compõem os gráficos do tema. Pendências, negativas e perfil fora do recorte são apresentados separadamente. Campos ausentes permanecem “Não informado”.</p>'
    + distribution('Sexo/gênero da vítima informado', count(rows, row => row.sex))
    + distribution('Faixa etária da vítima', count(rows, ageBand))
    + distribution('Vínculo informado', count(rows, row => row.relationship))
    + distribution('Tipo de agressão informado', count(rows, row => row.aggression))
}
function moduleContent(data: ReportDataset, id: ReportId, scope: ReportScope, options: ReportOptions): string {
  const all = filterReportRows(data.rows, scope), rows = selectReportRows(all, id)
  const arms = id === 'armas', drugs = id === 'drogas', mvi = id.startsWith('mvi-')
  const weight = arms ? (row: ReportRow) => row.quantity : () => 1
  const monthlyRows = arms ? rows.filter(row => row.seized) : rows
  const month = count(monthlyRows, row => row.date.slice(0, 7), weight).sort((a, b) => a[0].localeCompare(b[0]))
  let content = comparison(data, id, scope)
  content += kpis([['Registros no recorte', rows.length], ['Municípios com registros', new Set(rows.map(row => row.city)).size]])
  if (arms) content += kpis([['Unidades informadas', rows.reduce((sum, row) => sum + row.quantity, 0)], ['Unidades apreendidas', rows.filter(row => row.seized).reduce((sum, row) => sum + row.quantity, 0)], ['Uso restrito', rows.filter(row => row.restricted).reduce((sum, row) => sum + row.quantity, 0)]])
  if (drugs) content += kpis([['Peso conhecido · g', rows.reduce((sum, row) => sum + (row.grams || 0), 0)], ['Peso conhecido · kg', rows.reduce((sum, row) => sum + (row.grams || 0), 0) / 1000], ['Sem peso reconhecido', rows.filter(row => row.grams === null).length]])
  if (id === 'domestica') content += domesticContent(all, rows)
  content += distribution(arms ? 'Evolução mensal · unidades apreendidas' : 'Evolução mensal', month)
    + distribution('Municípios', count(rows, row => row.city, weight))
    + distribution(arms || drugs ? 'Tipos' : 'Naturezas / classificações', count(rows, row => mvi || arms || drugs ? row.category || row.nature : row.nature || row.category, weight))
  if (arms) content += distribution('Calibres', count(rows, row => row.caliber, weight)) + distribution('Marcas', count(rows, row => row.brand, weight)) + distribution('Situações', count(rows, row => row.situation, weight))
  else if (drugs) content += distribution('Peso por tipo · g', count(rows.filter(row => row.grams !== null), row => row.category, row => row.grams || 0), 'gramas') + distribution('Locais das apreensões', count(rows, row => row.location))
  else if (id === 'guarnicoes') {
    const roster = rows.filter(row => row.teamGroup === 'roster')
    content += kpis([['Vínculos da escala', roster.length], ['Pontos da escala', roster.reduce((sum, row) => sum + row.points, 0)], ['Força-tarefa', rows.filter(row => row.teamGroup === 'extra').length], ['Outros recursos', rows.filter(row => row.teamGroup === 'unlisted').length]])
      + distribution('Guarnições da escala · pontos', count(roster, row => row.team, row => row.points), 'pontos')
      + distribution('Guarnições da escala · vínculos', count(roster, row => row.team))
      + distribution('Policiais da escala · pontos por vínculo', count(roster.flatMap(row => row.officers.map(officer => ({ ...row, team: `${officer.name} · ${officer.registration}` }))), row => row.team, row => row.points), 'pontos')
      + '<p>Uma ocorrência pode ter mais de uma equipe. Pontos e vínculos não equivalem a ocorrências únicas. Força-tarefa e outros recursos permanecem fora da soma da escala.</p>'
  } else {
    content += timeContent(rows) + distribution('Bairros e municípios', count(rows, row => row.neighborhood ? `${row.neighborhood} · ${row.city}` : 'Não informado')) + distribution('Meios empregados informados', count(rows, row => row.instrument)) + distribution('Soluções / encaminhamentos', count(rows, row => row.solution))
  }
  if (mvi) {
    content += '<p>Unidade: vítimas elegíveis da fonte identificada. CAD e NEAC são independentes e não devem ser somados.</p>'
      + distribution('Histórico anual', count(selectReportRows(filterReportRows(data.rows, { ...scope, year: undefined, month: undefined, start: undefined, end: undefined }), id), row => row.date.slice(0, 4)).sort((a, b) => a[0].localeCompare(b[0])))
      + distribution('Sexo informado', count(rows, row => row.sex)) + distribution('Faixas etárias', count(rows, ageBand))
    const history = selectReportRows(filterReportRows(data.rows, { city: scope.city }), id)
    content += '<h3>Dias sem MVI por município</h3>' + table(['Município', 'Último MVI até a referência', 'Dias sem registro'], (scope.city ? [scope.city] : bpmCities).map(city => {
      const last = history.filter(row => fold(row.city) === fold(city) && row.date <= options.referenceDate).map(row => row.date).sort().at(-1)
      return [city, last || 'Sem histórico conhecido', last ? Math.floor((Date.parse(options.referenceDate + 'T00:00:00Z') - Date.parse(last + 'T00:00:00Z')) / 86400000) : 'Não calculável']
    })) + `<p>Referência: ${escapeHtml(options.referenceDate)}. Considera o histórico conhecido até essa data; ausência de histórico não equivale a zero dias. Este quadro não é limitado ao ano ou mês do relatório.</p>`
  }
  return content + auditRows(rows, id)
}
function executiveContent(data: ReportDataset, scope: ReportScope): string {
  const rows = filterReportRows(data.rows, scope)
  const ids: ReportId[] = ['geral', 'mvi-cad', 'mvi-neac', 'cvp', 'tentativas', 'tco', 'mandados', 'visitas', 'sossego', 'domestica', 'armas', 'drogas']
  return kpis(ids.map(id => [reportCatalog.find(item => item.id === id)!.title, selectReportRows(rows, id).length]))
    + '<p>Armas e drogas neste quadro indicam registros das bases próprias. Unidades e pesos constam nos relatórios específicos. Fontes sem importação são identificadas na memória das bases.</p>'
    + ids.map(id => `<div class="comparison-block"><h3>${escapeHtml(reportCatalog.find(item => item.id === id)!.title)}</h3>${comparison(data, id, scope)}</div>`).join('')
}
function tcoPages(data: ReportDataset, scope: ReportScope): string {
  const rows = selectReportRows(filterReportRows(data.rows, scope), 'tco')
  return page('1. TCO · períodos equivalentes', comparison(data, 'tco', scope) + '<p>Critério: TCOs reconhecidos pelo processamento da base geral, sem somar vínculos de equipes.</p>')
    + page('2. TCO · evolução mensal', distribution('TCOs por mês', count(rows, row => row.date.slice(0, 7)).sort((a, b) => a[0].localeCompare(b[0]))))
    + page('3. TCO · municípios', distribution('TCOs por município', count(rows, row => row.city)))
    + page('4. TCO · naturezas', distribution('Naturezas registradas', count(rows, row => row.nature)))
    + page('5. TCO · perfil municipal', table(['Município', 'TCOs', 'Naturezas identificadas'], count(rows, row => row.city).map(([city, total]) => [city, total, count(rows.filter(row => row.city === city), row => row.nature).map(([label, value]) => `${label} (${value})`).join('; ')])) + auditRows(rows, 'tco'))
}
export function buildReportDocument(data: ReportDataset, id: ReportId, scope: ReportScope, options: ReportOptions, version: string): string {
  const title = options.title?.trim() || reportCatalog.find(item => item.id === id)!.title
  const emitted = options.issued || new Date().toLocaleString('pt-BR')
  const metadata = `<p>${escapeHtml(scopeLabel(scope))}</p><p>Emissão: ${escapeHtml(emitted)} · Atualização das bases: ${escapeHtml(data.updatedAt || 'Sem importações')} · Sistema ${escapeHtml(version)}</p>`
  const letterhead = `<header class="letterhead"><img src="${asset('logo-10bpm-3d-estatistica.png')}" alt="Brasão do 10º BPM"><div><strong>POLÍCIA MILITAR DE ALAGOAS</strong><span>${escapeHtml(options.unit || '10º Batalhão de Polícia Militar')}</span><small>Palmeira dos Índios · AL</small></div></header>`
  const landscape = id === 'folder' || id === 'planejamento'
  const cover = `<section class="report-cover ${id === 'folder' ? 'folder-cover' : ''}">${letterhead}<p class="eyebrow">ANÁLISE CRIMINAL · 10º BPM</p><h1>${escapeHtml(title)}</h1>${metadata}<p>Responsável: ${escapeHtml(options.author || 'Não informado')}</p></section>`
  let content = ''
  if (['consolidado', 'institucional'].includes(id)) {
    content = page('Visão executiva', executiveContent(data, scope))
    const modules: ReportId[] = ['geral', 'mvi-cad', 'mvi-neac', 'tentativas', 'domestica', 'mandados', 'visitas', 'tco', 'cvp', 'armas', 'drogas', 'sossego', 'guarnicoes']
    content += modules.map(module => page(reportCatalog.find(item => item.id === module)!.title, moduleContent(data, module, scope, options))).join('')
  } else if (id === 'conferencia-mvi') content = page('Conferência independente CAD × NEAC', '<p>Correspondência conservadora por nome completo, data e município. Possíveis pares exigem revisão humana; casos ambíguos não recebem vínculo automático. Os totais das fontes não são somados.</p>' + table(['Situação para revisão', 'Data NEAC', 'Município', 'Vítima NEAC', 'Ocorrência NEAC', 'Ocorrência CAD'], mviConferences(filterReportRows(data.rows, scope)).map(item => [item.status, item.neac.date, item.neac.city, item.neac.victim, item.neac.occurrence, item.cad?.occurrence || ''])))
  else if (id === 'tco') content = tcoPages(data, scope)
  else if (id === 'executivo' || id === 'folder') {
    const rows = selectReportRows(filterReportRows(data.rows, scope), 'geral')
    content = page('Indicadores e comparativos para reunião', executiveContent(data, scope))
      + page('Concentração territorial e naturezas', distribution('Municípios', count(rows, row => row.city)) + distribution('Naturezas mais frequentes', count(rows, row => row.nature)))
      + page('Evolução mensal e horários', distribution('Ocorrências por mês', count(rows, row => row.date.slice(0, 7)).sort((a, b) => a[0].localeCompare(b[0]))) + timeContent(rows))
  } else if (id === 'horarios') content = page('Horários críticos e leitura municipal', timeContent(selectReportRows(filterReportRows(data.rows, scope), 'geral')))
  else if (id === 'planejamento') content = page('Missão, recursos e ações propostas', `<h3>Missão e contexto</h3><div class="narrative">${escapeHtml(options.notes || 'Preencha a missão e os recursos nas observações antes de emitir.')}</div><h3>Ações, efetivo, responsáveis e prazos</h3><div class="narrative">${escapeHtml(options.actions || 'Preencha as ações e a distribuição do efetivo.')}</div>` + distribution('Territórios com registros no recorte', count(selectReportRows(filterReportRows(data.rows, scope), 'geral'), row => row.city)) + '<p>A prancha apoia o planejamento; não substitui ordem de serviço nem confirma risco individual.</p>')
  else content = page(title, moduleContent(data, id, scope, options))
  const coverage = Object.entries(data.rows.reduce<Record<string, number>>((acc, row) => { acc[row.source] = (acc[row.source] || 0) + 1; return acc }, {}))
  const memory = page('Memória, fonte e qualidade', table(['Fonte processada', 'Registros correntes na base completa'], ['ocorrencias', 'mvi_cad', 'mvi_neac', 'armas', 'drogas', 'guarnicoes'].map(source => [source, coverage.find(entry => entry[0] === source)?.[1] ?? 'Base não importada']))
    + `<p>${n(data.batches)} lotes processados. ${n(data.quarantined)} linhas em quarentena na base completa (fora dos totais destes relatórios). Os filtros e regras de cada fonte determinam os números do recorte. Somente as versões correntes entram nas contagens. Não é uma confirmação de paridade oficial ou de cobertura completa.</p><p>Filtros: ${escapeHtml(scopeLabel(scope))}.</p>`
    + `<h3>Análise do responsável</h3><div class="narrative">${escapeHtml(options.notes || 'Sem observações adicionais.')}</div><h3>Encaminhamentos</h3><div class="narrative">${escapeHtml(options.actions || 'Sem encaminhamentos informados.')}</div>`)
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>
@page{size:A4 ${landscape ? 'landscape' : 'portrait'};margin:14mm}*{box-sizing:border-box}body{margin:0;background:#edf2f8;color:#17324d;font:13px/1.55 Segoe UI,Arial,sans-serif}h1,h2,h3{color:#0b335e;line-height:1.25}h1{font-size:42px}h2{font-size:25px;border-bottom:3px solid #d5a83e;padding-bottom:12px}h3{font-size:17px;margin-top:26px}.report-cover,.report-page{max-width:${landscape ? '1100' : '850'}px;margin:20px auto;background:white;padding:40px;box-shadow:0 4px 24px #1232}.report-cover{min-height:640px;display:flex;flex-direction:column;justify-content:center;border-top:8px solid #d5a83e}.folder-cover{background:linear-gradient(90deg,#041d3bf5,#041d3bc0),url('${asset('capa-folder-analise-criminal.png')}') center/cover;color:white}.folder-cover h1,.folder-cover .letterhead{color:white}.letterhead{display:flex;align-items:center;gap:18px;margin-bottom:48px}.letterhead img{width:90px;height:100px;object-fit:contain}.letterhead span,.letterhead small{display:block}.letterhead strong{font-size:15px}.eyebrow{text-transform:uppercase;letter-spacing:.15em;color:#ad7c16;font-size:12px}.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin:20px 0}.kpis article{border:1px solid #dbe4ee;border-radius:12px;padding:16px;background:#f7faff;break-inside:avoid}.kpis span{display:block;font-size:11px}.kpis strong{display:block;font-size:26px;color:#15467a;margin-top:8px}table{width:100%;border-collapse:collapse;margin:12px 0 22px;font-size:11px;table-layout:fixed;overflow-wrap:anywhere}th,td{padding:8px;border:1px solid #d7e0eb;text-align:left;vertical-align:top}th{background:#eaf0f8;color:#123d72}thead{display:table-header-group}tr{break-inside:avoid}.note,.empty{color:#637789;font-size:11px}.narrative{white-space:pre-wrap;border-left:3px solid #d5a83e;padding:10px 16px;overflow-wrap:anywhere}.bar-chart>div{display:grid;grid-template-columns:minmax(100px,35%) 1fr 60px;gap:10px;align-items:center;margin:12px 0;font-size:11px}.bar-chart svg{width:100%;height:16px}.bar-chart b{text-align:right}.distribution{margin-bottom:32px}.comparison-block{break-inside:avoid}.subheading{color:#64768a}@media(max-width:600px){.report-cover,.report-page{padding:20px;margin:10px}.letterhead{gap:12px}.letterhead img{width:60px;height:72px}h1{font-size:30px}.bar-chart>div{grid-template-columns:40% 1fr 40px}}
@media print{body{background:white;-webkit-print-color-adjust:exact;print-color-adjust:exact}.report-cover,.report-page{margin:0;padding:0;max-width:none;box-shadow:none;break-after:page}.report-cover{min-height:${landscape ? '170' : '250'}mm;padding:12mm}.report-page:last-child{break-after:auto}.distribution h3,h3{break-after:avoid}.bar-chart{break-inside:avoid}.kpis{grid-template-columns:repeat(3,1fr)}}
</style></head><body>${cover}${content}${memory}</body></html>`
}
export async function printReport(html: string): Promise<void> {
  const popup = window.open('', '_blank')
  if (!popup) throw Error('Permita a abertura de janelas para imprimir o relatório.')
  popup.opener = null
  popup.document.open(); popup.document.write(html); popup.document.close()
  await Promise.all(Array.from(popup.document.images).map(image => image.complete ? Promise.resolve() : new Promise(resolve => { image.onload = resolve; image.onerror = resolve })))
  await popup.document.fonts.ready
  popup.focus(); popup.print()
}
export function reportCsv(data: ReportDataset, id: ReportId, scope: ReportScope): string {
  const all = filterReportRows(data.rows, scope)
  const rows = ['consolidado', 'institucional'].includes(id) ? all.filter(row => row.eligible) : selectReportRows(all, id)
  const cell = (value: unknown) => { let text = String(value ?? ''); if (/^(?:\s*[=+@\-]|[\t\r])/.test(text)) text = "'" + text; return '"' + text.replace(/"/g, '""') + '"' }
  if (id === 'conferencia-mvi') return '\ufeff' + [['Situação', 'Data NEAC', 'Município', 'Vítima NEAC', 'Ocorrência NEAC', 'Ocorrência CAD'], ...mviConferences(all).map(item => [item.status, item.neac.date, item.neac.city, item.neac.victim, item.neac.occurrence, item.cad?.occurrence || ''])].map(row => row.map(cell).join(';')).join('\r\n')
  return '\ufeff' + [['Fonte', 'Data', 'Município', 'Ocorrência', 'Vítima (MVI)', 'Natureza', 'Classificação', 'Unidades (armas)', 'Peso em g (drogas)'], ...rows.map(row => [row.source, row.date, row.city, row.occurrence, row.victim, row.nature, row.category, row.source === 'armas' ? row.quantity : '', row.source === 'drogas' ? row.grams : ''])].map(row => row.map(cell).join(';')).join('\r\n')
}

export function summaryCsv(data: ReportDataset, scope: ReportScope): string {
  const rows = filterReportRows(data.rows, scope), general = selectReportRows(rows, 'geral')
  const contents: unknown[][] = [['Grupo', 'Descrição', 'Quantidade', 'Unidade']]
  for (const id of ['geral', 'mvi-cad', 'mvi-neac', 'cvp', 'tentativas', 'tco', 'mandados', 'visitas', 'sossego', 'domestica'] as ReportId[]) {
    contents.push(['Indicador', reportCatalog.find(item => item.id === id)!.title, selectReportRows(rows, id).length, id.startsWith('mvi-') ? 'vítimas' : 'ocorrências'])
  }
  const arms = selectReportRows(rows, 'armas'), drugs = selectReportRows(rows, 'drogas')
  contents.push(['Indicador', 'Armas apreendidas', arms.filter(row => row.seized).reduce((sum, row) => sum + row.quantity, 0), 'unidades'], ['Indicador', 'Peso conhecido de drogas', drugs.reduce((sum, row) => sum + (row.grams || 0), 0), 'g'])
  for (const [title, group] of [['Natureza', count(general, row => row.nature)], ['Município', count(general, row => row.city)]] as [string, Entry[]][]) {
    group.forEach(([label, total]) => contents.push([title, label, total, 'ocorrências']))
  }
  return '\ufeff' + contents.map(row => row.map(value => { let text = String(value ?? ''); if (/^(?:\s*[=+@\-]|[\t\r])/.test(text)) text = "'" + text; return '"' + text.replace(/"/g, '""') + '"' }).join(';')).join('\r\n')
}
