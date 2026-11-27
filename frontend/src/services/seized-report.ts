import { escapeHtml } from './report-document'
import { loadXlsx } from './report-spreadsheet'
import {
  ageDistribution, brDate, countBy, monthlyDeposits, processStage, REPORT_HEADERS, reportRow, summarizeDepots, type SeizedItem,
} from './seized-materials'

type Entry = { name: string; total: number }
export type SeizedReportInfo = { scopeLabel: string; author: string; version: string; readAt: string }

const PALETTE = ['#0a3d75', '#d5a83e', '#c1121f', '#3f7cc0', '#2a9d8f', '#7a5195', '#ef8a17', '#8c9bab']
const AGE_COLORS = ['#2a9d8f', '#8ab17d', '#e9c46a', '#f4a261', '#c1121f']
const CLOSED_STAGES = ['ARQUIVADO', 'JULGADO', 'DEVOLVIDO']
const n = (value: number) => value.toLocaleString('pt-BR')
const pct = (part: number, total: number) => total ? `${(100 * part / total).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '0%'
const h = escapeHtml
const asset = (name: string) => {
  const path = `${import.meta.env.BASE_URL}assets/reports/${name}`
  return typeof location === 'undefined' ? path : new URL(path, location.origin).href
}

/** Números e achados usados na visão executiva, no PDF e no Excel. */
export function seizedInsights(items: SeizedItem[]) {
  const seized = items.filter(item => item.situation === 'apreendido')
  const returned = items.filter(item => item.situation === 'devolvido')
  const days = seized.map(item => item.days).filter((value): value is number => value !== null).sort((a, b) => a - b)
  const median = days.length ? (days.length % 2 ? days[(days.length - 1) / 2] : Math.round((days[days.length / 2 - 1] + days[days.length / 2]) / 2)) : 0
  const overYear = seized.filter(item => (item.days ?? 0) > 365)
  const closedWithSeized = seized.filter(item => CLOSED_STAGES.includes(processStage(item.processStatus).toUpperCase()))
    .sort((a, b) => (b.days ?? -1) - (a.days ?? -1))
  const oldestItems = [...seized].filter(item => item.days !== null).sort((a, b) => b.days! - a.days!).slice(0, 15)
  const top = (entries: Entry[]) => entries[0] || { name: '—', total: 0 }
  return {
    total: items.length, seized: seized.length, returned: returned.length,
    averageDays: days.length ? Math.round(days.reduce((sum, value) => sum + value, 0) / days.length) : 0,
    medianDays: median, oldest: days.length ? days[days.length - 1] : 0,
    overYear: overYear.length, closedWithSeized, oldestItems,
    topDepot: top(countBy(seized, item => item.depot)), topCategory: top(countBy(items, item => item.category)),
    topComarca: top(countBy(items, item => item.comarca)), topCity: top(countBy(items, item => item.city)),
  }
}

export function seizedFindings(items: SeizedItem[]): string[] {
  const data = seizedInsights(items)
  if (!data.total) return ['Nenhum item atende à seleção do relatório.']
  const findings = [
    `<strong>${n(data.seized)}</strong> de ${n(data.total)} itens (${pct(data.seized, data.total)}) permanecem apreendidos; <strong>${n(data.returned)}</strong> foram devolvidos (${pct(data.returned, data.total)}).`,
  ]
  if (data.seized) {
    findings.push(`Os itens apreendidos estão em depósito há <strong>${n(data.averageDays)} dias</strong> em média (mediana de ${n(data.medianDays)} dias); o mais antigo soma <strong>${n(data.oldest)} dias</strong>.`)
    findings.push(`<strong>${n(data.overYear)}</strong> itens apreendidos (${pct(data.overYear, data.seized)}) estão há mais de um ano em depósito.`)
    findings.push(`O maior volume de itens apreendidos está no <strong>${h(data.topDepot.name)}</strong> (${n(data.topDepot.total)} itens, ${pct(data.topDepot.total, data.seized)}).`)
  }
  findings.push(`A categoria predominante é <strong>${h(data.topCategory.name)}</strong> (${pct(data.topCategory.total, data.total)} dos itens), e a comarca com mais registros é <strong>${h(data.topComarca.name)}</strong> (${n(data.topComarca.total)}).`)
  if (data.closedWithSeized.length)
    findings.push(`<strong>${n(data.closedWithSeized.length)}</strong> itens seguem apreendidos embora o processo conste como arquivado, julgado ou devolvido no ESAJ: candidatos a restituição ou destinação.`)
  return findings
}

// ---------- Gráficos (SVG e HTML, nítidos na impressão) ----------

function donut(entries: Entry[], label = 'itens'): string {
  const valid = entries.filter(entry => entry.total > 0)
  const total = valid.reduce((sum, entry) => sum + entry.total, 0)
  if (!total) return '<p class="empty">Sem dados no recorte.</p>'
  let offset = 0
  const arcs = valid.map((entry, index) => {
    const length = 100 * entry.total / total
    const arc = `<circle cx="80" cy="80" r="58" pathLength="100" fill="none" stroke="${PALETTE[index % PALETTE.length]}" stroke-width="26" stroke-dasharray="${length} ${100 - length}" stroke-dashoffset="${-offset}" transform="rotate(-90 80 80)"/>`
    offset += length
    return arc
  }).join('')
  const legend = valid.map((entry, index) => `<li><i style="background:${PALETTE[index % PALETTE.length]}"></i><span>${h(entry.name)}</span><b>${n(entry.total)}</b><em>${pct(entry.total, total)}</em></li>`).join('')
  return `<div class="donut"><svg viewBox="0 0 160 160" role="img" aria-label="${h(`${n(total)} ${label}`)}"><circle cx="80" cy="80" r="58" fill="none" stroke="#eef2f7" stroke-width="26"/>${arcs}<text x="80" y="78" text-anchor="middle" class="donut-total">${n(total)}</text><text x="80" y="96" text-anchor="middle" class="donut-label">${h(label)}</text></svg><ul>${legend}</ul></div>`
}

function bars(entries: Entry[], colors: string[] = PALETTE, single = false): string {
  const total = entries.reduce((sum, entry) => sum + entry.total, 0)
  const maximum = Math.max(1, ...entries.map(entry => entry.total))
  if (!total) return '<p class="empty">Sem dados no recorte.</p>'
  return `<div class="bars">${entries.map((entry, index) => `<div class="bar-row"><span title="${h(entry.name)}">${h(entry.name)}</span><div class="bar-track"><div class="bar-fill" style="width:${(100 * entry.total / maximum).toFixed(1)}%;background:${single ? colors[0] : colors[index % colors.length]}"></div></div><b>${n(entry.total)}</b><em>${pct(entry.total, total)}</em></div>`).join('')}</div>`
}

function columns(series: Entry[]): string {
  if (!series.some(entry => entry.total)) return '<p class="empty">Sem datas de depósito no recorte.</p>'
  const width = 760, height = 210, left = 34, bottom = 30, top = 18
  const maximum = Math.max(1, ...series.map(entry => entry.total))
  const step = (width - left - 8) / series.length
  const barWidth = Math.max(6, step * .62)
  const y = (value: number) => top + (height - top - bottom) * (1 - value / maximum)
  const grid = [0, .5, 1].map(fraction => { const value = Math.round(maximum * fraction); return `<line x1="${left}" x2="${width - 4}" y1="${y(value)}" y2="${y(value)}" class="grid"/><text x="${left - 6}" y="${y(value) + 3}" text-anchor="end" class="axis">${n(value)}</text>` }).join('')
  const columnsSvg = series.map((entry, index) => {
    const x = left + index * step + (step - barWidth) / 2
    return `<rect x="${x.toFixed(1)}" y="${y(entry.total).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${(height - bottom - y(entry.total)).toFixed(1)}" rx="3" fill="#0a3d75"/>${entry.total ? `<text x="${(x + barWidth / 2).toFixed(1)}" y="${(y(entry.total) - 4).toFixed(1)}" text-anchor="middle" class="value">${n(entry.total)}</text>` : ''}<text x="${(x + barWidth / 2).toFixed(1)}" y="${height - 12}" text-anchor="middle" class="axis">${h(entry.name)}</text>`
  }).join('')
  return `<svg class="columns" viewBox="0 0 ${width} ${height}" role="img" aria-label="Entradas no depósito por mês">${grid}${columnsSvg}</svg>`
}

const kpi = (label: string, value: string, note = '', tone = '') => `<article class="kpi ${tone}"><span>${h(label)}</span><strong>${value}</strong>${note ? `<small>${h(note)}</small>` : ''}</article>`
const card = (title: string, body: string, wide = false) => `<section class="chart-card${wide ? ' wide' : ''}"><h3>${h(title)}</h3>${body}</section>`
const table = (headers: string[], rows: (string | number)[][], className = '') => rows.length
  ? `<table class="${className}"><thead><tr>${headers.map(header => `<th>${h(header)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(value => `<td>${h(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
  : '<p class="empty">Nenhum item nesta condição.</p>'

const STYLE = `
@page{size:A4 landscape;margin:11mm 11mm 14mm}
@page{@bottom-left{content:"10º BPM · Materiais apreendidos";font:8px Segoe UI,Arial,sans-serif;color:#7b8ca0}@bottom-right{content:"Página " counter(page) " de " counter(pages);font:8px Segoe UI,Arial,sans-serif;color:#7b8ca0}}
*{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#e9eef5;color:#17324d;font:10.5px/1.45 "Segoe UI",Arial,sans-serif}
.page{width:275mm;min-height:180mm;margin:14px auto;padding:9mm 10mm;background:#fff;box-shadow:0 6px 28px rgba(16,40,72,.14);position:relative;break-after:page}
.page:last-child{break-after:auto}
.band{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:-9mm -10mm 7mm;padding:5mm 10mm;background:linear-gradient(90deg,#041d3b,#0a3d75);color:#fff;border-bottom:3px solid #d5a83e}
.band strong{font-size:15px;letter-spacing:.01em}.band span{color:#f0c359;font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
h2{margin:0 0 3mm;color:#0a315e;font-size:17px}h3{margin:0 0 6px;color:#0a315e;font-size:11.5px}
.lead{margin:0 0 5mm;color:#5d7186}
.cover{display:grid;grid-template-columns:1.35fr 1fr;min-height:186mm;padding:0;overflow:hidden}
.cover-main{display:flex;flex-direction:column;justify-content:space-between;padding:14mm 13mm;background:radial-gradient(circle at 15% 10%,#164a86 0,#062a55 45%,#041d3b 100%);color:#fff}
.letterhead{display:flex;align-items:center;gap:14px}.letterhead img{width:62px;height:72px;object-fit:contain}
.letterhead strong,.letterhead span,.letterhead small{display:block}.letterhead strong{font-size:13px;letter-spacing:.04em}.letterhead span{color:#dbe6f3}.letterhead small{color:#f0c359}
.cover h1{margin:0;font-size:38px;line-height:1.08;letter-spacing:-.02em}.cover h1 em{display:block;color:#f0c359;font-style:normal}
.cover .eyebrow{color:#f0c359;font-size:10px;font-weight:800;letter-spacing:.18em;text-transform:uppercase}
.cover-meta{display:grid;gap:4px;padding-top:6mm;border-top:1px solid rgba(255,255,255,.22);color:#c9d8ea;font-size:9.5px}.cover-meta b{color:#fff}
.cover-side{display:grid;align-content:center;gap:4mm;padding:12mm 11mm;background:#f6f9fd}
.cover-side .kpi{padding:5mm 6mm}.cover-side .kpi strong{font-size:30px}
.kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:3mm;margin-bottom:5mm}
.kpi{border:1px solid #dbe4ee;border-radius:10px;padding:3.2mm 4mm;background:#fff;border-top:3px solid #0a3d75}
.kpi span{display:block;color:#5d7186;font-size:8.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.kpi strong{display:block;margin-top:1mm;color:#082f5d;font-size:21px;line-height:1.1;font-variant-numeric:tabular-nums}
.kpi small{display:block;margin-top:1mm;color:#7b8ca0;font-size:8.5px}
.kpi.gold{border-top-color:#d5a83e}.kpi.green{border-top-color:#2a9d8f}.kpi.red{border-top-color:#c1121f}
.exec{display:grid;grid-template-columns:1.25fr 1fr;gap:6mm}
.findings{margin:0;padding:0;list-style:none;display:grid;gap:2.6mm}
.findings li{position:relative;padding:2.6mm 3.5mm 2.6mm 9mm;border-radius:8px;background:#f6f9fd;border:1px solid #e3eaf3}
.findings li::before{content:"";position:absolute;left:3.5mm;top:3.6mm;width:2.4mm;height:2.4mm;border-radius:50%;background:#d5a83e}
.findings strong{color:#0a315e}
.charts{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}.charts.two{grid-template-columns:repeat(2,1fr)}
.chart-card{border:1px solid #dbe4ee;border-radius:10px;padding:3.5mm 4mm;background:#fff;break-inside:avoid}
.chart-card.wide{grid-column:1/-1}
.donut{display:grid;grid-template-columns:34mm 1fr;align-items:center;gap:4mm}.donut svg{width:34mm;height:34mm}
.donut-total{font-size:24px;font-weight:800;fill:#082f5d}.donut-label{font-size:10px;fill:#7b8ca0}
.donut ul{margin:0;padding:0;list-style:none;display:grid;gap:1.6mm}
.donut li{display:grid;grid-template-columns:3mm 1fr auto 11mm;align-items:center;gap:2mm;font-size:9.5px}
.donut li i{width:3mm;height:3mm;border-radius:2px}.donut li b{font-variant-numeric:tabular-nums}.donut li em{color:#7b8ca0;font-style:normal;text-align:right}
.bars{display:grid;gap:1.8mm}
.bar-row{display:grid;grid-template-columns:34% 1fr 9mm 10mm;align-items:center;gap:2mm;font-size:9.5px}
.bar-row span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.bar-track{height:3.6mm;border-radius:99px;background:#eef2f7;overflow:hidden}.bar-fill{height:100%;border-radius:99px}
.bar-row b{text-align:right;font-variant-numeric:tabular-nums}.bar-row em{color:#7b8ca0;font-style:normal;text-align:right}
svg.columns{width:100%;height:auto}svg .grid{stroke:#e3eaf3}svg .axis{font-size:9px;fill:#7b8ca0}svg .value{font-size:9px;font-weight:700;fill:#0a315e}
.alert{display:flex;gap:4mm;align-items:center;margin-bottom:4mm;padding:3mm 4mm;border-radius:10px;background:#fff6e5;border:1px solid #f0d08a;color:#6f4f0a}
.alert strong{font-size:20px;color:#9a6b00}
table{width:100%;border-collapse:collapse;table-layout:fixed;overflow-wrap:anywhere;font-size:9px}
th,td{padding:1.6mm 2mm;border-bottom:1px solid #e3eaf3;text-align:left;vertical-align:top}
th{background:#0a3d75;color:#fff;font-size:8.3px;font-weight:700;letter-spacing:.03em}
thead{display:table-header-group}tr{break-inside:avoid}tbody tr:nth-child(even) td{background:#f7f9fc}
td:last-child,th:last-child{text-align:right}
table.items th:nth-child(1){width:12%}table.items th:nth-child(2),table.items th:nth-child(3),table.items th:nth-child(10){width:7%}table.items th:nth-child(4){width:7.5%}table.items th:nth-child(5){width:18.5%}table.items th:nth-child(6){width:10%}table.items th:nth-child(7){width:8%}table.items th:nth-child(8){width:7%}table.items th:nth-child(9){width:10%}table.items th:nth-child(11){width:6%}
.depot-head{display:grid;grid-template-columns:1fr 1.1fr;gap:5mm;margin-bottom:4mm;align-items:start}
.depot-head .kpis{grid-template-columns:repeat(2,1fr);margin:0}
.method{display:grid;grid-template-columns:1fr 1fr;gap:6mm}.method p{margin:0 0 2.5mm}
.signature{margin-top:14mm;display:grid;grid-template-columns:repeat(2,1fr);gap:20mm}.signature div{border-top:1px solid #8c9bab;padding-top:2mm;text-align:center;color:#5d7186}
.empty{color:#7b8ca0}
@media print{body{background:#fff}.page{margin:0;width:auto;min-height:auto;box-shadow:none;padding:0}.band{margin:0 0 6mm;border-radius:6px}.cover{min-height:186mm}}
`

function band(title: string, info: SeizedReportInfo) {
  return `<div class="band"><strong>${h(title)}</strong><span>Materiais apreendidos · 10º BPM · leitura ${h(info.readAt)}</span></div>`
}

function itemTable(items: SeizedItem[]) {
  return table(REPORT_HEADERS, items.map(reportRow), 'items')
}

/** Relatório completo para impressão ou PDF: capa, visão executiva, painel gráfico, atenção e depósitos. */
export function buildSeizedReportHtml(items: SeizedItem[], info: SeizedReportInfo): string {
  const data = seizedInsights(items)
  const depots = summarizeDepots(items)
  const seizedItems = items.filter(item => item.situation === 'apreendido')
  const emitted = new Date().toLocaleString('pt-BR')

  const cover = `<section class="page cover">
<div class="cover-main">
  <header class="letterhead"><img src="${asset('logo-10bpm-3d-estatistica.png')}" alt="Brasão do 10º BPM"><div><strong>POLÍCIA MILITAR DE ALAGOAS</strong><span>10º Batalhão de Polícia Militar</span><small>Palmeira dos Índios · AL</small></div></header>
  <div><p class="eyebrow">Análise criminal · controle de depósitos</p><h1>Relatório de<em>materiais apreendidos</em></h1></div>
  <div class="cover-meta"><span><b>Recorte:</b> ${h(info.scopeLabel)}</span><span><b>Emissão:</b> ${h(emitted)} · <b>Leitura da planilha:</b> ${h(info.readAt)}</span><span><b>Responsável:</b> ${h(info.author || 'Não informado')} · <b>Sistema:</b> GTB 2.0 ${h(info.version)}</span></div>
</div>
<div class="cover-side">
  ${kpi('Itens no relatório', n(data.total), `${n(depots.length)} depósito(s)`)}
  ${kpi('Apreendidos', n(data.seized), pct(data.seized, data.total) + ' do total', 'gold')}
  ${kpi('Devolvidos', n(data.returned), pct(data.returned, data.total) + ' do total', 'green')}
  ${kpi('Há mais de 1 ano', n(data.overYear), 'itens apreendidos', 'red')}
</div></section>`

  const executive = `<section class="page">${band('Visão executiva', info)}
<div class="kpis">
  ${kpi('Itens', n(data.total))}${kpi('Apreendidos', n(data.seized), '', 'gold')}${kpi('Devolvidos', n(data.returned), pct(data.returned, data.total) + ' de devolução', 'green')}
  ${kpi('Média em depósito', `${n(data.averageDays)} d`, `mediana ${n(data.medianDays)} dias`)}${kpi('Mais antigo', `${n(data.oldest)} d`, 'item apreendido', 'red')}${kpi('Processos encerrados', n(data.closedWithSeized.length), 'com bem ainda apreendido', 'red')}
</div>
<div class="exec">
  <div><h3>Principais leituras</h3><ul class="findings">${seizedFindings(items).map(text => `<li>${text}</li>`).join('')}</ul></div>
  <div class="charts" style="grid-template-columns:1fr">
    ${card('Itens apreendidos por depósito', donut(countBy(seizedItems, item => item.depot), 'apreendidos'))}
    ${card('Tempo em depósito dos itens apreendidos', bars(ageDistribution(items), AGE_COLORS))}
  </div>
</div></section>`

  const charts = `<section class="page">${band('Painel gráfico', info)}
<div class="charts">
  ${card('Por categoria', donut(countBy(items, item => item.category, 6)))}
  ${card('Por comarca', bars(countBy(items, item => item.comarca, 8), ['#0a3d75'], true))}
  ${card('Situação', donut([{ name: 'Apreendidos', total: data.seized }, { name: 'Devolvidos', total: data.returned }, { name: 'Outras', total: data.total - data.seized - data.returned }]))}
  ${card('Entradas no depósito por mês (últimos 18 meses)', columns(monthlyDeposits(items)), true)}
  ${card('Município do fato', bars(countBy(items, item => item.city, 8), ['#3f7cc0'], true))}
  ${card('Andamento no ESAJ', bars(countBy(items, item => processStage(item.processStatus), 8), ['#d5a83e'], true))}
  ${card('Tipicidade', bars(countBy(items.filter(item => item.typification), item => item.typification.length > 48 ? `${item.typification.slice(0, 46)}…` : item.typification, 6), ['#7a5195'], true))}
</div></section>`

  const attention = `<section class="page">${band('Pontos de atenção', info)}
${data.closedWithSeized.length ? `<div class="alert"><strong>${n(data.closedWithSeized.length)}</strong><span>itens continuam apreendidos com o processo arquivado, julgado ou devolvido no ESAJ. Verificar restituição ao proprietário ou destinação do bem.</span></div>` : ''}
<h3>Processo encerrado no ESAJ com bem ainda apreendido</h3>
${table(['Nº do processo (ESAJ)', 'Nº da ocorrência', 'Bem apreendido', 'Depósito', 'Comarca', 'Andamento ESAJ', 'Dias'], data.closedWithSeized.slice(0, 25).map(item => [item.process || '—', item.occurrence, item.description, item.depot, item.comarca, item.processStatus, item.days ?? '']))}
${data.closedWithSeized.length > 25 ? `<p class="empty">Mais ${n(data.closedWithSeized.length - 25)} itens nesta condição constam na relação de cada depósito e na planilha Excel.</p>` : ''}
<h3 style="margin-top:5mm">Itens há mais tempo em depósito</h3>
${table(['Nº do processo (ESAJ)', 'Data de depósito', 'Bem apreendido', 'Depósito', 'Comarca', 'Andamento ESAJ', 'Dias'], data.oldestItems.map(item => [item.process || '—', brDate(item.depositDate), item.description, item.depot, item.comarca, item.processStatus, item.days ?? '']))}
</section>`

  const depotPages = depots.map(depot => {
    const rows = items.filter(item => item.depotKey === depot.key).sort((a, b) => (b.days ?? -1) - (a.days ?? -1))
    const depotData = seizedInsights(rows)
    return `<section class="page">${band(depot.label, info)}
<div class="depot-head">
  <div class="kpis">${kpi('Itens', n(depot.total))}${kpi('Apreendidos', n(depot.seized), '', 'gold')}${kpi('Devolvidos', n(depot.returned), '', 'green')}${kpi('Média em depósito', `${n(depotData.averageDays)} d`, `mais antigo ${n(depotData.oldest)} dias`, 'red')}</div>
  ${card('Categorias neste depósito', bars(countBy(rows, item => item.category, 6)))}
</div>
<h3>Relação completa · ${n(rows.length)} item(ns), do mais antigo ao mais recente em depósito</h3>
${itemTable(rows)}</section>`
  }).join('')

  const method = `<section class="page">${band('Metodologia e fonte', info)}
<div class="method"><div>
<h3>Fonte</h3><p>Planilha de controle de materiais apreendidos do 10º BPM (aba PLAN DADOS COMPLETOS), lida em ${h(info.readAt)} em modo somente consulta: o sistema não altera a planilha.</p>
<h3>Recorte</h3><p>${h(info.scopeLabel)}.</p>
<h3>Privacidade</h3><p>Autor, CPF, RG, telefone, endereço e peticionador são descartados na leitura e não constam deste relatório.</p>
</div><div>
<h3>Cálculos</h3><p><b>Dias em depósito:</b> da data de depósito até hoje para itens apreendidos; até a devolução (ou a quantidade informada na planilha) para itens devolvidos.</p>
<p><b>Processo encerrado com bem apreendido:</b> situação “Apreendido” com andamento ESAJ arquivado, julgado ou devolvido.</p>
<p><b>Depósitos:</b> “CISP - Palmeira dos Índios” corresponde ao Depósito 10º BPM · CISP Palmeira; “Guarda Civil Municipal de Palmeira dos Índios”, ao Depósito GCM.</p>
</div></div>
<div class="signature"><div>Responsável pela análise</div><div>Comandante / Chefe da seção</div></div>
</section>`

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Relatório de materiais apreendidos · 10º BPM</title><style>${STYLE}</style></head><body>${cover}${executive}${charts}${attention}${depotPages}${method}</body></html>`
}

/** Planilha Excel: resumo, indicadores, pontos de atenção, todos os itens e uma aba por depósito. */
export async function exportSeizedWorkbook(items: SeizedItem[], info: SeizedReportInfo): Promise<void> {
  const library = await loadXlsx()
  const book = library.utils.book_new()
  const sheet = (name: string, values: unknown[][]) => library.utils.book_append_sheet(book, library.utils.aoa_to_sheet(values), name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31))
  const data = seizedInsights(items)
  const distribution = (title: string, entries: Entry[]) => {
    const total = entries.reduce((sum, entry) => sum + entry.total, 0)
    return [[title, 'Itens', 'Participação'], ...entries.map(entry => [entry.name, entry.total, total ? Number((entry.total / total).toFixed(4)) : 0]), []]
  }
  const plain = (html: string) => html.replace(/<[^>]+>/g, '')
  sheet('Resumo', [
    ['Relatório de materiais apreendidos · 10º BPM'], [],
    ['Indicador', 'Valor'], ['Itens', data.total], ['Apreendidos', data.seized], ['Devolvidos', data.returned],
    ['Média de dias em depósito (apreendidos)', data.averageDays], ['Mediana de dias em depósito', data.medianDays],
    ['Item mais antigo (dias)', data.oldest], ['Apreendidos há mais de 1 ano', data.overYear],
    ['Processo encerrado com bem apreendido', data.closedWithSeized.length], [],
    ['Principais leituras'], ...seizedFindings(items).map(text => [plain(text)]),
  ])
  sheet('Indicadores', [
    ...distribution('Depósito', countBy(items, item => item.depot)),
    ...distribution('Comarca', countBy(items, item => item.comarca)),
    ...distribution('Categoria', countBy(items, item => item.category)),
    ...distribution('Tempo em depósito (apreendidos)', ageDistribution(items)),
    ...distribution('Andamento ESAJ', countBy(items, item => processStage(item.processStatus))),
    ...distribution('Município do fato', countBy(items, item => item.city)),
  ])
  sheet('Pontos de atenção', [['Processo encerrado no ESAJ com bem ainda apreendido'], REPORT_HEADERS, ...data.closedWithSeized.map(reportRow)])
  sheet('Todos os itens', [REPORT_HEADERS, ...items.map(reportRow)])
  for (const depot of summarizeDepots(items))
    sheet(depot.label.replace('Depósito ', ''), [REPORT_HEADERS, ...items.filter(item => item.depotKey === depot.key).map(reportRow)])
  sheet('Memória', [['Campo', 'Valor'], ['Seleção', info.scopeLabel], ['Itens', items.length],
    ['Leitura da planilha', info.readAt], ['Emissão', new Date().toLocaleString('pt-BR')], ['Responsável', info.author || 'Não informado'],
    ['Sistema', info.version], ['Observação', 'Consulta somente leitura. Dados pessoais dos envolvidos não constam deste arquivo.']])
  library.writeFile(book, `materiais-apreendidos-10bpm-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
