import { escapeHtml } from './report-document'
import { loadXlsx } from './report-spreadsheet'
import { REPORT_HEADERS, reportRow, summarizeDepots, type SeizedItem } from './seized-materials'

const asset = (name: string) => {
  const path = `${import.meta.env.BASE_URL}assets/reports/${name}`
  return typeof location === 'undefined' ? path : new URL(path, location.origin).href
}
const n = (value: number) => value.toLocaleString('pt-BR')

export type SeizedReportInfo = { scopeLabel: string; author: string; version: string; readAt: string }

/** Relatório imprimível (salvar como PDF) agrupado por depósito. */
export function buildSeizedReportHtml(items: SeizedItem[], info: SeizedReportInfo): string {
  const depots = summarizeDepots(items)
  const seized = items.filter(item => item.situation === 'apreendido').length
  const returned = items.filter(item => item.situation === 'devolvido').length
  const kpis = [['Itens no relatório', items.length], ['Apreendidos', seized], ['Devolvidos', returned]]
    .map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${n(value as number)}</strong></article>`).join('')
  const sections = depots.map(depot => {
    const rows = items.filter(item => item.depotKey === depot.key)
    return `<section class="depot"><h2>${escapeHtml(depot.label)}</h2><p class="note">${n(depot.total)} item(ns) · ${n(depot.seized)} apreendido(s) · ${n(depot.returned)} devolvido(s)</p>
<table><thead><tr>${REPORT_HEADERS.map(header => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows.map(item => `<tr>${reportRow(item).map(value => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`
  }).join('') || '<p class="note">Nenhum item atende à seleção.</p>'
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Materiais apreendidos · 10º BPM</title><style>
@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{margin:0;color:#17324d;font:11px/1.45 Segoe UI,Arial,sans-serif;background:#edf2f8}main{max-width:1180px;margin:16px auto;background:#fff;padding:28px;box-shadow:0 4px 24px #1232}
.letterhead{display:flex;align-items:center;gap:16px;border-bottom:4px solid #d5a83e;padding-bottom:12px}.letterhead img{width:64px;height:72px;object-fit:contain}.letterhead strong{display:block;font-size:14px}.letterhead span,.letterhead small{display:block}
h1{font-size:24px;color:#0b335e;margin:16px 0 4px}h2{font-size:16px;color:#0b335e;margin:22px 0 2px;border-bottom:2px solid #d5a83e;padding-bottom:4px}.meta,.note{color:#5d7186}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0}.kpis article{border:1px solid #dbe4ee;border-radius:10px;padding:10px 14px;background:#f7faff}.kpis span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.05em}.kpis strong{font-size:22px;color:#15467a}
table{width:100%;border-collapse:collapse;table-layout:fixed;overflow-wrap:anywhere;margin-top:8px}th,td{border:1px solid #d7e0eb;padding:5px 6px;text-align:left;vertical-align:top}th{background:#eaf0f8;color:#123d72;font-size:10px}thead{display:table-header-group}tr{break-inside:avoid}
th:nth-child(1){width:12%}th:nth-child(2),th:nth-child(3),th:nth-child(10){width:7%}th:nth-child(4){width:7.5%}th:nth-child(5){width:19%}th:nth-child(6){width:10%}th:nth-child(7){width:8%}th:nth-child(8){width:7%}th:nth-child(9){width:9.5%}th:nth-child(11){width:6%}
footer{margin-top:18px;color:#5d7186;font-size:10px}@media print{body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}main{margin:0;padding:0;box-shadow:none;max-width:none}.depot{break-before:auto}}
</style></head><body><main>
<header class="letterhead"><img src="${asset('logo-10bpm-3d-estatistica.png')}" alt="Brasão do 10º BPM"><div><strong>POLÍCIA MILITAR DE ALAGOAS</strong><span>10º Batalhão de Polícia Militar</span><small>Palmeira dos Índios · AL</small></div></header>
<h1>Relatório de materiais apreendidos</h1>
<p class="meta">${escapeHtml(info.scopeLabel)}<br>Emissão: ${escapeHtml(new Date().toLocaleString('pt-BR'))} · Leitura da planilha: ${escapeHtml(info.readAt)} · Responsável: ${escapeHtml(info.author || 'Não informado')} · Sistema ${escapeHtml(info.version)}</p>
<div class="kpis">${kpis}</div>${sections}
<footer>Fonte: planilha de controle de materiais apreendidos do 10º BPM (consulta somente leitura). Dias em depósito: até hoje para itens apreendidos; até a devolução para itens devolvidos. Dados pessoais dos envolvidos não constam deste relatório.</footer>
</main></body></html>`
}

/** Planilha Excel com uma aba por depósito e a memória da seleção. */
export async function exportSeizedWorkbook(items: SeizedItem[], info: SeizedReportInfo): Promise<void> {
  const library = await loadXlsx()
  const book = library.utils.book_new()
  const sheet = (name: string, values: unknown[][]) => library.utils.book_append_sheet(book, library.utils.aoa_to_sheet(values), name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31))
  sheet('Todos os itens', [REPORT_HEADERS, ...items.map(reportRow)])
  for (const depot of summarizeDepots(items))
    sheet(depot.label.replace('Depósito ', ''), [REPORT_HEADERS, ...items.filter(item => item.depotKey === depot.key).map(reportRow)])
  sheet('Memória', [['Campo', 'Valor'], ['Seleção', info.scopeLabel], ['Itens', items.length],
    ['Leitura da planilha', info.readAt], ['Emissão', new Date().toLocaleString('pt-BR')], ['Responsável', info.author || 'Não informado'],
    ['Sistema', info.version], ['Observação', 'Consulta somente leitura. Dados pessoais dos envolvidos não constam deste arquivo.']])
  library.writeFile(book, `materiais-apreendidos-10bpm-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
